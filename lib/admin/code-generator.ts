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
import path from "node:path";

// @ts-expect-error Node 22's type-stripping runtime requires the source extension.
import * as codeBatch from "./code-batch.ts";
// @ts-expect-error Node 22's type-stripping runtime requires the source extension.
import { renderPrivateClaimRowSvg } from "../../scripts/render-campaign-assets.mts";

const MAX_PRIVATE_CSV_BYTES = 2 * 1024 * 1024;
const MAX_TEMP_ATTEMPTS = 128;
let temporaryFileSequence = 0;

export interface PrivateClaimSheetOptions {
  cwd?: string;
  input: string;
  out: string;
}

export interface PrivateClaimSheetResult {
  destination: string;
  rowCount: number;
  source: string;
}

export interface PrivateClaimSheetWriteHooks {
  beforePublish?: () => Promise<void> | void;
}

function resolvePrivateFile(
  cwd: string,
  value: string,
  extension: ".csv" | ".html",
): {
  destination: string;
  privateRoot: string;
} {
  if (
    typeof value !== "string" ||
    value.includes("\\") ||
    path.isAbsolute(value)
  ) {
    throw new Error("PRIVATE_OUTPUT_REQUIRED");
  }

  const segments = value.split("/");
  if (
    segments[0] !== "private" ||
    segments.length !== 2 ||
    segments.some(
      (segment) =>
        segment === "" || segment === "." || segment === "..",
    ) ||
    path.extname(value).toLowerCase() !== extension
  ) {
    throw new Error("PRIVATE_OUTPUT_REQUIRED");
  }

  const privateRoot = path.resolve(cwd, "private");
  const destination = path.resolve(cwd, value);
  if (
    destination === privateRoot ||
    !destination.startsWith(`${privateRoot}${path.sep}`)
  ) {
    throw new Error("PRIVATE_OUTPUT_REQUIRED");
  }
  return { destination, privateRoot };
}

async function preparePrivatePaths(options: {
  destination: string;
  privateRoot: string;
  source: string;
}): Promise<void> {
  try {
    await mkdir(options.privateRoot, {
      mode: 0o700,
    });
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw new Error("PRIVATE_OUTPUT_REQUIRED");
    }
  }

  const privateStat = await lstat(options.privateRoot).catch(
    () => {
      throw new Error("PRIVATE_OUTPUT_REQUIRED");
    },
  );
  if (
    privateStat.isSymbolicLink() ||
    !privateStat.isDirectory() ||
    (privateStat.mode & 0o077) !== 0
  ) {
    throw new Error("PRIVATE_OUTPUT_REQUIRED");
  }

  const destinationParent = path.dirname(options.destination);
  const sourceParent = path.dirname(options.source);
  if (
    destinationParent !== options.privateRoot ||
    sourceParent !== options.privateRoot
  ) {
    throw new Error("PRIVATE_OUTPUT_REQUIRED");
  }

  const sourceStat = await lstat(options.source);
  if (
    sourceStat.isSymbolicLink() ||
    !sourceStat.isFile() ||
    sourceStat.size > MAX_PRIVATE_CSV_BYTES ||
    (sourceStat.mode & 0o077) !== 0
  ) {
    throw new Error("PRIVATE_CSV_INVALID");
  }

  const [realPrivateRoot, realDestinationParent, realSourceParent] =
    await Promise.all([
      realpath(options.privateRoot),
      realpath(destinationParent),
      realpath(sourceParent),
    ]);
  for (const candidate of [
    realDestinationParent,
    realSourceParent,
  ]) {
    if (
      candidate !== realPrivateRoot &&
      !candidate.startsWith(`${realPrivateRoot}${path.sep}`)
    ) {
      throw new Error("PRIVATE_OUTPUT_REQUIRED");
    }
  }
}

function parseCanonicalCsvRow(line: string): readonly [
  string,
  string,
  string,
] {
  const match = /^"([^"]*)","([^"]*)","([^"]*)"$/.exec(
    line,
  );
  if (!match) {
    throw new Error("PRIVATE_CSV_INVALID");
  }
  return [match[1], match[2], match[3]];
}

export function parsePrivateCodeCsv(
  csv: string,
): readonly codeBatch.PrivateClaimRow[] {
  if (
    Buffer.byteLength(csv, "utf8") > MAX_PRIVATE_CSV_BYTES ||
    !csv.endsWith("\n") ||
    csv.includes("\r") ||
    csv.includes("\0")
  ) {
    throw new Error("PRIVATE_CSV_INVALID");
  }
  const lines = csv.slice(0, -1).split("\n");
  if (
    lines[0] !== "row_reference,code,claim_url" ||
    lines.length < 2 ||
    lines.length > 3_001
  ) {
    throw new Error("PRIVATE_CSV_INVALID");
  }

  const values = lines
    .slice(1)
    .map(parseCanonicalCsvRow);
  const rowReferences = values.map(([rowReference]) => rowReference);
  const codes = values.map(([, code]) => code);
  const claimUrls = values.map(([, , claimUrl]) => claimUrl);

  let origin: string;
  try {
    origin = new URL(claimUrls[0]).origin;
  } catch {
    throw new Error("PRIVATE_CSV_INVALID");
  }

  let rows: readonly codeBatch.PrivateClaimRow[];
  try {
    rows = codeBatch.buildPrivateClaimRows(
      codes,
      origin,
      rowReferences,
    );
  } catch {
    throw new Error("PRIVATE_CSV_INVALID");
  }
  if (
    rows.some(
      (row, index) => row.claimUrl !== claimUrls[index],
    ) ||
    codeBatch.serializePrivateCodeCsv(
      codes,
      origin,
      rowReferences,
    ) !== csv
  ) {
    throw new Error("PRIVATE_CSV_INVALID");
  }
  return rows;
}

