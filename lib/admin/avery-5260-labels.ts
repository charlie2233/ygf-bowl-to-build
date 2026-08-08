import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  type FileHandle,
  lstat,
  link,
  mkdir,
  open,
  realpath,
  unlink,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

import { chromium } from "@playwright/test";

// @ts-expect-error Node 22's type-stripping runtime requires the source extension.
import { CODE_ALPHABET, RESERVED_PUBLIC_SAMPLE_CODES } from "./code-batch.ts";
// @ts-expect-error Node 22's type-stripping runtime requires the source extension.
import { parsePrivateCodeCsv } from "./code-generator.ts";

const execFileAsync = promisify(execFile);
const MAX_PRIVATE_CSV_BYTES = 2 * 1024 * 1024;
const MAX_PRIVATE_HTML_BYTES = 8 * 1024 * 1024;
const MAX_PRIVATE_PDF_BYTES = 64 * 1024 * 1024;
const MAX_TEMP_ATTEMPTS = 128;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_ROOT_MODE = 0o700;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const LIVE_ROW_REFERENCE_PATTERN = new RegExp(
  `^YGF-([${CODE_ALPHABET}]{8})-([0-9]{4})$`,
);
const LIVE_CODE_PATTERN = new RegExp(
  `^[${CODE_ALPHABET}]{8}$`,
);
const SAMPLE_CODE_PATTERN = /^SAMPLE(?:0[1-9]|[12][0-9]|30)$/;
const SAMPLE_ROW_REFERENCE_PATTERN = /^PUBLIC-PROOF-([0-9]{3})$/;

let temporaryFileSequence = 0;

export const AVERY_5260 = Object.freeze({
  columns: 3,
  columnGapInches: 0.125,
  labelHeightInches: 1,
  labelWidthInches: 2.625,
  labelsPerSheet: 30,
  pageHeightInches: 11,
  pageWidthInches: 8.5,
  rows: 10,
  sideMarginInches: 0.1875,
  topMarginInches: 0.5,
});

export const AVERY_5260_LIVE_LABEL_COUNT = 500;
export const AVERY_5260_LIVE_SHEET_COUNT = 17;
export const AVERY_5260_SAMPLE_LABEL_COUNT = 30;

export interface Avery5260LabelRow {
  code: string;
  rowReference: string;
}

export interface Avery5260SerializeOptions {
  sampleOnly: boolean;
  sourceCommitment: string;
}

export interface PrivateAvery5260Options {
  cwd?: string;
  html: string;
  input: string;
  pdf: string;
}

export interface PrivateAvery5260Result {
  htmlSha256: string;
  labelCount: number;
  pdfSha256: string;
  sheetCount: number;
  sourceSha256: string;
}

interface ResolvedPrivateFile {
  destination: string;
  privateRoot: string;
}

interface TemporaryArtifact {
  destination: string;
  handle: FileHandle;
  temporaryPath: string;
}

