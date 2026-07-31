// @vitest-environment node

import { execFile } from "node:child_process";
import {
  generateKeyPairSync,
  verify,
} from "node:crypto";
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(
  process.cwd(),
  "scripts/generate-apple-client-secret.mjs",
);

const teamId = "TEAM123456";
const keyId = "KEY1234567";
const clientId = "com.example.ygf.service";

interface CliFailure extends Error {
  code?: number | string;
  stderr?: string;
  stdout?: string;
}

const temporaryDirectories: string[] = [];

function generateP256KeyPair() {
  return generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
}

async function createFixture(
  keyPair: ReturnType<typeof generateP256KeyPair> =
    generateP256KeyPair(),
) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "ygf-apple-client-secret-"),
  );
  temporaryDirectories.push(directory);

  const { privateKey, publicKey } = keyPair;
  const privateKeyPath = path.join(directory, "AuthKey_TEST.p8");
  const outputPath = path.join(directory, "apple-client-secret.jwt");

  await writeFile(
    privateKeyPath,
    privateKey.export({ format: "pem", type: "pkcs8" }),
    { flag: "wx", mode: 0o600 },
  );

  return {
    outputPath,
    privateKeyPath,
    publicKey,
  };
}

function cliArgs(
  privateKeyPath: string,
  outputPath: string,
  {
    days = 30,
    key = keyId,
    team = teamId,
  }: {
    days?: number | string;
    key?: string;
    team?: string;
  } = {},
) {
  return [
    scriptPath,
    "--team-id",
    team,
    "--key-id",
    key,
    "--client-id",
    clientId,
    "--private-key",
    privateKeyPath,
    "--output",
    outputPath,
    "--days",
    String(days),
  ];
}

