import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  readFile,
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
import {
  AGENT_PASS_COPY,
  AGENT_PASS_PAPERS,
  AGENT_PASS_RENDER_VERSION,
  AGENT_PASS_SIZE,
  AGENT_PASS_VARIANTS,
  type AgentPassPaper,
  agentPassImpositionCardPosition,
  agentPassMillimetersToPixels,
  agentPassMillimetersToPoints,
  buildAgentPassRasterPdf,
  rasterizeAgentPassSvg,
  renderAgentPassCutMarks,
  renderAgentPassFrontBody,
  renderAgentPassPhotoSymbol,
  // @ts-expect-error Node 22's type-stripping runtime requires the source extension.
} from "./render-agent-pass-assets.mts";

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
  destinations: readonly string[];
  pageCount: number;
  rowCount: number;
  source: string;
}

export interface PrivateAgentPassBatchHooks {
  beforePublish?: () => Promise<void> | void;
}

type PrivateArtifact = Readonly<{
  bytes: Buffer;
  destination: string;
}>;

type TemporaryArtifact = Readonly<{
  handle: FileHandle;
  temporaryPath: string;
}>;

type PublishedArtifact = Readonly<{
  destination: string;
  device: number;
  inode: number;
}>;

const scriptPath = fileURLToPath(import.meta.url);
const MAX_PRIVATE_CSV_BYTES = 2 * 1024 * 1024;
const MAX_PRIVATE_ROWS = 3_000;
const MAX_TEMP_ATTEMPTS = 128;
const QR_QUIET_ZONE = 4;
const PRIVATE_RENDER_VERSION =
  `${AGENT_PASS_RENDER_VERSION}-private-duplex-v1`;
const PRIVATE_PHOTO_HREF = "../public/media/ygf-user-photo.png";
const CARDS_PER_SHEET = 8;
const execFileAsync = promisify(execFile);
let temporaryFileSequence = 0;

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

function bufferFromText(value: string): Buffer {
  return Buffer.from(value, "utf8");
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
  const basename = segments[1] ?? "";
  if (
    segments.length !== 2 ||
    segments[0] !== "private" ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === "..",
    ) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(basename) ||
    path.extname(basename).toLowerCase() !== extension
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
      ["check-ignore", "--quiet", "--", relative],
      {
        cwd,
        windowsHide: true,
      },
    );
  } catch {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
}

