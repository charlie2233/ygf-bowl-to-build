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
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  AVERY_5260,
  AVERY_5260_LIVE_LABEL_COUNT,
  AVERY_5260_LIVE_SHEET_COUNT,
  createPublicAvery5260SampleRows,
  renderAvery5260Pdf,
  renderAvery5260SamplePng,
  serializeAvery5260LabelHtml,
  verifyAvery5260PdfEvidence,
  verifyPrivateAvery5260LabelsFromCsv,
  writePrivateAvery5260LabelsFromCsv,
} from "@/lib/admin/avery-5260-labels";
import {
  buildPrivateClaimRows,
  CODE_ALPHABET,
  generatePrivateRowReferences,
  generateUniqueCodes,
  serializePrivateCodeCsv,
} from "@/lib/admin/code-batch";

const execFileAsync = promisify(execFile);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function createLiveFixture() {
  const codes = generateUniqueCodes(
    AVERY_5260_LIVE_LABEL_COUNT,
  );
  const rowReferences = generatePrivateRowReferences(
    AVERY_5260_LIVE_LABEL_COUNT,
  );
  const claimRows = buildPrivateClaimRows(
    codes,
    "https://build.ygf.example",
    rowReferences,
  );
  return {
    claimRows,
    codes,
    rowReferences,
  };
}

