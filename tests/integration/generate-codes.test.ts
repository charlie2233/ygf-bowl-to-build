import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import {
  buildPrivateClaimRows,
  CODE_ALPHABET,
  generatePrivateRowReferences,
  generateUniqueCodes,
  serializePrivateCodeCsv,
} from "@/lib/admin/code-batch";
import {
  parsePrivateCodeCsv,
  writePrivateClaimSheetFromCsv,
} from "@/lib/admin/code-generator";
import { hashCode } from "@/lib/campaign/code";

const execFileAsync = promisify(execFile);

function readQrGeometry(svg: string) {
  const group = svg.match(
    /<g data-qr-url="([^"]+)" data-qr-modules="(\d+)" data-qr-quiet-zone="(\d+)">([\s\S]*?)<\/g>/,
  );
  if (!group) {
    throw new Error("Private claim artwork is missing QR geometry.");
  }

  const [, encodedUrl, moduleCountText, quietZoneText, body] =
    group;
  const modules = [
    ...body.matchAll(
      /<rect class="qr-module" x="(\d+)" y="(\d+)" width="1" height="1"\/>/g,
    ),
  ].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
  return {
    moduleCount: Number(moduleCountText),
    modules,
    quietZone: Number(quietZoneText),
    url: encodedUrl.replaceAll("&amp;", "&"),
  };
}