async function preparePrivateSource(options: Readonly<{
  cwd: string;
  privateRoot: string;
  source: string;
}>): Promise<void> {
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
  if (path.dirname(options.source) !== options.privateRoot) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
  await assertPrivatePathIsIgnored(options.cwd, options.source);

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

  const [realRoot, realSourceParent] = await Promise.all([
    realpath(options.privateRoot),
    realpath(path.dirname(options.source)),
  ]);
  if (realSourceParent !== realRoot) {
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
  if (moduleSize < 4) {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
  const modules = qr.modules
    .map(
      (module) =>
        `<rect class="qr-module" x="${module.x}" y="${module.y}" width="1" height="1"/>`,
    )
    .join("");
  return [
    `<g transform="translate(${formatNumber(x)} ${formatNumber(y)}) scale(${formatNumber(moduleSize)})">`,
    `<g data-qr-url="${escapeXml(claimUrl)}" data-qr-modules="${qr.moduleCount}" data-qr-quiet-zone="${QR_QUIET_ZONE}" data-qr-module-size-view-units="${formatNumber(moduleSize)}">`,
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

export function renderPrivateAgentPassBackBody(
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
    `<text x="44" y="397" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="14" font-weight="700">${escapeXml(AGENT_PASS_COPY.duration)} · Each distinct code grants once.</text>`,
    `<text x="44" y="430" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="12.5" font-weight="800">ROW REF: ${escapeXml(row.rowReference)}</text>`,
    `<text x="44" y="466" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="17.5" font-weight="700"><tspan x="44" dy="0">This promotion is offered by YGF for the USC community and is not sponsored,</tspan><tspan x="44" dy="22">endorsed by, or administered by the University of Southern California.</tspan></text>`,
    qr,
    `<text x="685" y="353" text-anchor="middle" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="13" font-weight="900" letter-spacing="1">MATCHED CLAIM</text>`,
  ].join("\n");
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
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="private-pass-title private-pass-description" data-private-agent-pass-back="true" data-row-reference="${escapeXml(row.rowReference)}" data-variant="${escapeXml(variant.slug)}" width="${AGENT_PASS_SIZE.widthMm}mm" height="${AGENT_PASS_SIZE.heightMm}mm" viewBox="0 0 ${AGENT_PASS_SIZE.viewWidth} ${AGENT_PASS_SIZE.viewHeight}">`,
    '<title id="private-pass-title">Protected YGF Agent Pass fulfillment back</title>',
    `<desc id="private-pass-description">A protected checkout back with a human-readable claim and a QR that carry the exact same redemption value. Variant ${escapeXml(variant.english)}.</desc>`,
    renderPrivateAgentPassBackBody(row, variantIndex),
    "</svg>",
    "",
  ].join("\n");
}

export function serializePrivateAgentPassBatch(
  rows: readonly PrivateClaimRow[],
): string {
  if (rows.length < 1 || rows.length > MAX_PRIVATE_ROWS) {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
  const pairs = rows.map((row, index) => {
    validatePrivateRow(row);
    const variant =
      AGENT_PASS_VARIANTS[index % AGENT_PASS_VARIANTS.length];
    const backSvg = renderPrivateAgentPassBackSvg(row, index);
    const encodedBack = Buffer.from(
      backSvg,
      "utf8",
    ).toString("base64");
    return [
      `<article class="custody-pair" data-row-reference="${escapeXml(row.rowReference)}" data-variant="${escapeXml(variant.slug)}">`,
      `<h2>Row ${index + 1} · ${escapeXml(variant.english)} · ${escapeXml(row.rowReference)}</h2>`,
      '<div class="pair-grid">',
      `<figure><img class="agent-pass-front" alt="${escapeXml(variant.english)} YGF Agent Pass front" src="../public/campaign/agent-pass/${escapeXml(variant.slug)}-front.svg"><figcaption>Front · safe public side</figcaption></figure>`,
      `<figure><img class="agent-pass-back" alt="Protected YGF Agent Pass back ${index + 1}" src="data:image/svg+xml;base64,${encodedBack}"><figcaption>Back · private matched claim</figcaption></figure>`,
      "</div>",
      "</article>",
    ].join("\n");
  });
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="robots" content="noindex,nofollow,noarchive">',
    "<title>Protected YGF Agent Pass custody preview</title>",
    "<style>",
    "* { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; background: #f0ece4; color: #16261f; }",
    "body { max-width: 1100px; margin: 0 auto; padding: 24px; font-family: Arial, sans-serif; }",
    ".instructions, .custody-pair { padding: 18px; margin: 0 0 20px; border: 2px solid #e8b94a; border-radius: 14px; background: #fff; }",
    ".pair-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }",
    "figure { margin: 0; } img { display: block; width: 100%; height: auto; }",
    "figcaption { margin-top: 8px; font-weight: 700; }",
    ".warning { color: #d84a32; font-weight: 900; }",
    "@media (max-width: 720px) { .pair-grid { grid-template-columns: 1fr; } }",
    "</style>",
    "</head>",
    '<body data-private-agent-pass-batch="true" data-duplex="long-edge">',
    '<section class="instructions" aria-label="Private print custody instructions">',
    "<h1>Protected YGF Agent Pass custody preview</h1>",
    '<p class="warning">Private material: do not upload, email, log, or publish this file.</p>',
    "<p>Print only the generated Letter or A4 duplex PDF in portrait, 100%, long-edge mode. Do not use Fit, Scale to Fit, short-edge, or browser print.</p>",
    "<p>Each row below pairs the collectible public front with its exact private back. The duplex PDFs already place backs in horizontally reflected slots.</p>",
    "</section>",
    pairs.join("\n"),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function renderPrivateAgentPassSheetSvg(options: Readonly<{
  pageIndex: number;
  paper: AgentPassPaper;
  rows: readonly PrivateClaimRow[];
  side: "back" | "front";
}>): string {
  const scaleX =
    AGENT_PASS_SIZE.widthMm / AGENT_PASS_SIZE.viewWidth;
  const scaleY =
    AGENT_PASS_SIZE.heightMm / AGENT_PASS_SIZE.viewHeight;
  const groups: string[] = [];
  const marks: string[] = [];
  for (
    let localIndex = 0;
    localIndex < CARDS_PER_SHEET;
    localIndex += 1
  ) {
    const globalIndex =
      options.pageIndex * CARDS_PER_SHEET + localIndex;
    const row = options.rows[globalIndex];
    const frontPosition = agentPassImpositionCardPosition(
      options.paper,
      localIndex,
    );
    const localSlot =
      options.side === "front"
        ? localIndex
        : localIndex ^ 1;
    const x =
      options.side === "front"
        ? frontPosition.x
        : options.paper.widthMm -
          frontPosition.x -
          AGENT_PASS_SIZE.widthMm;
    const y = frontPosition.y;
    const commonMetadata = [
      `data-agent-pass-slot="${localSlot + 1}"`,
      `data-source-local-index="${localIndex}"`,
      `data-page="${options.pageIndex + 1}"`,
      `data-side="${options.side}"`,
      'data-duplex="long-edge"',
      `data-x-mm="${formatNumber(x)}"`,
      `data-y-mm="${formatNumber(y)}"`,
    ].join(" ");
    if (!row) {
      groups.push(`<g ${commonMetadata} data-blank="true"/>`);
      continue;
    }
    validatePrivateRow(row);
    const variant =
      AGENT_PASS_VARIANTS[
        globalIndex % AGENT_PASS_VARIANTS.length
      ];
    const body =
      options.side === "front"
        ? renderAgentPassFrontBody(
            variant,
            `private-${options.paper.name}-${options.pageIndex}-${localIndex}`,
          )
        : renderPrivateAgentPassBackBody(row, globalIndex);
    groups.push(
      `<g ${commonMetadata} data-blank="false" data-row-reference="${escapeXml(row.rowReference)}" data-variant="${escapeXml(variant.slug)}" transform="translate(${formatNumber(x)} ${formatNumber(y)}) scale(${formatNumber(scaleX)} ${formatNumber(scaleY)})">${body}</g>`,
    );
    marks.push(
      renderAgentPassCutMarks(
        x,
        y,
        AGENT_PASS_SIZE.widthMm,
        AGENT_PASS_SIZE.heightMm,
      ),
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" width="${options.paper.widthMm}mm" height="${options.paper.heightMm}mm" viewBox="0 0 ${options.paper.widthMm} ${options.paper.heightMm}" data-private-agent-pass-sheet="true" data-paper="${options.paper.name}" data-page="${options.pageIndex + 1}" data-side="${options.side}" data-duplex="long-edge" data-orientation="portrait" data-scale="100-percent">`,
    `<title>Private YGF Agent Pass ${options.paper.name.toUpperCase()} page ${options.pageIndex + 1} ${options.side}</title>`,
    `<desc>Private two by four Agent Pass imposition for portrait, 100 percent, long-edge duplex printing.</desc>`,
    `<metadata data-render-version="${escapeXml(PRIVATE_RENDER_VERSION)}" data-card-width-mm="${AGENT_PASS_SIZE.widthMm}" data-card-height-mm="${AGENT_PASS_SIZE.heightMm}" data-gutter-mm="10" data-duplex="long-edge"/>`,
    options.side === "front"
      ? `<defs>${renderAgentPassPhotoSymbol(PRIVATE_PHOTO_HREF)}</defs>`
      : "",
    `<rect width="${options.paper.widthMm}" height="${options.paper.heightMm}" fill="${COLOR.white}"/>`,
    groups.join("\n"),
    `<g data-cut-marks="true" fill="none" stroke="#000000" stroke-width="0.18">${marks.join("")}</g>`,
    "</svg>",
    "",
  ].join("\n");
}

function privateBundleDestinations(
  htmlDestination: string,
  pageCount: number,
): readonly string[] {
  const parent = path.dirname(htmlDestination);
  const stem = path.basename(
    htmlDestination,
    path.extname(htmlDestination),
  );
  const destinations = [htmlDestination];
  for (const paper of AGENT_PASS_PAPERS) {
    for (let page = 1; page <= pageCount; page += 1) {
      const pageLabel = String(page).padStart(3, "0");
      destinations.push(
        path.join(
          parent,
          `${stem}-${paper.name}-p${pageLabel}-front.svg`,
        ),
        path.join(
          parent,
          `${stem}-${paper.name}-p${pageLabel}-back.svg`,
        ),
      );
    }
    destinations.push(
      path.join(
        parent,
        `${stem}-${paper.name}-duplex.pdf`,
      ),
    );
  }
  return destinations;
}

async function assertPrivateDestinations(
  cwd: string,
  privateRoot: string,
  source: string,
  destinations: readonly string[],
): Promise<void> {
  if (new Set(destinations).size !== destinations.length) {
    throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  }
  await Promise.all(
    destinations.map(async (destination) => {
      if (
        destination === source ||
        path.dirname(destination) !== privateRoot
      ) {
        throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
      }
      await assertPrivatePathIsIgnored(cwd, destination);
      const existing = await lstat(destination).catch(
        (error: unknown) => {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            return undefined;
          }
          throw new Error("PRIVATE_AGENT_PASS_PATH_REQUIRED");
        },
      );
      if (existing) {
        const conflict = new Error(
          "PRIVATE_AGENT_PASS_DESTINATION_EXISTS",
        ) as NodeJS.ErrnoException;
        conflict.code = "EEXIST";
        throw conflict;
      }
    }),
  );
}

function privatePdfSourceDigest(
  paper: AgentPassPaper,
  pages: readonly string[],
  photo: Buffer,
): string {
  const hash = createHash("sha256")
    .update(PRIVATE_RENDER_VERSION)
    .update("\0")
    .update(paper.name)
    .update("\0")
    .update(`${paper.widthMm}x${paper.heightMm}`)
    .update("\0");
  for (const page of pages) {
    hash.update(page).update("\0");
  }
  return hash.update(photo).digest("hex");
}

async function renderPrivateArtifacts(options: Readonly<{
  destinations: readonly string[];
  html: string;
  pageCount: number;
  photo: Buffer;
  rows: readonly PrivateClaimRow[];
}>): Promise<readonly PrivateArtifact[]> {
  const byBasename = new Map(
    options.destinations.map((destination) => [
      path.basename(destination),
      destination,
    ]),
  );
  const htmlDestination = options.destinations[0];
  const stem = path.basename(
    htmlDestination,
    path.extname(htmlDestination),
  );
  const artifacts: PrivateArtifact[] = [
    {
      bytes: bufferFromText(options.html),
      destination: htmlDestination,
    },
  ];

  for (const paper of AGENT_PASS_PAPERS) {
    const pdfPageSvgs: string[] = [];
    const pdfPagePngs: Buffer[] = [];
    const widthPixels = agentPassMillimetersToPixels(
      paper.widthMm,
      300,
    );
    const heightPixels = agentPassMillimetersToPixels(
      paper.heightMm,
      300,
    );
    for (
      let pageIndex = 0;
      pageIndex < options.pageCount;
      pageIndex += 1
    ) {
      const pageLabel = String(pageIndex + 1).padStart(3, "0");
      for (const side of ["front", "back"] as const) {
        const svg = renderPrivateAgentPassSheetSvg({
          pageIndex,
          paper,
          rows: options.rows,
          side,
        });
        const basename =
          `${stem}-${paper.name}-p${pageLabel}-${side}.svg`;
        const destination = byBasename.get(basename);
        if (!destination) {
          throw new Error("PRIVATE_AGENT_PASS_RENDER_FAILED");
        }
        artifacts.push({
          bytes: bufferFromText(svg),
          destination,
        });
        pdfPageSvgs.push(svg);
        pdfPagePngs.push(
          await rasterizeAgentPassSvg(
            svg,
            widthPixels,
            heightPixels,
            options.photo,
          ),
        );
      }
    }
    const pdfBasename = `${stem}-${paper.name}-duplex.pdf`;
    const pdfDestination = byBasename.get(pdfBasename);
    if (!pdfDestination) {
      throw new Error("PRIVATE_AGENT_PASS_RENDER_FAILED");
    }
    artifacts.push({
      bytes: buildAgentPassRasterPdf({
        pageHeightPt: agentPassMillimetersToPoints(
          paper.heightMm,
        ),
        pages: pdfPagePngs,
        pageWidthPt: agentPassMillimetersToPoints(
          paper.widthMm,
        ),
        sourceDigest: privatePdfSourceDigest(
          paper,
          pdfPageSvgs,
          options.photo,
        ),
        title: `Private YGF Agent Pass ${paper.name.toUpperCase()} duplex`,
      }),
      destination: pdfDestination,
    });
  }
  return artifacts;
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

async function publishPrivateBundleAtomically(
  artifacts: readonly PrivateArtifact[],
  hooks: PrivateAgentPassBatchHooks,
): Promise<void> {
  const temporary: Array<
    Readonly<{
      destination: string;
      temporaryPath: string;
    }>
  > = [];
  const published: PublishedArtifact[] = [];
  try {
    for (const artifact of artifacts) {
      const opened = await openTemporaryOutput(
        artifact.destination,
      );
      let closed = false;
      try {
        await opened.handle.writeFile(artifact.bytes);
        await opened.handle.chmod(0o600);
        await opened.handle.sync();
        await opened.handle.close();
        closed = true;
      } finally {
        if (!closed) {
          await opened.handle.close().catch(() => undefined);
        }
      }
      temporary.push({
        destination: artifact.destination,
        temporaryPath: opened.temporaryPath,
      });
    }
    await hooks.beforePublish?.();
    for (const artifact of temporary) {
      await link(
        artifact.temporaryPath,
        artifact.destination,
      );
      const linked = await lstat(artifact.temporaryPath);
      published.push({
        destination: artifact.destination,
        device: linked.dev,
        inode: linked.ino,
      });
    }
    await syncDirectory(
      path.dirname(artifacts[0].destination),
    );
  } catch (error) {
    for (const artifact of [...published].reverse()) {
      await unlinkPublishedArtifact(artifact);
    }
    await syncDirectory(
      path.dirname(artifacts[0].destination),
    ).catch(() => undefined);
    throw error;
  } finally {
    for (const artifact of temporary) {
      await unlink(artifact.temporaryPath).catch(
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
  await preparePrivateSource({
    cwd: resolvedCwd,
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
  if (rows.length < 1 || rows.length > MAX_PRIVATE_ROWS) {
    throw new Error("PRIVATE_AGENT_PASS_CSV_INVALID");
  }
  rows.forEach(validatePrivateRow);
  const pageCount = Math.ceil(
    rows.length / CARDS_PER_SHEET,
  );
  const destinations = privateBundleDestinations(
    destination.destination,
    pageCount,
  );
  await assertPrivateDestinations(
    resolvedCwd,
    source.privateRoot,
    source.destination,
    destinations,
  );

  let artifacts: readonly PrivateArtifact[];
  try {
    const photo = await readFile(
      path.join(
        resolvedCwd,
        "public/media/ygf-user-photo.png",
      ),
    );
    artifacts = await renderPrivateArtifacts({
      destinations,
      html: serializePrivateAgentPassBatch(rows),
      pageCount,
      photo,
      rows,
    });
  } catch {
    throw new Error("PRIVATE_AGENT_PASS_RENDER_FAILED");
  }
  if (
    artifacts.length !== destinations.length ||
    !artifacts.every(
      (artifact, index) =>
        artifact.destination === destinations[index],
    )
  ) {
    throw new Error("PRIVATE_AGENT_PASS_RENDER_FAILED");
  }
  await publishPrivateBundleAtomically(artifacts, hooks);
  return {
    destination: destination.destination,
    destinations,
    pageCount,
    rowCount: rows.length,
    source: source.destination,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === scriptPath
) {
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
          `Rendered ${result.rowCount} protected Agent Pass rows into ${result.destinations.length} private files.\n`,
        );
      })
      .catch((error: unknown) => {
        const safeMessages = new Set([
          "PRIVATE_AGENT_PASS_CSV_INVALID",
          "PRIVATE_AGENT_PASS_PATH_REQUIRED",
          "PRIVATE_AGENT_PASS_RENDER_FAILED",
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
