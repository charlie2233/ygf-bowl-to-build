import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import QRCode from "qrcode";

// @ts-expect-error Node 22's type-stripping runtime requires the source extension.
import { parsePrivateCodeCsv } from "../lib/admin/code-generator.ts";
import type { PrivateClaimRow } from "../lib/admin/code-batch.ts";
// @ts-expect-error Node 22's type-stripping runtime requires the source extension.
import { AGENT_PASS_COPY, AGENT_PASS_SIZE, AGENT_PASS_VARIANTS } from "./render-agent-pass-assets.mts";

interface CliOptions {
  input: string;
  out: string;
}

export interface PrivateAgentPassBatchOptions
  extends CliOptions {
  cwd?: string;
}

export interface PrivateAgentPassBatchResult {
  destination: string;
  rowCount: number;
  source: string;
}

export interface PrivateAgentPassBatchHooks {
  beforePublish?: () => Promise<void> | void;
}

const scriptPath = fileURLToPath(import.meta.url);
const MAX_PRIVATE_CSV_BYTES = 2 * 1024 * 1024;
const MAX_TEMP_ATTEMPTS = 128;
const QR_QUIET_ZONE = 4;
let temporaryFileSequence = 0;
const execFileAsync = promisify(execFile);

const COLOR = Object.freeze({
  cream: "#F6F0E4",
  gold: "#E8B94A",
  ink: "#16261F",
  red: "#D84A32",
  sage: "#667868",
  white: "#FFFFFF",
});

const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Helvetica, Arial, sans-serif";

export const PRIVATE_AGENT_PASS_USAGE =
  "Usage: render-private-agent-pass-batch.mts --input private/<admin-download>.csv --out private/<agent-pass-batch>.html";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function parsePrivateAgentPassCliArguments(
  arguments_: readonly string[],
): CliOptions {
  const values = new Map<string, string>();
  if (arguments_.length !== 4) {
    throw new Error(PRIVATE_AGENT_PASS_USAGE);
  }
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (
      !flag ||
      !["--input", "--out"].includes(flag) ||
      value === undefined ||
      value.startsWith("--") ||
      values.has(flag)
    ) {
      throw new Error(PRIVATE_AGENT_PASS_USAGE);
    }
    values.set(flag, value);
  }
  if (values.size !== 2) {
    throw new Error(PRIVATE_AGENT_PASS_USAGE);
  }
  return {
    input: values.get("--input") ?? "",
    out: values.get("--out") ?? "",
  };
}

function resolveDirectPrivateFile(
  cwd: string,
  value: string,
  extension: ".csv" | ".html",
): Readonly<{
  destination: string;
  privateRoot: string;
}> {
  if (
    typeof value !== "string" ||
    value.includes("\\") ||
    path.isAbsolute(value)
  ) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
  const segments = value.split("/");
  if (
    segments.length !== 2 ||
    segments[0] !== "private" ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === "..",
    ) ||
    path.extname(segments[1]).toLowerCase() !== extension
  ) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
  const privateRoot = path.resolve(cwd, "private");
  const destination = path.resolve(cwd, value);
  if (
    path.dirname(destination) !== privateRoot ||
    !destination.startsWith(`${privateRoot}${path.sep}`)
  ) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
  return { destination, privateRoot };
}

async function assertPrivatePathIsIgnored(
  cwd: string,
  target: string,
): Promise<void> {
  const relative = path.relative(cwd, target);
  try {
    await execFileAsync(
      "git",
      [
        "check-ignore",
        "--quiet",
        "--",
        relative,
      ],
      {
        cwd,
        windowsHide: true,
      },
    );
  } catch {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
}

async function preparePrivatePaths(options: Readonly<{
  cwd: string;
  destination: string;
  privateRoot: string;
  source: string;
}>): Promise<void> {
  await Promise.all([
    assertPrivatePathIsIgnored(options.cwd, options.source),
    assertPrivatePathIsIgnored(
      options.cwd,
      options.destination,
    ),
  ]);
  try {
    await mkdir(options.privateRoot, { mode: 0o700 });
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
    }
  }
  const directoryStat = await lstat(options.privateRoot).catch(
    () => {
      throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
    },
  );
  if (
    directoryStat.isSymbolicLink() ||
    !directoryStat.isDirectory() ||
    (directoryStat.mode & 0o077) !== 0
  ) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
  if (
    path.dirname(options.source) !== options.privateRoot ||
    path.dirname(options.destination) !== options.privateRoot
  ) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }

  const sourceStat = await lstat(options.source).catch(() => {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  });
  if (
    sourceStat.isSymbolicLink() ||
    !sourceStat.isFile() ||
    sourceStat.size > MAX_PRIVATE_CSV_BYTES ||
    (sourceStat.mode & 0o077) !== 0
  ) {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }

  const [realRoot, realSourceParent, realOutputParent] =
    await Promise.all([
      realpath(options.privateRoot),
      realpath(path.dirname(options.source)),
      realpath(path.dirname(options.destination)),
    ]);
  if (
    realSourceParent !== realRoot ||
    realOutputParent !== realRoot
  ) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
}