interface PublishedArtifact {
  destination: string;
  device: number;
  inode: number;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function validateRows(
  rows: readonly Avery5260LabelRow[],
  sampleOnly: boolean,
): void {
  const expectedCount = sampleOnly
    ? AVERY_5260_SAMPLE_LABEL_COUNT
    : AVERY_5260_LIVE_LABEL_COUNT;
  if (
    rows.length !== expectedCount ||
    new Set(rows.map((row) => row.code)).size !== rows.length ||
    new Set(rows.map((row) => row.rowReference)).size !== rows.length
  ) {
    throw new Error("AVERY_5260_ROWS_INVALID");
  }

  if (sampleOnly) {
    rows.forEach((row, index) => {
      const reference = SAMPLE_ROW_REFERENCE_PATTERN.exec(
        row.rowReference,
      );
      if (
        !SAMPLE_CODE_PATTERN.test(row.code) ||
        LIVE_CODE_PATTERN.test(row.code) ||
        !reference ||
        Number(reference[1]) !== index + 1
      ) {
        throw new Error("AVERY_5260_SAMPLE_ROWS_INVALID");
      }
    });
    return;
  }

  let batchReference: string | undefined;
  rows.forEach((row, index) => {
    const reference = LIVE_ROW_REFERENCE_PATTERN.exec(
      row.rowReference,
    );
    if (
      !LIVE_CODE_PATTERN.test(row.code) ||
      RESERVED_PUBLIC_SAMPLE_CODES.has(row.code) ||
      !reference ||
      Number(reference[2]) !== index + 1
    ) {
      throw new Error("AVERY_5260_ROWS_INVALID");
    }
    batchReference ??= reference[1];
    if (reference[1] !== batchReference) {
      throw new Error("AVERY_5260_ROWS_INVALID");
    }
  });
}

function labelMarkup(
  row: Avery5260LabelRow,
  index: number,
  sampleOnly: boolean,
): string {
  const sampleMarker = sampleOnly
    ? '<strong class="sample-marker">示例 · SAMPLE ONLY</strong>'
    : '<span class="custody-warning">请妥善保管 · KEEP PRIVATE</span>';
  return [
    `<article class="avery-label${sampleOnly ? " sample-label" : ""}" data-label-index="${index + 1}">`,
    '<div class="label-heading">兑换码 · REDEMPTION CODE</div>',
    `<div class="label-code">${escapeHtml(row.code)}</div>`,
    '<div class="label-rule">每张卡仅兑换一次 · ONE CLAIM PER CARD</div>',
    `<div class="label-reference">ROW REF: ${escapeHtml(row.rowReference)}</div>`,
    sampleMarker,
    "</article>",
  ].join("");
}

export function createPublicAvery5260SampleRows(): readonly Avery5260LabelRow[] {
  return Array.from(
    { length: AVERY_5260_SAMPLE_LABEL_COUNT },
    (_, index) => ({
      code: `SAMPLE${String(index + 1).padStart(2, "0")}`,
      rowReference: `PUBLIC-PROOF-${String(index + 1).padStart(3, "0")}`,
    }),
  );
}

export function serializeAvery5260LabelHtml(
  rows: readonly Avery5260LabelRow[],
  options: Avery5260SerializeOptions,
): string {
  if (!SHA256_PATTERN.test(options.sourceCommitment)) {
    throw new Error("AVERY_5260_SOURCE_COMMITMENT_INVALID");
  }
  validateRows(rows, options.sampleOnly);

  const sheets: string[] = [];
  for (
    let index = 0;
    index < rows.length;
    index += AVERY_5260.labelsPerSheet
  ) {
    const sheetRows = rows.slice(
      index,
      index + AVERY_5260.labelsPerSheet,
    );
    sheets.push(
      [
        `<section class="avery-sheet" aria-label="${options.sampleOnly ? "Public sample" : "Private production"} Avery 5260 sheet ${sheets.length + 1}">`,
        sheetRows
          .map((row, rowIndex) =>
            labelMarkup(row, index + rowIndex, options.sampleOnly),
          )
          .join("\n"),
        "</section>",
      ].join("\n"),
    );
  }

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="robots" content="noindex,nofollow">',
    `<meta name="ygf-source-sha256" content="${options.sourceCommitment}">`,
    `<meta name="ygf-sample-only" content="${String(options.sampleOnly)}">`,
    "<title>YGF Avery 5260 redemption-code labels</title>",
    "<style>",
    "@page { size: 8.5in 11in; margin: 0; }",
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; background: #fff; }",
    "body { color: #16261f; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans CJK SC', Helvetica, Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }",
    ".avery-sheet { width: 8.5in; height: 11in; padding: 0.5in 0.1875in; display: grid; grid-template-columns: repeat(3, 2.625in); grid-template-rows: repeat(10, 1in); column-gap: 0.125in; row-gap: 0; align-content: start; overflow: hidden; break-after: page; page-break-after: always; }",
    ".avery-sheet:last-child { break-after: auto; page-break-after: auto; }",
    ".avery-label { width: 2.625in; height: 1in; padding: 0.055in 0.07in 0.045in; border: 0.75pt solid #d84a32; border-radius: 0.055in; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }",
    ".label-heading { color: #d84a32; font-size: 7.4pt; font-weight: 900; line-height: 1.05; }",
    ".label-code { margin: 0.018in 0 0.009in; font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace; font-size: 19.5pt; font-weight: 900; line-height: 1; white-space: nowrap; }",
    ".label-rule { font-size: 6.2pt; font-weight: 800; line-height: 1.05; white-space: nowrap; }",
    ".label-reference { margin-top: 0.012in; font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace; font-size: 5.9pt; font-weight: 700; line-height: 1.05; white-space: nowrap; }",
    ".custody-warning, .sample-marker { margin-top: 0.009in; font-size: 5.7pt; font-weight: 900; line-height: 1; white-space: nowrap; }",
    ".custody-warning { color: #667868; }",
    ".sample-label { border-style: dashed; background: #fffaf0; }",
    ".sample-marker { color: #d84a32; }",
    "</style>",
    "</head>",
    `<body data-avery-5260="true" data-sample-only="${String(options.sampleOnly)}" data-label-count="${rows.length}">`,
    sheets.join("\n"),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

async function newOfflinePage(options?: {
  deviceScaleFactor?: number;
  viewport?: { height: number; width: number };
}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: options?.deviceScaleFactor,
    offline: true,
    viewport: options?.viewport,
  });
  const page = await context.newPage();
  await page.route("**/*", (route) => route.abort());
  return { browser, page };
}