function decodeJsonSegment(segment: string) {
  return JSON.parse(
    Buffer.from(segment, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

async function expectArgsFailure(args: string[]) {
  try {
    await execFileAsync(process.execPath, args);
  } catch (error) {
    return error as CliFailure;
  }

  throw new Error("Expected Apple client secret CLI to fail");
}

async function expectCliFailure(
  privateKeyPath: string,
  outputPath: string,
  options: Parameters<typeof cliArgs>[2] = {},
) {
  return expectArgsFailure(
    cliArgs(privateKeyPath, outputPath, options),
  );
}

async function expectNoOutput(outputPath: string) {
  await expect(access(outputPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("generate-apple-client-secret CLI", () => {
  it("writes a private, correctly signed ES256 client secret without printing it", async () => {
    const { outputPath, privateKeyPath, publicKey } =
      await createFixture();
    const beforeSeconds = Math.floor(Date.now() / 1000);

    const { stderr, stdout } = await execFileAsync(
      process.execPath,
      cliArgs(privateKeyPath, outputPath),
    );
    const afterSeconds = Math.floor(Date.now() / 1000);
    const clientSecret = await readFile(outputPath, "utf8");
    const [encodedHeader, encodedClaims, encodedSignature, ...extra] =
      clientSecret.split(".");

    expect(stderr).toBe("");
    expect(extra).toHaveLength(0);
    expect(encodedHeader).toBeTruthy();
    expect(encodedClaims).toBeTruthy();
    expect(encodedSignature).toBeTruthy();

    const header = decodeJsonSegment(encodedHeader!);
    const claims = decodeJsonSegment(encodedClaims!);

    expect(header).toEqual({
      alg: "ES256",
      kid: keyId,
      typ: "JWT",
    });
    expect(claims).toMatchObject({
      aud: "https://appleid.apple.com",
      iss: teamId,
      sub: clientId,
    });
    expect(claims.iat).toEqual(expect.any(Number));
    expect(claims.exp).toEqual(expect.any(Number));

    const issuedAt = claims.iat as number;
    const expiresAt = claims.exp as number;
    expect(issuedAt).toBeGreaterThanOrEqual(beforeSeconds);
    expect(issuedAt).toBeLessThanOrEqual(afterSeconds);
    expect(expiresAt - issuedAt).toBe(30 * 24 * 60 * 60);

    const signature = Buffer.from(encodedSignature!, "base64url");
    expect(signature).toHaveLength(64);
    expect(
      verify(
        "sha256",
        Buffer.from(`${encodedHeader}.${encodedClaims}`),
        { dsaEncoding: "ieee-p1363", key: publicKey },
        signature,
      ),
    ).toBe(true);

    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    expect(stdout).toBe(
      `READY ${outputPath} expires ${new Date(expiresAt * 1000).toISOString()}\n`,
    );
    expect(stdout).not.toContain(clientSecret);
  });

  it("refuses to overwrite an existing client secret", async () => {
    const { outputPath, privateKeyPath } = await createFixture();

    await execFileAsync(
      process.execPath,
      cliArgs(privateKeyPath, outputPath),
    );
    const originalSecret = await readFile(outputPath, "utf8");

    const failure = await expectCliFailure(
      privateKeyPath,
      outputPath,
    );

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain(
      "Apple client secret generation failed:",
    );
    expect(failure.stderr).toContain("EEXIST");
    expect(await readFile(outputPath, "utf8")).toBe(originalSecret);
  });

  it("rejects lifetimes longer than 180 days before writing output", async () => {
    const { outputPath, privateKeyPath } = await createFixture();

    const failure = await expectCliFailure(
      privateKeyPath,
      outputPath,
      { days: 181 },
    );

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain(
      "--days must be an integer between 1 and 180",
    );
    await expectNoOutput(outputPath);
  });

  it.each([
    {
      keyPair: () =>
        generateKeyPairSync("rsa", { modulusLength: 2048 }),
      label: "RSA",
    },
    {
      keyPair: () =>
        generateKeyPairSync("ec", { namedCurve: "secp384r1" }),
      label: "P-384",
    },
  ])("rejects a $label private key", async ({ keyPair }) => {
    const { outputPath, privateKeyPath } = await createFixture(
      keyPair(),
    );

    const failure = await expectCliFailure(
      privateKeyPath,
      outputPath,
    );

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain(
      "Private key must be an EC P-256 (prime256v1) key for ES256",
    );
    await expectNoOutput(outputPath);
  });

  it.each([
    { label: "group-readable", mode: 0o640 },
    { label: "world-readable", mode: 0o604 },
  ])("rejects a $label private key", async ({ mode }) => {
    const { outputPath, privateKeyPath } = await createFixture();
    await chmod(privateKeyPath, mode);

    const failure = await expectCliFailure(
      privateKeyPath,
      outputPath,
    );

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain(
      "Private key must not be readable or writable by group or others",
    );
    await expectNoOutput(outputPath);
  });

  it("rejects a symbolic-link private key", async () => {
    const { outputPath, privateKeyPath } = await createFixture();
    const linkedKeyPath = path.join(
      path.dirname(privateKeyPath),
      "AuthKey_LINK.p8",
    );
    await symlink(privateKeyPath, linkedKeyPath);

    const failure = await expectCliFailure(
      linkedKeyPath,
      outputPath,
    );

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain(
      "Private key must be a regular file and not a symbolic link",
    );
    await expectNoOutput(outputPath);
  });

  it("rejects a tracked repository output path", async () => {
    const { privateKeyPath } = await createFixture();
    const trackedOutputPath = path.join(process.cwd(), "README.md");
    const originalReadme = await readFile(trackedOutputPath, "utf8");

    const failure = await expectCliFailure(
      privateKeyPath,
      trackedOutputPath,
    );

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain(
      "Output path inside this repository must be under ignored private/",
    );
    expect(await readFile(trackedOutputPath, "utf8")).toBe(
      originalReadme,
    );
  });

  it("rejects an unknown flag", async () => {
    const { outputPath, privateKeyPath } = await createFixture();

    const failure = await expectArgsFailure([
      ...cliArgs(privateKeyPath, outputPath),
      "--mystery",
      "value",
    ]);

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain("Unknown argument --mystery");
    await expectNoOutput(outputPath);
  });

  it("rejects a duplicate flag", async () => {
    const { outputPath, privateKeyPath } = await createFixture();

    const failure = await expectArgsFailure([
      ...cliArgs(privateKeyPath, outputPath),
      "--team-id",
      teamId,
    ]);

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain("Duplicate argument --team-id");
    await expectNoOutput(outputPath);
  });

  it.each([
    {
      expected: "Team ID must be exactly 10 uppercase alphanumeric characters",
      options: { team: "team123456" },
    },
    {
      expected: "Key ID must be exactly 10 uppercase alphanumeric characters",
      options: { key: "KEY-123456" },
    },
  ])("rejects an invalid Apple identifier", async ({
    expected,
    options,
  }) => {
    const { outputPath, privateKeyPath } = await createFixture();

    const failure = await expectCliFailure(
      privateKeyPath,
      outputPath,
      options,
    );

    expect(failure.code).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain(expected);
    await expectNoOutput(outputPath);
  });

  it.each(["1e2", "30.0", "+30", "0x1e", "030", " 30"])(
    "rejects a non-decimal --days value of %s",
    async (days) => {
      const { outputPath, privateKeyPath } = await createFixture();

      const failure = await expectCliFailure(
        privateKeyPath,
        outputPath,
        { days },
      );

      expect(failure.code).not.toBe(0);
      expect(failure.stdout).toBe("");
      expect(failure.stderr).toContain(
        "--days must be an integer between 1 and 180",
      );
      await expectNoOutput(outputPath);
    },
  );
});
