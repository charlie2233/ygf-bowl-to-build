#!/usr/bin/env node

import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { lstat, open, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LIFETIME_DAYS = 180;
const MAX_LIFETIME_DAYS = 180;
const ALLOWED_ARGUMENTS = new Set([
  "team-id",
  "key-id",
  "client-id",
  "private-key",
  "output",
  "days",
]);
const APPLE_IDENTIFIER = /^[A-Z0-9]{10}$/;
const CLIENT_IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE_DIRECTORY = resolve(REPOSITORY_ROOT, "private");

function parseArgs(argv) {
  const values = new Map();
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;

  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];

    if (!key?.startsWith("--") || !value) {
      throw new Error(`Invalid argument near ${key ?? "end of input"}`);
    }

    const name = key.slice(2);

    if (!ALLOWED_ARGUMENTS.has(name)) {
      throw new Error(`Unknown argument --${name}`);
    }

    if (values.has(name)) {
      throw new Error(`Duplicate argument --${name}`);
    }

    values.set(name, value);
  }

  return values;
}

function requireArg(args, name) {
  const value = args.get(name)?.trim();

  if (!value) {
    throw new Error(`Missing required --${name}`);
  }

  return value;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function assertAppleIdentifier(value, label) {
  if (!APPLE_IDENTIFIER.test(value)) {
    throw new Error(`${label} must be exactly 10 uppercase alphanumeric characters`);
  }
}

function assertClientIdentifier(value) {
  if (!CLIENT_IDENTIFIER.test(value)) {
    throw new Error("Client ID is not a valid Apple Services ID");
  }
}

function isPathInside(candidate, parent) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
  );
}

async function assertSecureRegularFile(filePath, label) {
  const fileStats = await lstat(filePath);

  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file and not a symbolic link`);
  }

  if (process.platform !== "win32" && (fileStats.mode & 0o077) !== 0) {
    throw new Error(`${label} must not be readable or writable by group or others`);
  }

  await assertSecureDirectory(dirname(filePath), `${label} parent directory`);
}

async function assertSecureDirectory(directoryPath, label) {
  const directoryStats = await lstat(directoryPath);

  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error(`${label} must be a directory and not a symbolic link`);
  }

  if (process.platform !== "win32" && (directoryStats.mode & 0o077) !== 0) {
    throw new Error(`${label} must not be accessible by group or others`);
  }
}

function assertSafeRepositoryPath(filePath, label) {
  if (
    isPathInside(filePath, REPOSITORY_ROOT) &&
    !isPathInside(filePath, PRIVATE_DIRECTORY)
  ) {
    throw new Error(`${label} inside this repository must be under ignored private/`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const teamId = requireArg(args, "team-id");
  const keyId = requireArg(args, "key-id");
  const clientId = requireArg(args, "client-id");
  const privateKeyPath = resolve(requireArg(args, "private-key"));
  const outputPath = resolve(requireArg(args, "output"));
  const lifetimeDaysInput = args.get("days") ?? String(DEFAULT_LIFETIME_DAYS);

  assertAppleIdentifier(teamId, "Team ID");
  assertAppleIdentifier(keyId, "Key ID");
  assertClientIdentifier(clientId);

  if (!/^[1-9][0-9]{0,2}$/.test(lifetimeDaysInput)) {
    throw new Error(`--days must be an integer between 1 and ${MAX_LIFETIME_DAYS}`);
  }

  const lifetimeDays = Number(lifetimeDaysInput);

  if (lifetimeDays > MAX_LIFETIME_DAYS) {
    throw new Error(`--days must be an integer between 1 and ${MAX_LIFETIME_DAYS}`);
  }

  assertSafeRepositoryPath(privateKeyPath, "Private key");
  assertSafeRepositoryPath(outputPath, "Output path");
  await assertSecureRegularFile(privateKeyPath, "Private key");
  await assertSecureDirectory(dirname(outputPath), "Output parent directory");

  const privateKeyPem = await readFile(privateKeyPath, "utf8");
  const privateKey = createPrivateKey(privateKeyPem);

  if (
    privateKey.asymmetricKeyType !== "ec" ||
    privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("Private key must be an EC P-256 (prime256v1) key for ES256");
  }

  const publicKey = createPublicKey(privateKey);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + lifetimeDays * 24 * 60 * 60;
  const encodedHeader = base64UrlJson({ alg: "ES256", kid: keyId, typ: "JWT" });
  const encodedPayload = base64UrlJson({
    iss: teamId,
    iat: issuedAt,
    exp: expiresAt,
    aud: "https://appleid.apple.com",
    sub: clientId,
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  if (signature.byteLength !== 64) {
    throw new Error("Generated ES256 signature must be exactly 64 bytes");
  }

  if (
    !verify(
      "sha256",
      Buffer.from(signingInput),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    )
  ) {
    throw new Error("Generated Apple client secret failed local signature verification");
  }

  const clientSecret = `${signingInput}.${signature.toString("base64url")}`;
  const outputHandle = await open(outputPath, "wx", 0o600);

  try {
    await outputHandle.writeFile(clientSecret, "utf8");
    await outputHandle.chmod(0o600);
    await outputHandle.sync();
  } finally {
    await outputHandle.close();
  }

  process.stdout.write(
    `READY ${outputPath} expires ${new Date(expiresAt * 1000).toISOString()}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Apple client secret generation failed: ${error.message}\n`);
  process.exitCode = 1;
});