export async function renderAvery5260Pdf(
  html: string,
): Promise<Buffer> {
  const { browser, page } = await newOfflinePage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    return Buffer.from(
      await page.pdf({
        height: "11in",
        margin: {
          bottom: "0in",
          left: "0in",
          right: "0in",
          top: "0in",
        },
        preferCSSPageSize: true,
        printBackground: true,
        width: "8.5in",
      }),
    );
  } finally {
    await browser.close();
  }
}

export async function renderAvery5260SamplePng(
  html: string,
): Promise<Buffer> {
  const width = 816;
  const height = 1_056;
  const { browser, page } = await newOfflinePage({
    deviceScaleFactor: 1.5625,
    viewport: { height, width },
  });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "screen" });
    return Buffer.from(
      await page.screenshot({
        animations: "disabled",
        clip: { height, width, x: 0, y: 0 },
        type: "png",
      }),
    );
  } finally {
    await browser.close();
  }
}

function resolvePrivateFile(
  cwd: string,
  value: string,
  extension: ".csv" | ".html" | ".pdf",
): ResolvedPrivateFile {
  if (
    typeof value !== "string" ||
    path.isAbsolute(value) ||
    value.includes("\\")
  ) {
    throw new Error("PRIVATE_AVERY_PATH_INVALID");
  }
  const segments = value.split("/");
  if (
    segments.length !== 2 ||
    segments[0] !== "private" ||
    segments.some(
      (segment) =>
        segment === "" || segment === "." || segment === "..",
    ) ||
    path.extname(value).toLowerCase() !== extension
  ) {
    throw new Error("PRIVATE_AVERY_PATH_INVALID");
  }
  const privateRoot = path.resolve(cwd, "private");
  const destination = path.resolve(cwd, value);
  if (path.dirname(destination) !== privateRoot) {
    throw new Error("PRIVATE_AVERY_PATH_INVALID");
  }
  return { destination, privateRoot };
}

async function ensurePrivateRoot(privateRoot: string): Promise<void> {
  try {
    await mkdir(privateRoot, { mode: PRIVATE_ROOT_MODE });
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw new Error("PRIVATE_AVERY_PATH_INVALID");
    }
  }
  const privateStat = await lstat(privateRoot).catch(() => {
    throw new Error("PRIVATE_AVERY_PATH_INVALID");
  });
  if (
    privateStat.isSymbolicLink() ||
    !privateStat.isDirectory() ||
    (privateStat.mode & 0o077) !== 0
  ) {
    throw new Error("PRIVATE_AVERY_PATH_INVALID");
  }
  await realpath(privateRoot).catch(() => {
    throw new Error("PRIVATE_AVERY_PATH_INVALID");
  });
}