async function readPrivateCsv(source: string): Promise<string> {
  let handle: FileHandle;
  try {
    handle = await open(
      source,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
  try {
    const fileStat = await handle.stat();
    if (
      !fileStat.isFile() ||
      fileStat.size > MAX_PRIVATE_CSV_BYTES ||
      (fileStat.mode & 0o077) !== 0
    ) {
      throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function qrGeometry(value: string): Readonly<{
  moduleCount: number;
  modules: readonly Readonly<{ x: number; y: number }>[];
  totalModules: number;
}> {
  const code = QRCode.create(value, {
    errorCorrectionLevel: "M",
  });
  const modules: Array<Readonly<{ x: number; y: number }>> =
    [];
  for (let row = 0; row < code.modules.size; row += 1) {
    for (
      let column = 0;
      column < code.modules.size;
      column += 1
    ) {
      if (code.modules.get(row, column)) {
        modules.push({
          x: column + QR_QUIET_ZONE,
          y: row + QR_QUIET_ZONE,
        });
      }
    }
  }
  return {
    moduleCount: code.modules.size,
    modules,
    totalModules: code.modules.size + QR_QUIET_ZONE * 2,
  };
}

function renderClaimQr(
  claimUrl: string,
  x: number,
  y: number,
  size: number,
): string {
  const qr = qrGeometry(claimUrl);
  const moduleSize = size / qr.totalModules;
  const modules = qr.modules
    .map(
      (module) =>
        `<rect class="qr-module" x="${module.x}" y="${module.y}" width="1" height="1"/>`,
    )
    .join("");
  return [
    `<g transform="translate(${formatNumber(x)} ${formatNumber(y)}) scale(${formatNumber(moduleSize)})">`,
    `<g data-qr-url="${escapeXml(claimUrl)}" data-qr-modules="${qr.moduleCount}" data-qr-quiet-zone="${QR_QUIET_ZONE}">`,
    `<rect class="qr-background" x="0" y="0" width="${qr.totalModules}" height="${qr.totalModules}" fill="${COLOR.white}"/>`,
    `<g fill="${COLOR.ink}">${modules}</g>`,
    "</g>",
    "</g>",
  ].join("");
}

function validatePrivateRow(row: PrivateClaimRow): void {
  if (
    !/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(row.code) ||
    !/^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$/.test(
      row.rowReference,
    )
  ) {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
  let claimUrl: URL;
  try {
    claimUrl = new URL(row.claimUrl);
  } catch {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
  const localhost =
    claimUrl.hostname === "localhost" ||
    claimUrl.hostname === "127.0.0.1" ||
    claimUrl.hostname === "[::1]";
  if (
    (claimUrl.protocol !== "https:" &&
      !(claimUrl.protocol === "http:" && localhost)) ||
    claimUrl.username ||
    claimUrl.password ||
    claimUrl.pathname !== "/redeem" ||
    claimUrl.search ||
    claimUrl.hash !== `#code=${row.code}`
  ) {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
}

export function renderPrivateAgentPassBackSvg(
  row: PrivateClaimRow,
  variantIndex = 0,
): string {
  validatePrivateRow(row);
  const variant =
    AGENT_PASS_VARIANTS[
      ((variantIndex % AGENT_PASS_VARIANTS.length) +
        AGENT_PASS_VARIANTS.length) %
        AGENT_PASS_VARIANTS.length
    ];
  const qr = renderClaimQr(row.claimUrl, 566, 91, 238);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="private-pass-title private-pass-description" data-private-agent-pass-back="true" data-row-reference="${escapeXml(row.rowReference)}" data-variant="${escapeXml(variant.slug)}" width="${AGENT_PASS_SIZE.widthMm}mm" height="${AGENT_PASS_SIZE.heightMm}mm" viewBox="0 0 ${AGENT_PASS_SIZE.viewWidth} ${AGENT_PASS_SIZE.viewHeight}">`,
    '<title id="private-pass-title">Protected YGF Agent Pass fulfillment back</title>',
    `<desc id="private-pass-description">A protected checkout back with a human-readable claim and a QR that carry the exact same redemption value. Variant ${escapeXml(variant.english)}.</desc>`,
    `<rect width="856" height="540" fill="${COLOR.cream}"/>`,
    `<rect x="0" y="0" width="856" height="70" fill="${COLOR.red}"/>`,
    `<rect x="18" y="18" width="820" height="504" rx="20" fill="none" stroke="${COLOR.gold}" stroke-width="3"/>`,
    `<text x="44" y="46" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="22" font-weight="900" letter-spacing="2">YGF AGENT PASS · ${escapeXml(variant.english)} ${escapeXml(variant.number)}</text>`,
    `<text x="44" y="112" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="16" font-weight="900" letter-spacing="1.5">YOUR ONE-TIME CLAIM</text>`,
    `<text x="44" y="174" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="54" font-weight="900" letter-spacing="8">${escapeXml(row.code)}</text>`,
    `<g data-agent-pass-steps="scratch-scan-start">`,
    `<text x="44" y="220" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="17" font-weight="900">1 刮开 / OPEN</text>`,
    `<text x="44" y="252" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="17" font-weight="900">2 扫码或输入 / SCAN OR ENTER</text>`,
    `<text x="44" y="284" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="17" font-weight="900">3 开始使用 / START USING</text>`,
    "</g>",
    `<text x="44" y="330" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="20" font-weight="900">刮开后请勿拍照分享</text>`,
    `<text x="44" y="365" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="14" font-weight="800">A claim unlocks credits. It is never an API credential.</text>`,
    `<text x="44" y="397" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="14" font-weight="700">${escapeXml(AGENT_PASS_COPY.duration)} · One redemption per person/account.</text>`,
    `<text x="44" y="430" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="12.5" font-weight="800">ROW REF: ${escapeXml(row.rowReference)}</text>`,
    `<text x="44" y="466" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="17.5" font-weight="700"><tspan x="44" dy="0">This promotion is offered by YGF for the USC community and is not sponsored,</tspan><tspan x="44" dy="22">endorsed by, or administered by the University of Southern California.</tspan></text>`,
    qr,
    `<text x="685" y="353" text-anchor="middle" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="13" font-weight="900" letter-spacing="1">MATCHED CLAIM</text>`,
    "</svg>",
    "",
  ].join("\n");
}

export function serializePrivateAgentPassBatch(
  rows: readonly PrivateClaimRow[],
): string {
  if (rows.length < 1 || rows.length > 3_000) {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
  const cards = rows.map((row, index) => {
    const svg = renderPrivateAgentPassBackSvg(row, index);
    const encoded = Buffer.from(svg, "utf8").toString("base64");
    const marks = [
      "tl-h",
      "tl-v",
      "tr-h",
      "tr-v",
      "bl-h",
      "bl-v",
      "br-h",
      "br-v",
    ]
      .map(
        (position) =>
          `<i class="cut-mark ${position}" aria-hidden="true"></i>`,
      )
      .join("");
    return `<div class="agent-pass-slot"><img class="agent-pass-back" alt="Protected YGF Agent Pass back ${index + 1}" src="data:image/svg+xml;base64,${encoded}">${marks}</div>`;
  });
  const sheets: string[] = [];
  for (let index = 0; index < cards.length; index += 8) {
    sheets.push(
      `<section class="sheet" aria-label="Protected Agent Pass sheet ${sheets.length + 1}">${cards.slice(index, index + 8).join("\n")}</section>`,
    );
  }
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="robots" content="noindex,nofollow,noarchive">',
    "<title>Protected YGF Agent Pass batch</title>",
    "<style>",
    "@page { size: letter portrait; margin: 16.7mm 17.35mm; }",
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; background: #fff; }",
    "body { font-family: Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }",
    ".sheet { width: 181.2mm; min-height: 246mm; display: grid; grid-template-columns: repeat(2, 85.6mm); grid-template-rows: repeat(4, 54mm); gap: 10mm; align-content: start; break-after: page; page-break-after: always; }",
    ".sheet:last-child { break-after: auto; page-break-after: auto; }",
    ".agent-pass-slot { position: relative; width: 85.6mm; height: 54mm; break-inside: avoid; page-break-inside: avoid; }",
    ".agent-pass-back { display: block; width: 85.6mm; height: 54mm; break-inside: avoid; page-break-inside: avoid; }",
    ".cut-mark { position: absolute; display: block; background: #000; }",
    ".tl-h, .tr-h, .bl-h, .br-h { width: 3.5mm; height: 0.18mm; }",
    ".tl-v, .tr-v, .bl-v, .br-v { width: 0.18mm; height: 3.5mm; }",
    ".tl-h { left: -4.7mm; top: -0.09mm; } .tr-h { right: -4.7mm; top: -0.09mm; }",
    ".bl-h { left: -4.7mm; bottom: -0.09mm; } .br-h { right: -4.7mm; bottom: -0.09mm; }",
    ".tl-v { left: -0.09mm; top: -4.7mm; } .tr-v { right: -0.09mm; top: -4.7mm; }",
    ".bl-v { left: -0.09mm; bottom: -4.7mm; } .br-v { right: -0.09mm; bottom: -4.7mm; }",
    "@media screen { body { padding: 16px; background: #ece7dc; } .sheet { margin: 0 auto 16px; background: #fff; } }",
    "</style>",
    "</head>",
    '<body data-private-agent-pass-batch="true">',
    sheets.join("\n"),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

async function openTemporaryOutput(
  destination: string,
): Promise<Readonly<{
  handle: FileHandle;
  temporaryPath: string;
}>> {
  const parent = path.dirname(destination);
  const basename = path.basename(destination);
  for (let attempt = 0; attempt < MAX_TEMP_ATTEMPTS; attempt += 1) {
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
  throw new Error("PRIVATE_AGENT_PASS_TEMP_UNAVAILABLE");
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writePrivateBatchAtomically(
  destination: string,
  html: string,
  hooks: PrivateAgentPassBatchHooks,
): Promise<void> {
  const { handle, temporaryPath } =
    await openTemporaryOutput(destination);
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

export async function writePrivateAgentPassBatchFromCsv(
  {
    cwd = process.cwd(),
    input,
    out,
  }: PrivateAgentPassBatchOptions,
  hooks: PrivateAgentPassBatchHooks = {},
): Promise<PrivateAgentPassBatchResult> {
  const resolvedCwd = path.resolve(cwd);
  const source = resolveDirectPrivateFile(
    resolvedCwd,
    input,
    ".csv",
  );
  const destination = resolveDirectPrivateFile(
    resolvedCwd,
    out,
    ".html",
  );
  if (source.privateRoot !== destination.privateRoot) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
  await preparePrivatePaths({
    cwd: resolvedCwd,
    destination: destination.destination,
    privateRoot: source.privateRoot,
    source: source.destination,
  });
  const csv = await readPrivateCsv(source.destination);
  let rows: readonly PrivateClaimRow[];
  try {
    rows = parsePrivateCodeCsv(csv);
  } catch {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
  const html = serializePrivateAgentPassBatch(rows);
  await writePrivateBatchAtomically(
    destination.destination,
    html,
    hooks,
  );
  return {
    destination: destination.destination,
    rowCount: rows.length,
    source: source.destination,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  let options: CliOptions;
  try {
    options = parsePrivateAgentPassCliArguments(
      process.argv.slice(2),
    );
  } catch {
    process.stderr.write(`${PRIVATE_AGENT_PASS_USAGE}\n`);
    process.exitCode = 1;
    options = { input: "", out: "" };
  }
  if (process.exitCode !== 1) {
    writePrivateAgentPassBatchFromCsv(options)
      .then((result) => {
        process.stdout.write(
          `Rendered ${result.rowCount} protected Agent Pass backs.\n`,
        );
      })
      .catch((error: unknown) => {
        const safeMessages = new Set([
          "PRIVATE_AGENT_PASS_CSV_INVALID",
          "PRIVATE_AGENT_PASS_PATH_REQUIRED",
          "PRIVATE_AGENT_PASS_TEMP_UNAVAILABLE",
        ]);
        let message = "PRIVATE_AGENT_PASS_RENDER_FAILED";
        if (
          error instanceof Error &&
          safeMessages.has(error.message)
        ) {
          message = error.message;
        } else if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "EEXIST"
        ) {
          message = "PRIVATE_AGENT_PASS_DESTINATION_EXISTS";
        }
        process.stderr.write(`${message}\n`);
        process.exitCode = 1;
      });
  }
}