function decodeQrFromSvg(svg: string) {
  const qr = readQrGeometry(svg);
  const scale = 8;
  const width =
    (qr.moduleCount + qr.quietZone * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  pixels.fill(255);

  for (const qrModule of qr.modules) {
    for (
      let offsetY = 0;
      offsetY < scale;
      offsetY += 1
    ) {
      for (
        let offsetX = 0;
        offsetX < scale;
        offsetX += 1
      ) {
        const x = qrModule.x * scale + offsetX;
        const y = qrModule.y * scale + offsetY;
        const index = (y * width + x) * 4;
        pixels[index] = 0;
        pixels[index + 1] = 0;
        pixels[index + 2] = 0;
        pixels[index + 3] = 255;
      }
    }
  }

  return {
    decoded: jsQR(pixels, width, width, {
      inversionAttempts: "dontInvert",
    })?.data,
    qr,
  };
}

function readEmbeddedClaimSvgs(html: string) {
  return [
    ...html.matchAll(
      /<img class="claim-row"[^>]+src="data:image\/svg\+xml;base64,([^"]+)"/g,
    ),
  ].map((match) =>
    Buffer.from(match[1], "base64").toString("utf8"),
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function createAdminCsvFixture(options: {
  codes?: readonly string[];
  cwd: string;
  filename?: string;
  rowReferences?: readonly string[];
}) {
  const codes = options.codes ?? [
    "23456789",
    "ABCDEFGH",
    "JKMNPQRS",
  ];
  const rowReferences =
    options.rowReferences ??
    generatePrivateRowReferences(codes.length, () => 0);
  const csv = serializePrivateCodeCsv(
    codes,
    "https://build.ygf.example",
    rowReferences,
  );
  const privateDirectory = path.join(options.cwd, "private");
  const source = path.join(
    privateDirectory,
    options.filename ?? "admin-download.csv",
  );
  await mkdir(privateDirectory, {
    mode: 0o700,
    recursive: true,
  });
  await chmod(privateDirectory, 0o700);
  await writeFile(source, csv, { mode: 0o600 });
  await chmod(source, 0o600);
  return {
    codes,
    csv,
    rowReferences,
    source,
  };
}

describe("private promo-code inventory contract", () => {
  it("generates cryptographically sourced, unique, unambiguous codes", () => {
    const codes = generateUniqueCodes(300);

    expect(codes).toHaveLength(300);
    expect(new Set(codes)).toHaveLength(300);
    expect(codes.every((code) => code.length === 8)).toBe(true);
    expect(
      codes.every((code) =>
        [...code].every((character) =>
          CODE_ALPHABET.includes(character),
        ),
      ),
    ).toBe(true);
    expect(codes.join("")).not.toMatch(/[01ILO]/);
  });

  it("fails closed when a random source cannot produce unique codes", () => {
    expect(() =>
      generateUniqueCodes(2, () => 0),
    ).toThrow("UNIQUE_CODE_GENERATION_FAILED");
  });

  it("creates non-secret batch row references with an approved alphabet and ordinal", () => {
    const indexes = [0, 1, 2, 3, 4, 5, 6, 7];
    const references = generatePrivateRowReferences(
      3,
      () => indexes.shift() ?? 0,
    );

    expect(references).toEqual([
      "YGF-23456789-0001",
      "YGF-23456789-0002",
      "YGF-23456789-0003",
    ]);
    expect(new Set(references)).toHaveLength(3);
  });

  it("serializes the exact admin download and preserves code-to-hash inventory identity", async () => {
    const codes = ["23456789", "ABCDEFGH"];
    const rowReferences = [
      "YGF-JKMNPQRS-0001",
      "YGF-JKMNPQRS-0002",
    ];
    const storedCodeHashes = await Promise.all(
      codes.map(hashCode),
    );
    const csv = serializePrivateCodeCsv(
      codes,
      "https://build.ygf.example",
      rowReferences,
    );
    const rows = parsePrivateCodeCsv(csv);

    expect(csv.split("\n")[0]).toBe(
      "row_reference,code,claim_url",
    );
    expect(rows).toEqual([
      {
        claimUrl:
          "https://build.ygf.example/redeem#code=23456789",
        code: "23456789",
        rowReference: "YGF-JKMNPQRS-0001",
      },
      {
        claimUrl:
          "https://build.ygf.example/redeem#code=ABCDEFGH",
        code: "ABCDEFGH",
        rowReference: "YGF-JKMNPQRS-0002",
      },
    ]);
    await expect(
      Promise.all(rows.map((row) => hashCode(row.code))),
    ).resolves.toEqual(storedCodeHashes);
    expect(
      JSON.stringify(storedCodeHashes),
    ).not.toContain(codes[0]);
  });

  it("rejects non-HTTPS origins, malformed references, and code/URL mismatches", () => {
    expect(() =>
      buildPrivateClaimRows(
        ["23456789"],
        "http://localhost:3000",
        ["YGF-JKMNPQRS-0001"],
      ),
    ).toThrow("PUBLIC_ORIGIN_INVALID");
    expect(() =>
      serializePrivateCodeCsv(
        ["23456789"],
        "https://build.ygf.example",
        ["YGF-BAD-0001"],
      ),
    ).toThrow("PRIVATE_ROW_REFERENCE_INVALID");
    expect(() =>
      serializePrivateCodeCsv(
        ["23456789", "ABCDEFGH"],
        "https://build.ygf.example",
        [
          "YGF-JKMNPQRS-0001",
          "YGF-ABCDEFGH-0002",
        ],
      ),
    ).toThrow("PRIVATE_ROW_REFERENCE_INVALID");

    const valid = serializePrivateCodeCsv(
      ["23456789"],
      "https://build.ygf.example",
      ["YGF-JKMNPQRS-0001"],
    );
    expect(() =>
      parsePrivateCodeCsv(
        valid.replace("#code=23456789", "#code=ABCDEFGH"),
      ),
    ).toThrow("PRIVATE_CSV_INVALID");
  });
});

describe("print-only private claim sheet pipeline", () => {
  it("renders every existing admin CSV row with matching text, reference, and decoded QR", async () => {
    const cwd = await mkdtemp(
      path.join(tmpdir(), "ygf-private-print-"),
    );
    const fixture = await createAdminCsvFixture({ cwd });
    const sourceHashBefore = sha256(fixture.csv);
    const result = await writePrivateClaimSheetFromCsv({
      cwd,
      input: "private/admin-download.csv",
      out: "private/admin-download.claims.html",
    });
    const [sourceAfter, printSheet] = await Promise.all([
      readFile(fixture.source, "utf8"),
      readFile(result.destination, "utf8"),
    ]);
    const claimSvgs = readEmbeddedClaimSvgs(printSheet);

    expect(result.rowCount).toBe(fixture.codes.length);
    expect(sha256(sourceAfter)).toBe(sourceHashBefore);
    expect(
      (await stat(result.destination)).mode & 0o777,
    ).toBe(0o600);
    expect(printSheet).toContain("size: letter portrait");
    expect(claimSvgs).toHaveLength(fixture.codes.length);

    claimSvgs.forEach((claimSvg, index) => {
      const code = fixture.codes[index];
      const rowReference = fixture.rowReferences[index];
      const expected =
        `https://build.ygf.example/redeem#code=${code}`;
      const { decoded, qr } = decodeQrFromSvg(claimSvg);

      expect(claimSvg).toContain('width="3.5in"');
      expect(claimSvg).toContain(`>${code}<`);
      expect(claimSvg).toContain(
        `data-row-reference="${rowReference}"`,
      );
      expect(claimSvg).toContain(`ROW REF: ${rowReference}`);
      expect(qr.quietZone).toBeGreaterThanOrEqual(4);
      expect(qr.url).toBe(expected);
      expect(decoded).toBe(expected);
    });
  });

  it("contains no code-generation or randomness path in the printer", async () => {
    const [script, printer] = await Promise.all([
      readFile(
        path.resolve(
          process.cwd(),
          "scripts/render-private-claims.mts",
        ),
        "utf8",
      ),
      readFile(
        path.resolve(
          process.cwd(),
          "lib/admin/code-generator.ts",
        ),
        "utf8",
      ),
    ]);
    const printerSource = `${script}\n${printer}`;

    expect(printerSource).not.toContain("generateUniqueCodes");
    expect(printerSource).not.toContain("randomInt");
    expect(script).not.toContain("--count");
    expect(script).toContain("--input");
  });

  it("uses an atomic no-overwrite publish and cleans temporary files on collision or pre-publish failure", async () => {
    const cwd = await mkdtemp(
      path.join(tmpdir(), "ygf-private-atomic-"),
    );
    await createAdminCsvFixture({ cwd });
    const privateDirectory = path.join(cwd, "private");
    const existing = path.join(
      privateDirectory,
      "existing.claims.html",
    );
    await writeFile(existing, "existing", { mode: 0o600 });

    await expect(
      writePrivateClaimSheetFromCsv({
        cwd,
        input: "private/admin-download.csv",
        out: "private/existing.claims.html",
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(existing, "utf8")).toBe("existing");
    expect(
      (await readdir(privateDirectory)).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);

    const interrupted = path.join(
      privateDirectory,
      "interrupted.claims.html",
    );
    await expect(
      writePrivateClaimSheetFromCsv(
        {
          cwd,
          input: "private/admin-download.csv",
          out: "private/interrupted.claims.html",
        },
        {
          beforePublish: () => {
            throw new Error("SIMULATED_PRE_PUBLISH_CRASH");
          },
        },
      ),
    ).rejects.toThrow("SIMULATED_PRE_PUBLISH_CRASH");
    await expect(access(interrupted)).rejects.toThrow();
    expect(
      (await readdir(privateDirectory)).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });

  it("CLI consumes the exact admin CSV, writes only HTML, and never prints secrets", async () => {
    const cwd = await mkdtemp(
      path.join(tmpdir(), "ygf-private-cli-"),
    );
    const fixture = await createAdminCsvFixture({ cwd });
    const sourceHashBefore = sha256(fixture.csv);
    const script = path.resolve(
      process.cwd(),
      "scripts/render-private-claims.mts",
    );
    const { stderr, stdout } = await execFileAsync(
      process.execPath,
      [
        script,
        "--input",
        "private/admin-download.csv",
        "--out",
        "private/cli.claims.html",
      ],
      { cwd },
    );
    const sourceAfter = await readFile(
      fixture.source,
      "utf8",
    );
    const printDestination = path.join(
      cwd,
      "private/cli.claims.html",
    );

    expect(stdout).toContain(String(fixture.codes.length));
    expect(stdout).not.toContain(fixture.source);
    expect(stdout).not.toContain(printDestination);
    expect(sha256(sourceAfter)).toBe(sourceHashBefore);
    expect(
      readEmbeddedClaimSvgs(
        await readFile(printDestination, "utf8"),
      ),
    ).toHaveLength(fixture.codes.length);
    for (const secret of fixture.codes) {
      expect(stdout).not.toContain(secret);
      expect(stderr).not.toContain(secret);
    }
  });

  it("rejects non-private paths and malformed admin downloads before creating output", async () => {
    const cwd = await mkdtemp(
      path.join(tmpdir(), "ygf-private-invalid-"),
    );
    await createAdminCsvFixture({ cwd });

    await expect(
      writePrivateClaimSheetFromCsv({
        cwd,
        input: "private/admin-download.csv",
        out: "leaked.html",
      }),
    ).rejects.toThrow("PRIVATE_OUTPUT_REQUIRED");
    await writeFile(
      path.join(cwd, "private/malformed.csv"),
      "code,claim_url\n",
      { mode: 0o600 },
    );
    await expect(
      writePrivateClaimSheetFromCsv({
        cwd,
        input: "private/malformed.csv",
        out: "private/malformed.claims.html",
      }),
    ).rejects.toThrow("PRIVATE_CSV_INVALID");
    await expect(
      access(path.join(cwd, "private/malformed.claims.html")),
    ).rejects.toThrow();
  });

  it("rejects a permissive private root before writing output", async () => {
    const cwd = await mkdtemp(
      path.join(tmpdir(), "ygf-private-permissions-"),
    );
    await createAdminCsvFixture({ cwd });
    const privateDirectory = path.join(cwd, "private");
    const destination = path.join(
      privateDirectory,
      "permissive.claims.html",
    );
    await chmod(privateDirectory, 0o755);

    await expect(
      writePrivateClaimSheetFromCsv({
        cwd,
        input: "private/admin-download.csv",
        out: "private/permissive.claims.html",
      }),
    ).rejects.toThrow("PRIVATE_OUTPUT_REQUIRED");
    await expect(access(destination)).rejects.toThrow();
    expect(await readdir(privateDirectory)).toEqual([
      "admin-download.csv",
    ]);
  });

  it("rejects nested private output before a symlink can create external directories", async () => {
    const cwd = await mkdtemp(
      path.join(tmpdir(), "ygf-private-nested-"),
    );
    await createAdminCsvFixture({ cwd });
    const privateDirectory = path.join(cwd, "private");
    const externalDirectory = await mkdtemp(
      path.join(tmpdir(), "ygf-private-external-"),
    );
    await symlink(
      externalDirectory,
      path.join(privateDirectory, "nested"),
      "dir",
    );

    await expect(
      writePrivateClaimSheetFromCsv({
        cwd,
        input: "private/admin-download.csv",
        out: "private/nested/created/leak.claims.html",
      }),
    ).rejects.toThrow("PRIVATE_OUTPUT_REQUIRED");
    await expect(
      access(path.join(externalDirectory, "created")),
    ).rejects.toThrow();
    expect(await readdir(externalDirectory)).toEqual([]);
  });
});