describe("Avery 5260 label production contract", () => {
  it("lays out exactly 500 existing rows across 17 Letter sheets without a private QR", () => {
    const fixture = createLiveFixture();
    const html = serializeAvery5260LabelHtml(
      fixture.claimRows,
      {
        sampleOnly: false,
        sourceCommitment: sha256("private-fixture"),
      },
    );
    const sheets = [
      ...html.matchAll(
        /<section class="avery-sheet"[\s\S]*?<\/section>/g,
      ),
    ].map((match) => match[0]);

    expect(sheets).toHaveLength(
      AVERY_5260_LIVE_SHEET_COUNT,
    );
    expect(
      html.match(/<article class="avery-label"/g),
    ).toHaveLength(AVERY_5260_LIVE_LABEL_COUNT);
    expect(
      sheets.at(-1)?.match(/<article class="avery-label"/g),
    ).toHaveLength(20);
    expect(html).toContain(
      "grid-template-columns: repeat(3, 2.625in)",
    );
    expect(html).toContain(
      "grid-template-rows: repeat(10, 1in)",
    );
    expect(html).toContain("padding: 0.5in 0.1875in");
    expect(html).toContain("column-gap: 0.125in");
    expect(AVERY_5260).toMatchObject({
      codeTextPoints: 18.5,
      contentInsetInches: 0.0625,
      minimumTextPoints: 7,
    });
    expect(html).toContain("padding: 0.0625in 0.08in; border: 0;");
    expect(html).toContain(".label-code { margin: 0.014in 0 0.005in;");
    expect(html).toContain("font-size: 18.5pt");
    expect(html.match(/font-size: 7pt/g)).toHaveLength(4);
    expect(html).not.toContain("border: 0.75pt");
    expect(html).not.toContain("font-size: 6.2pt");
    expect(html).not.toContain("font-size: 5.9pt");
    expect(html).not.toContain("font-size: 5.7pt");
    expect(html).toContain(fixture.codes[0]);
    expect(html).toContain(fixture.rowReferences[0]);
    expect(html).not.toContain("#code=");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("SAMPLE ONLY");
  });

  it("builds one public proof sheet from unique, visibly fake values", () => {
    const rows = createPublicAvery5260SampleRows();
    const html = serializeAvery5260LabelHtml(rows, {
      sampleOnly: true,
      sourceCommitment: sha256(JSON.stringify(rows)),
    });

    expect(rows).toHaveLength(AVERY_5260.labelsPerSheet);
    expect(new Set(rows.map((row) => row.code))).toHaveLength(
      AVERY_5260.labelsPerSheet,
    );
    expect(
      rows.every(
        (row) =>
          row.code.length === 8 &&
          [...row.code].some(
            (character) => !CODE_ALPHABET.includes(character),
          ),
      ),
    ).toBe(true);
    expect(
      html.match(/<section class="avery-sheet"/g),
    ).toHaveLength(1);
    expect(html.match(/SAMPLE ONLY/g)).toHaveLength(
      AVERY_5260.labelsPerSheet,
    );
    expect(html).toContain('data-sample-only="true"');
  });

  it("rejects partial live inventory and a reserved public sample value", () => {
    const fixture = createLiveFixture();
    expect(() =>
      serializeAvery5260LabelHtml(
        fixture.claimRows.slice(0, 499),
        {
          sampleOnly: false,
          sourceCommitment: sha256("partial"),
        },
      ),
    ).toThrow("AVERY_5260_ROWS_INVALID");

    const rowsWithReservedCode = fixture.claimRows.map(
      (row, index) =>
        index === 0 ? { ...row, code: "A7K3B9Q2" } : row,
    );
    expect(() =>
      serializeAvery5260LabelHtml(rowsWithReservedCode, {
        sampleOnly: false,
        sourceCommitment: sha256("reserved"),
      }),
    ).toThrow("AVERY_5260_ROWS_INVALID");
  });

  it("requires exact production token sets on each PDF page", () => {
    const fixture = createLiveFixture();
    const rows = fixture.claimRows.map(
      ({ code, rowReference }) => ({ code, rowReference }),
    );
    const information = [
      "Pages:           17",
      "Encrypted:       no",
      "Page size:       612 x 792 pts (letter)",
      "",
    ].join("\n");
    const toPageText = (
      orderedRows: readonly (typeof rows)[number][],
    ) =>
      Array.from(
        { length: AVERY_5260_LIVE_SHEET_COUNT },
        (_, pageIndex) =>
          orderedRows
            .slice(
              pageIndex * AVERY_5260.labelsPerSheet,
              (pageIndex + 1) * AVERY_5260.labelsPerSheet,
            )
            .map(
              (row) => `${row.code} ${row.rowReference}`,
            )
            .join("\n"),
      ).join("\f");

    expect(() =>
      verifyAvery5260PdfEvidence(
        information,
        toPageText(rows),
        rows,
      ),
    ).not.toThrow();

    const existingCodes = new Set(rows.map((row) => row.code));
    let extraCode = "";
    for (const character of CODE_ALPHABET) {
      const candidate = character.repeat(8);
      if (!existingCodes.has(candidate)) {
        extraCode = candidate;
        break;
      }
    }
    expect(extraCode).not.toBe("");
    expect(() =>
      verifyAvery5260PdfEvidence(
        information,
        `${toPageText(rows)}\n${extraCode} YGF-${extraCode}-9999`,
        rows,
      ),
    ).toThrow("PRIVATE_AVERY_PDF_INVALID");

    const pageSwappedRows = [...rows];
    [pageSwappedRows[0], pageSwappedRows[30]] = [
      pageSwappedRows[30],
      pageSwappedRows[0],
    ];
    expect(() =>
      verifyAvery5260PdfEvidence(
        information,
        toPageText(pageSwappedRows),
        rows,
      ),
    ).toThrow("PRIVATE_AVERY_PDF_INVALID");

    const samePageReferenceSwap = rows.map((row) => ({
      ...row,
    }));
    [
      samePageReferenceSwap[0].rowReference,
      samePageReferenceSwap[1].rowReference,
    ] = [
      samePageReferenceSwap[1].rowReference,
      samePageReferenceSwap[0].rowReference,
    ];
    expect(() =>
      verifyAvery5260PdfEvidence(
        information,
        toPageText(samePageReferenceSwap),
        rows,
      ),
    ).toThrow("PRIVATE_AVERY_PDF_INVALID");
  });

  it("renders the fake proof to one Letter PDF and a 1275x1650 PNG", async () => {
    const rows = createPublicAvery5260SampleRows();
    const html = serializeAvery5260LabelHtml(rows, {
      sampleOnly: true,
      sourceCommitment: sha256(JSON.stringify(rows)),
    });
    const [pdf, png] = await Promise.all([
      renderAvery5260Pdf(html),
      renderAvery5260SamplePng(html),
    ]);
    const directory = await mkdtemp(
      path.join(tmpdir(), "ygf-avery-public-proof-"),
    );
    const pdfPath = path.join(directory, "sample.pdf");
    await writeFile(pdfPath, pdf);
    const [information, extracted] = await Promise.all([
      execFileAsync("pdfinfo", [pdfPath], {
        encoding: "utf8",
      }),
      execFileAsync("pdftotext", ["-layout", pdfPath, "-"], {
        encoding: "utf8",
      }),
    ]);

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(information.stdout).toMatch(/^Pages:\s+1$/m);
    expect(information.stdout).toMatch(
      /^Page size:\s+612 x 792 pts/m,
    );
    expect(extracted.stdout).toContain("SAMPLE01");
    expect(extracted.stdout).toContain("PUBLIC-PROOF-030");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1_275);
    expect(png.readUInt32BE(20)).toBe(1_650);
  });

  it("binds the checked-in fake proof and production-code exclusion in manifests", async () => {
    const averyManifestPath = path.resolve(
      process.cwd(),
      "output/redemption-card/avery-5260-label-manifest.json",
    );
    const staticManifestPath = path.resolve(
      process.cwd(),
      "output/redemption-card/manifest.json",
    );
    const [averyManifestText, staticManifestText] =
      await Promise.all([
        readFile(averyManifestPath, "utf8"),
        readFile(staticManifestPath, "utf8"),
      ]);
    const averyManifest = JSON.parse(averyManifestText) as {
      files: Record<string, string>;
      labelCount: number;
      productionCodesIncluded: boolean;
      productionCsvRead: boolean;
      sampleOnly: boolean;
      sheetCount: number;
    };
    const staticManifest = JSON.parse(staticManifestText) as {
      controls: {
        liveCodesCommitted: boolean;
        sampleCodeReservedFromProduction: boolean;
      };
    };

    expect(averyManifest).toMatchObject({
      labelCount: 30,
      productionCodesIncluded: false,
      productionCsvRead: false,
      sampleOnly: true,
      sheetCount: 1,
    });
    for (const [relativePath, expectedHash] of Object.entries(
      averyManifest.files,
    )) {
      expect(
        sha256(
          await readFile(path.resolve(process.cwd(), relativePath)),
        ),
      ).toBe(expectedHash);
    }
    expect(staticManifest.controls).toMatchObject({
      liveCodesCommitted: false,
      sampleCodeReservedFromProduction: true,
    });
  });

  it("fails closed on a non-500 private CSV before rendering outputs", async () => {
    const cwd = await mkdtemp(
      path.join(tmpdir(), "ygf-avery-private-count-"),
    );
    const privateRoot = path.join(cwd, "private");
    await mkdir(privateRoot, { mode: 0o700 });
    await chmod(privateRoot, 0o700);
    const csvPath = path.join(privateRoot, "partial.csv");
    await writeFile(
      csvPath,
      serializePrivateCodeCsv(
        ["23456789"],
        "https://build.ygf.example",
        ["YGF-23456789-0001"],
      ),
      { mode: 0o600 },
    );
    await chmod(csvPath, 0o600);

    await expect(
      writePrivateAvery5260LabelsFromCsv({
        cwd,
        html: "private/partial.html",
        input: "private/partial.csv",
        pdf: "private/partial.pdf",
      }),
    ).rejects.toThrow("PRIVATE_AVERY_CSV_INVALID");
    await expect(
      access(path.join(privateRoot, "partial.html")),
    ).rejects.toThrow();
    await expect(
      access(path.join(privateRoot, "partial.pdf")),
    ).rejects.toThrow();
  });

  it(
    "publishes and verifies a no-overwrite mode-0600 private bundle",
    async () => {
      const cwd = await mkdtemp(
        path.join(tmpdir(), "ygf-avery-private-bundle-"),
      );
      const privateRoot = path.join(cwd, "private");
      await mkdir(privateRoot, { mode: 0o700 });
      await chmod(privateRoot, 0o700);
      const fixture = createLiveFixture();
      const csv = serializePrivateCodeCsv(
        fixture.codes,
        "https://build.ygf.example",
        fixture.rowReferences,
      );
      const csvPath = path.join(privateRoot, "batch.csv");
      await writeFile(csvPath, csv, { mode: 0o600 });
      await chmod(csvPath, 0o600);
      const options = {
        cwd,
        html: "private/batch.avery.html",
        input: "private/batch.csv",
        pdf: "private/batch.avery.pdf",
      };

      const rendered =
        await writePrivateAvery5260LabelsFromCsv(options);
      const verified =
        await verifyPrivateAvery5260LabelsFromCsv(options);
      expect(rendered).toEqual(verified);
      expect(rendered.labelCount).toBe(500);
      expect(rendered.sheetCount).toBe(17);
      expect(
        (
          await stat(
            path.join(privateRoot, "batch.avery.html"),
          )
        ).mode & 0o777,
      ).toBe(0o600);
      expect(
        (
          await stat(
            path.join(privateRoot, "batch.avery.pdf"),
          )
        ).mode & 0o777,
      ).toBe(0o600);

      await expect(
        writePrivateAvery5260LabelsFromCsv(options),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(
        (await readdir(privateRoot)).filter((name) =>
          name.endsWith(".tmp"),
        ),
      ).toEqual([]);
      expect(await readFile(csvPath, "utf8")).toBe(csv);
    },
    20_000,
  );

  it("contains no code-generation or count option in the merge command", async () => {
    const [script, renderer] = await Promise.all([
      readFile(
        path.resolve(
          process.cwd(),
          "scripts/render-avery-5260-labels.mts",
        ),
        "utf8",
      ),
      readFile(
        path.resolve(
          process.cwd(),
          "lib/admin/avery-5260-labels.ts",
        ),
        "utf8",
      ),
    ]);
    const productionPath = `${script}\n${renderer}`;

    expect(productionPath).not.toContain("generateUniqueCodes");
    expect(productionPath).not.toContain("randomInt");
    expect(script).not.toContain('"--count"');
    expect(script).toContain('"--input"');
    expect(script).toContain('"--verify-only"');
  });
});