export function serializePrivateClaimSheet(
  rows: readonly codeBatch.PrivateClaimRow[],
): string {
  if (rows.length < 1 || rows.length > 3_000) {
    throw new Error("PRIVATE_CSV_INVALID");
  }
  const cards = rows.map((row, index) => {
    const svg = renderPrivateClaimRowSvg(row);
    const encoded = Buffer.from(svg, "utf8").toString("base64");
    return `<img class="claim-row" alt="Private YGF claim row ${
      index + 1
    }" src="data:image/svg+xml;base64,${encoded}">`;
  });
  const sheets: string[] = [];

  for (let index = 0; index < cards.length; index += 8) {
    sheets.push(
      `<section class="sheet" aria-label="Private claim sheet ${
        sheets.length + 1
      }">${cards.slice(index, index + 8).join("\n")}</section>`,
    );
  }

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="robots" content="noindex,nofollow">',
    "<title>Private YGF claim rows</title>",
    "<style>",
    "@page { size: letter portrait; margin: 0.35in; }",
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; background: #fff; }",
    "body { font-family: Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }",
    ".sheet { width: 7.25in; min-height: 8.45in; display: grid; grid-template-columns: repeat(2, 3.5in); grid-template-rows: repeat(4, 2in); gap: 0.15in 0.25in; align-content: start; break-after: page; page-break-after: always; }",
    ".sheet:last-child { break-after: auto; page-break-after: auto; }",
    ".claim-row { display: block; width: 3.5in; height: 2in; break-inside: avoid; page-break-inside: avoid; }",
    "@media screen { body { padding: 0.35in; background: #ece7dc; } .sheet { margin: 0 auto 0.35in; background: #fff; } }",
    "</style>",
    "</head>",
    '<body data-private-claim-sheet="true">',
    sheets.join("\n"),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

async function openPrivateCsv(source: string): Promise<FileHandle> {
  try {
    return await open(
      source,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new Error("PRIVATE_CSV_INVALID");
  }
}

async function readPrivateCsv(source: string): Promise<string> {
  const handle = await openPrivateCsv(source);
  try {
    const fileStat = await handle.stat();
    if (
      !fileStat.isFile() ||
      fileStat.size > MAX_PRIVATE_CSV_BYTES
    ) {
      throw new Error("PRIVATE_CSV_INVALID");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function openTemporaryHtml(
  destination: string,
): Promise<{
  handle: FileHandle;
  temporaryPath: string;
}> {
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
        0o600,
      );
      return { handle, temporaryPath };
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
  throw new Error("PRIVATE_PRINT_TEMP_UNAVAILABLE");
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writePrivateHtmlAtomically(
  destination: string,
  html: string,
  hooks: PrivateClaimSheetWriteHooks,
): Promise<void> {
  const { handle, temporaryPath } =
    await openTemporaryHtml(destination);
  let handleClosed = false;
  let published = false;

  try {
    await handle.writeFile(html, "utf8");
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handleClosed = true;
    await hooks.beforePublish?.();
    await link(temporaryPath, destination);
    published = true;
    await syncDirectory(path.dirname(destination));
  } finally {
    if (!handleClosed) {
      await handle.close().catch(() => undefined);
    }
    await unlink(temporaryPath).catch(() => undefined);
    if (published) {
      await syncDirectory(path.dirname(destination)).catch(
        () => undefined,
      );
    }
  }
}

export async function writePrivateClaimSheetFromCsv(
  {
    cwd = process.cwd(),
    input,
    out,
  }: PrivateClaimSheetOptions,
  hooks: PrivateClaimSheetWriteHooks = {},
): Promise<PrivateClaimSheetResult> {
  const resolvedCwd = path.resolve(cwd);
  const sourcePath = resolvePrivateFile(
    resolvedCwd,
    input,
    ".csv",
  );
  const outputPath = resolvePrivateFile(
    resolvedCwd,
    out,
    ".html",
  );
  if (sourcePath.privateRoot !== outputPath.privateRoot) {
    throw new Error("PRIVATE_OUTPUT_REQUIRED");
  }

  await preparePrivatePaths({
    destination: outputPath.destination,
    privateRoot: outputPath.privateRoot,
    source: sourcePath.destination,
  });
  const csv = await readPrivateCsv(sourcePath.destination);
  const rows = parsePrivateCodeCsv(csv);
  const html = serializePrivateClaimSheet(rows);
  await writePrivateHtmlAtomically(
    outputPath.destination,
    html,
    hooks,
  );
  return {
    destination: outputPath.destination,
    rowCount: rows.length,
    source: sourcePath.destination,
  };
}