async function validatePrivateInput(
  source: string,
): Promise<void> {
  const sourceStat = await lstat(source).catch(() => {
    throw new Error("PRIVATE_AVERY_CSV_INVALID");
  });
  if (
    sourceStat.isSymbolicLink() ||
    !sourceStat.isFile() ||
    sourceStat.size > MAX_PRIVATE_CSV_BYTES ||
    (sourceStat.mode & 0o077) !== 0
  ) {
    throw new Error("PRIVATE_AVERY_CSV_INVALID");
  }
}

async function validatePrivateArtifact(
  destination: string,
  maximumBytes: number,
): Promise<void> {
  const artifactStat = await lstat(destination).catch(() => {
    throw new Error("PRIVATE_AVERY_ARTIFACT_INVALID");
  });
  if (
    artifactStat.isSymbolicLink() ||
    !artifactStat.isFile() ||
    artifactStat.size < 1 ||
    artifactStat.size > maximumBytes ||
    (artifactStat.mode & 0o077) !== 0
  ) {
    throw new Error("PRIVATE_AVERY_ARTIFACT_INVALID");
  }
}

async function readNoFollow(
  filename: string,
  maximumBytes: number,
): Promise<Buffer> {
  let handle: FileHandle;
  try {
    handle = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new Error("PRIVATE_AVERY_ARTIFACT_INVALID");
  }
  try {
    const fileStat = await handle.stat();
    if (
      !fileStat.isFile() ||
      fileStat.size < 1 ||
      fileStat.size > maximumBytes
    ) {
      throw new Error("PRIVATE_AVERY_ARTIFACT_INVALID");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function openTemporaryOutput(
  destination: string,
): Promise<TemporaryArtifact> {
  const parent = path.dirname(destination);
  const basename = path.basename(destination);
  for (
    let attempt = 0;
    attempt < MAX_TEMP_ATTEMPTS;
    attempt += 1
  ) {
    const sequence = temporaryFileSequence;
    temporaryFileSequence += 1;
    const temporaryPath = path.join(
      parent,
      `.${basename}.${process.pid}.${sequence}.tmp`,
    );
    try {
      const handle = await open(
        temporaryPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        PRIVATE_FILE_MODE,
      );
      return { destination, handle, temporaryPath };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("PRIVATE_AVERY_TEMP_UNAVAILABLE");
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function unlinkPublishedArtifact(
  published: PublishedArtifact,
): Promise<void> {
  const current = await lstat(published.destination).catch(
    () => undefined,
  );
  if (
    current &&
    !current.isSymbolicLink() &&
    current.isFile() &&
    current.dev === published.device &&
    current.ino === published.inode
  ) {
    await unlink(published.destination).catch(() => undefined);
  }
}

async function publishPrivateBundle(
  artifacts: readonly Readonly<{
    bytes: Buffer;
    destination: string;
  }>[],
  validateTemporary: (
    temporaryByDestination: ReadonlyMap<string, string>,
  ) => Promise<void>,
  validatePublished: () => Promise<void>,
): Promise<void> {
  const temporary: TemporaryArtifact[] = [];
  const published: PublishedArtifact[] = [];
  try {
    for (const artifact of artifacts) {
      const opened = await openTemporaryOutput(
        artifact.destination,
      );
      let closed = false;
      try {
        await opened.handle.writeFile(artifact.bytes);
        await opened.handle.chmod(PRIVATE_FILE_MODE);
        await opened.handle.sync();
        await opened.handle.close();
        closed = true;
      } finally {
        if (!closed) {
          await opened.handle.close().catch(() => undefined);
        }
      }
      temporary.push(opened);
    }

    await validateTemporary(
      new Map(
        temporary.map((artifact) => [
          artifact.destination,
          artifact.temporaryPath,
        ]),
      ),
    );

    for (const artifact of temporary) {
      await link(artifact.temporaryPath, artifact.destination);
      const linked = await lstat(artifact.temporaryPath);
      published.push({
        destination: artifact.destination,
        device: linked.dev,
        inode: linked.ino,
      });
    }
    await validatePublished();
    await syncDirectory(path.dirname(artifacts[0].destination));
  } catch (error) {
    for (const artifact of [...published].reverse()) {
      await unlinkPublishedArtifact(artifact);
    }
    if (artifacts[0]) {
      await syncDirectory(
        path.dirname(artifacts[0].destination),
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    for (const artifact of temporary) {
      await unlink(artifact.temporaryPath).catch(
        () => undefined,
      );
    }
  }
}

export function verifyAvery5260PdfEvidence(
  information: string,
  text: string,
  rows: readonly Avery5260LabelRow[],
): void {
  const pageMatch = /^Pages:\s+([0-9]+)$/m.exec(information);
  const sizeMatch =
    /^Page size:\s+([0-9.]+) x ([0-9.]+) pts/m.exec(
      information,
    );
  if (
    Number(pageMatch?.[1]) !== AVERY_5260_LIVE_SHEET_COUNT ||
    Number(sizeMatch?.[1]) !== 612 ||
    Number(sizeMatch?.[2]) !== 792 ||
    !/^Encrypted:\s+no$/m.test(information)
  ) {
    throw new Error("PRIVATE_AVERY_PDF_INVALID");
  }

  const pages = text
    .split("\f")
    .filter((page) => page.trim().length > 0);
  if (pages.length !== AVERY_5260_LIVE_SHEET_COUNT) {
    throw new Error("PRIVATE_AVERY_PDF_INVALID");
  }

  const assertExactTokens = (
    pageText: string,
    expectedRows: readonly Avery5260LabelRow[],
  ): void => {
    const tokens = pageText.split(/\s+/).filter(Boolean);
    const actualCodes = tokens.filter((token) =>
      LIVE_CODE_PATTERN.test(token),
    );
    const actualReferences = tokens.filter((token) =>
      LIVE_ROW_REFERENCE_PATTERN.test(token),
    );
    const expectedCodes = expectedRows.map((row) => row.code);
    const expectedReferences = expectedRows.map(
      (row) => row.rowReference,
    );
    if (
      actualCodes.length !== expectedCodes.length ||
      actualReferences.length !== expectedReferences.length ||
      new Set(actualCodes).size !== actualCodes.length ||
      new Set(actualReferences).size !== actualReferences.length ||
      actualCodes.join("\n") !== expectedCodes.join("\n") ||
      actualReferences.join("\n") !==
        expectedReferences.join("\n")
    ) {
      throw new Error("PRIVATE_AVERY_PDF_INVALID");
    }
  };

  pages.forEach((page, pageIndex) => {
    const start = pageIndex * AVERY_5260.labelsPerSheet;
    assertExactTokens(
      page,
      rows.slice(start, start + AVERY_5260.labelsPerSheet),
    );
  });
}

async function inspectPdf(
  pdfPath: string,
  rows: readonly Avery5260LabelRow[],
): Promise<void> {
  let information: string;
  let text: string;
  try {
    const [pdfInfo, pdfText] = await Promise.all([
      execFileAsync("pdfinfo", [pdfPath], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      }),
      execFileAsync("pdftotext", ["-layout", pdfPath, "-"], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      }),
    ]);
    information = pdfInfo.stdout;
    text = pdfText.stdout;
  } catch {
    throw new Error("PRIVATE_AVERY_PDF_INVALID");
  }
  verifyAvery5260PdfEvidence(information, text, rows);
}

function resolveOptions(options: PrivateAvery5260Options) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const source = resolvePrivateFile(cwd, options.input, ".csv");
  const html = resolvePrivateFile(cwd, options.html, ".html");
  const pdf = resolvePrivateFile(cwd, options.pdf, ".pdf");
  if (
    source.privateRoot !== html.privateRoot ||
    source.privateRoot !== pdf.privateRoot ||
    new Set([
      source.destination,
      html.destination,
      pdf.destination,
    ]).size !== 3
  ) {
    throw new Error("PRIVATE_AVERY_PATH_INVALID");
  }
  return { cwd, html, pdf, privateRoot: source.privateRoot, source };
}

async function readSourceRows(source: string) {
  const csvBuffer = await readNoFollow(
    source,
    MAX_PRIVATE_CSV_BYTES,
  );
  let parsed;
  try {
    parsed = parsePrivateCodeCsv(csvBuffer.toString("utf8"));
    validateRows(parsed, false);
  } catch {
    throw new Error("PRIVATE_AVERY_CSV_INVALID");
  }
  return {
    csvBuffer,
    rows: parsed.map(({ code, rowReference }) => ({
      code,
      rowReference,
    })),
  };
}

export async function writePrivateAvery5260LabelsFromCsv(
  options: PrivateAvery5260Options,
): Promise<PrivateAvery5260Result> {
  const resolved = resolveOptions(options);
  await ensurePrivateRoot(resolved.privateRoot);
  await validatePrivateInput(resolved.source.destination);
  const { csvBuffer, rows } = await readSourceRows(
    resolved.source.destination,
  );
  const sourceSha256 = sha256(csvBuffer);
  const htmlText = serializeAvery5260LabelHtml(rows, {
    sampleOnly: false,
    sourceCommitment: sourceSha256,
  });
  const htmlBuffer = Buffer.from(htmlText, "utf8");
  const pdfBuffer = await renderAvery5260Pdf(htmlText);

  await publishPrivateBundle(
    [
      {
        bytes: htmlBuffer,
        destination: resolved.html.destination,
      },
      {
        bytes: pdfBuffer,
        destination: resolved.pdf.destination,
      },
    ],
    async (temporary) => {
      const temporaryPdf = temporary.get(
        resolved.pdf.destination,
      );
      if (!temporaryPdf) {
        throw new Error("PRIVATE_AVERY_PDF_INVALID");
      }
      await inspectPdf(temporaryPdf, rows);
    },
    async () => {
      const sourceAfter = await readNoFollow(
        resolved.source.destination,
        MAX_PRIVATE_CSV_BYTES,
      );
      if (sha256(sourceAfter) !== sourceSha256) {
        throw new Error("PRIVATE_AVERY_CSV_CHANGED");
      }
    },
  );
  return {
    htmlSha256: sha256(htmlBuffer),
    labelCount: rows.length,
    pdfSha256: sha256(pdfBuffer),
    sheetCount: Math.ceil(
      rows.length / AVERY_5260.labelsPerSheet,
    ),
    sourceSha256,
  };
}

export async function verifyPrivateAvery5260LabelsFromCsv(
  options: PrivateAvery5260Options,
): Promise<PrivateAvery5260Result> {
  const resolved = resolveOptions(options);
  await ensurePrivateRoot(resolved.privateRoot);
  await Promise.all([
    validatePrivateInput(resolved.source.destination),
    validatePrivateArtifact(
      resolved.html.destination,
      MAX_PRIVATE_HTML_BYTES,
    ),
    validatePrivateArtifact(
      resolved.pdf.destination,
      MAX_PRIVATE_PDF_BYTES,
    ),
  ]);
  const { csvBuffer, rows } = await readSourceRows(
    resolved.source.destination,
  );
  const sourceSha256 = sha256(csvBuffer);
  const expectedHtml = serializeAvery5260LabelHtml(rows, {
    sampleOnly: false,
    sourceCommitment: sourceSha256,
  });
  const [htmlBuffer, pdfBuffer] = await Promise.all([
    readNoFollow(
      resolved.html.destination,
      MAX_PRIVATE_HTML_BYTES,
    ),
    readNoFollow(
      resolved.pdf.destination,
      MAX_PRIVATE_PDF_BYTES,
    ),
  ]);
  if (htmlBuffer.toString("utf8") !== expectedHtml) {
    throw new Error("PRIVATE_AVERY_HTML_INVALID");
  }
  await inspectPdf(resolved.pdf.destination, rows);
  return {
    htmlSha256: sha256(htmlBuffer),
    labelCount: rows.length,
    pdfSha256: sha256(pdfBuffer),
    sheetCount: Math.ceil(
      rows.length / AVERY_5260.labelsPerSheet,
    ),
    sourceSha256,
  };
}

export function avery5260Sha256(
  value: string | Buffer,
): string {
  return sha256(value);
}
