import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import jsQR from "jsqr";
import QRCode from "qrcode";

// @ts-expect-error Node 22's type-stripping runtime requires the source extension.
import { RESERVED_PUBLIC_SAMPLE_CODES } from "../lib/admin/code-batch.ts";

import {
  buildAgentPassRasterPdf,
  decodeAgentPassPngRgb,
  rasterizeAgentPassSvg,
  // @ts-expect-error Node 22 type stripping requires the source extension.
} from "./render-agent-pass-assets.mts";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const outputRoot = path.join(repositoryRoot, "output", "redemption-card");
const pdfOutputRoot = path.join(repositoryRoot, "output", "pdf");
const photoPath = path.join(
  repositoryRoot,
  "public",
  "media",
  "ygf-authentic-hero-mobile-card.png",
);
const logoPath = path.join(
  repositoryRoot,
  "public",
  "media",
  "ygf-official-logo.png",
);

const STATIC_REDEEM_URL = "https://malatangai.com/redeem";
const SAMPLE_CODE = "A7K3B9Q2";
const PRINT_DPI = 300;
const BLEED_WIDTH_IN = 3.75;
const BLEED_HEIGHT_IN = 2.25;
const TRIM_WIDTH_IN = 3.5;
const TRIM_HEIGHT_IN = 2;
const LABEL_WIDTH_IN = 2.625;
const LABEL_HEIGHT_IN = 1;
const CARD_WIDTH = Math.round(BLEED_WIDTH_IN * PRINT_DPI);
const CARD_HEIGHT = Math.round(BLEED_HEIGHT_IN * PRINT_DPI);
const LABEL_WIDTH = LABEL_WIDTH_IN * PRINT_DPI;
const LABEL_HEIGHT = LABEL_HEIGHT_IN * PRINT_DPI;
const LABEL_RASTER_WIDTH = Math.round(LABEL_WIDTH);
const LABEL_RASTER_HEIGHT = Math.round(LABEL_HEIGHT);
const QR_QUIET_ZONE = 4;
const MIN_CUSTOMER_TEXT_PT = 6;
const MIN_CUSTOMER_TEXT_PX = Math.ceil(
  (MIN_CUSTOMER_TEXT_PT * PRINT_DPI) / 72,
);
const MIN_ACTION_TEXT_PT = 7;
const MIN_ACTION_TEXT_PX = Math.ceil(
  (MIN_ACTION_TEXT_PT * PRINT_DPI) / 72,
);
const SAFE_INSET_IN = 0.125;
const SAFE_INSET_PX = SAFE_INSET_IN * PRINT_DPI;
const TRIM_LEFT_PX = (CARD_WIDTH - TRIM_WIDTH_IN * PRINT_DPI) / 2;
const TRIM_TOP_PX = (CARD_HEIGHT - TRIM_HEIGHT_IN * PRINT_DPI) / 2;
const TRIM_RIGHT_PX = CARD_WIDTH - TRIM_LEFT_PX;
const TRIM_BOTTOM_PX = CARD_HEIGHT - TRIM_TOP_PX;
const QR_X = 76;
const QR_Y = 75;
const QR_SIZE = 210;
const LABEL_X = (CARD_WIDTH - LABEL_WIDTH) / 2;
const LABEL_Y = 300;

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

const MONO_FONT =
  "SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function inlineOfficialLogo(svg: string, logo: Buffer): string {
  const dataUrl = `data:image/png;base64,${logo.toString("base64")}`;
  const inlined = svg.replace(
    /(<image id="ygf-official-logo-source" href=")[^"]+(")/,
    `$1${dataUrl}$2`,
  );
  if (
    svg.includes('id="ygf-official-logo-source"') &&
    inlined === svg
  ) {
    throw new Error("STATIC_CARD_LOGO_REFERENCE_INVALID");
  }
  return inlined;
}

function qrGeometry(value: string): Readonly<{
  moduleCount: number;
  modules: readonly Readonly<{ x: number; y: number }>[];
  totalModules: number;
}> {
  const code = QRCode.create(value, { errorCorrectionLevel: "M" });
  const modules: Array<Readonly<{ x: number; y: number }>> = [];
  for (let row = 0; row < code.modules.size; row += 1) {
    for (let column = 0; column < code.modules.size; column += 1) {
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

function renderQr(value: string, x: number, y: number, size: number): string {
  const qr = qrGeometry(value);
  const moduleSize = size / qr.totalModules;
  const modules = qr.modules
    .map(
      (module) =>
        `<rect x="${module.x}" y="${module.y}" width="1" height="1"/>`,
    )
    .join("");
  return [
    `<g transform="translate(${x} ${y}) scale(${moduleSize})" data-static-redeem-url="${escapeXml(value)}" data-qr-modules="${qr.moduleCount}" data-qr-quiet-zone="${QR_QUIET_ZONE}">`,
    `<rect x="0" y="0" width="${qr.totalModules}" height="${qr.totalModules}" fill="${COLOR.white}"/>`,
    `<g fill="${COLOR.ink}">${modules}</g>`,
    "</g>",
  ].join("");
}

export function renderStaticCardFrontSvg(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="front-title front-description" width="${BLEED_WIDTH_IN}in" height="${BLEED_HEIGHT_IN}in" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">`,
    '<title id="front-title">YGF Bowl-to-Build redemption card front</title>',
    '<desc id="front-description">A photo-forward YGF card for a 3,000-Credit Bowl-to-Build promotion.</desc>',
    `<metadata data-renderer="ygf-static-redemption-card-v1" data-side="front" data-bleed-width-in="${BLEED_WIDTH_IN}" data-bleed-height-in="${BLEED_HEIGHT_IN}" data-trim-width-in="${TRIM_WIDTH_IN}" data-trim-height-in="${TRIM_HEIGHT_IN}" data-min-customer-text-pt="${MIN_CUSTOMER_TEXT_PT}" data-min-action-text-pt="${MIN_ACTION_TEXT_PT}" data-safe-inset-in="${SAFE_INSET_IN}" data-photo-source="ygf-existing-ai-enhanced-composite" data-photo-rights-status="pending-creative-brand-approval" data-logo-source="https://www.ygfus.com/images/logoone.png" data-logo-rights-status="brand-approval-required" data-languages="zh-CN,en"/>`,
    '<defs>',
    '<clipPath id="front-photo-clip"><path d="M610 0 H1125 V675 H535 L650 0 Z"/></clipPath>',
    `<image id="agent-pass-photo-source" href="../../public/media/ygf-authentic-hero-mobile-card.png" x="460" y="-230" width="820" height="1025" preserveAspectRatio="xMidYMid slice"/>`,
    '</defs>',
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.red}"/>`,
    '<g clip-path="url(#front-photo-clip)"><use href="#agent-pass-photo-source"/></g>',
    `<path d="M610 0 H680 L565 675 H495 Z" fill="${COLOR.gold}"/>`,
    `<rect x="58" y="58" width="1009" height="559" rx="26" fill="none" stroke="${COLOR.gold}" stroke-width="4"/>`,
    `<rect x="82" y="68" width="306" height="90" rx="18" fill="${COLOR.cream}"/>`,
    `<image id="ygf-official-logo-source" href="../../public/media/ygf-official-logo.png" x="103" y="74" width="264" height="82" preserveAspectRatio="xMidYMid meet"/>`,
    `<text data-customer-copy="true" x="94" y="218" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="49" font-weight="900"><tspan x="94" dy="0">吃一碗。</tspan><tspan x="94" dy="60">用 AI 开始创造。</tspan></text>`,
    `<text data-customer-copy="true" x="94" y="320" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900" letter-spacing="0.7">BUY A BOWL. BUILD WITH AI.</text>`,
    `<text data-customer-copy="true" x="94" y="371" fill="${COLOR.gold}" font-family="${FONT_FAMILY}" font-size="30" font-weight="900">领取 / CLAIM 3,000 AI Credits</text>`,
    `<rect x="94" y="396" width="344" height="88" rx="28" fill="${COLOR.gold}"/>`,
    `<text data-customer-copy="true" x="266" y="432" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900">单笔消费满 $25</text>`,
    `<text data-customer-copy="true" x="266" y="466" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900">SPEND $25+ AT YGF</text>`,
    `<text data-customer-copy="true" data-action-copy="true" x="94" y="535" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="30" font-weight="900">结账时领取</text>`,
    `<text data-customer-copy="true" data-action-copy="true" x="94" y="576" fill="${COLOR.gold}" font-family="${FONT_FAMILY}" font-size="30" font-weight="900">GET CARD AT CHECKOUT</text>`,
    '</svg>',
    '',
  ].join("\n");
}

export function renderStaticCardBackSvg(): string {
  const qr = renderQr(STATIC_REDEEM_URL, QR_X, QR_Y, QR_SIZE);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="back-title back-description" width="${BLEED_WIDTH_IN}in" height="${BLEED_HEIGHT_IN}in" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">`,
    '<title id="back-title">YGF static redemption QR card back</title>',
    '<desc id="back-description">A credential-free static QR back with an exact Avery 5260 visible-code label placement area.</desc>',
    `<metadata data-renderer="ygf-static-redemption-card-v1" data-side="back" data-static-qr="${STATIC_REDEEM_URL}" data-bleed-width-in="${BLEED_WIDTH_IN}" data-bleed-height-in="${BLEED_HEIGHT_IN}" data-trim-width-in="${TRIM_WIDTH_IN}" data-trim-height-in="${TRIM_HEIGHT_IN}" data-label-width-in="${LABEL_WIDTH_IN}" data-label-height-in="${LABEL_HEIGHT_IN}" data-min-customer-text-pt="${MIN_CUSTOMER_TEXT_PT}" data-min-action-text-pt="${MIN_ACTION_TEXT_PT}" data-safe-inset-in="${SAFE_INSET_IN}" data-visible-code-policy="manager-approval-required" data-logo-source="https://www.ygfus.com/images/logoone.png" data-logo-rights-status="brand-approval-required" data-languages="zh-CN,en"/>`,
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.cream}"/>`,
    `<rect x="0" y="0" width="46" height="${CARD_HEIGHT}" fill="${COLOR.red}"/>`,
    `<path d="M46 0 H158 L46 112 Z" fill="${COLOR.gold}"/>`,
    `<rect x="58" y="58" width="1009" height="559" rx="26" fill="none" stroke="${COLOR.gold}" stroke-width="4"/>`,
    qr,
    `<rect x="356" y="66" width="246" height="76" rx="15" fill="${COLOR.white}"/>`,
    `<image id="ygf-official-logo-source" href="../../public/media/ygf-official-logo.png" x="370" y="72" width="218" height="68" preserveAspectRatio="xMidYMid meet"/>`,
    `<text data-customer-copy="true" x="622" y="105" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900" letter-spacing="0.6">BOWL-TO-BUILD</text>`,
    `<text data-customer-copy="true" data-action-copy="true" x="365" y="170" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="34" font-weight="900">扫码兑换 · SCAN TO CLAIM</text>`,
    `<text data-customer-copy="true" data-action-copy="true" x="365" y="226" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="30" font-weight="900">1 扫码进入兑换页 · SCAN QR TO REDEEM</text>`,
    `<text data-customer-copy="true" data-action-copy="true" x="365" y="270" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="30" font-weight="900">2 输入 8 位码 · ENTER 8-CHAR CODE</text>`,
    `<g data-avery-label-slot="5260" data-label-width-in="${LABEL_WIDTH_IN}" data-label-height-in="${LABEL_HEIGHT_IN}" data-label-x-px="${LABEL_X}" data-label-y-px="${LABEL_Y}" data-trim-clearance-bottom-in="${SAFE_INSET_IN}">`,
    `<rect x="${LABEL_X}" y="${LABEL_Y}" width="${LABEL_WIDTH}" height="${LABEL_HEIGHT}" rx="18" fill="${COLOR.white}" stroke="${COLOR.red}" stroke-width="4" stroke-dasharray="14 10"/>`,
    `<text data-customer-copy="true" x="${CARD_WIDTH / 2}" y="${LABEL_Y + 126}" text-anchor="middle" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900">在此粘贴 Avery 5260 兑换码标签</text>`,
    `<text data-customer-copy="true" x="${CARD_WIDTH / 2}" y="${LABEL_Y + 174}" text-anchor="middle" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900">APPLY AVERY 5260 CODE LABEL HERE</text>`,
    '</g>',
    '</svg>',
    '',
  ].join("\n");
}

export function renderCodeLabelSampleSvg(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="label-title label-description" width="${LABEL_WIDTH_IN}in" height="${LABEL_HEIGHT_IN}in" viewBox="0 0 ${LABEL_WIDTH} ${LABEL_HEIGHT}">`,
    '<title id="label-title">Avery 5260 YGF code label sample</title>',
    `<desc id="label-description">A sample-only visible eight-character redemption label using ${SAMPLE_CODE}. It is not a live credential.</desc>`,
    `<metadata data-renderer="ygf-static-redemption-card-v1" data-side="label-sample" data-placeholder="true" data-label-width-in="${LABEL_WIDTH_IN}" data-label-height-in="${LABEL_HEIGHT_IN}" data-min-customer-text-pt="${MIN_CUSTOMER_TEXT_PT}" data-borderless="true" data-content-inset-in="0.0625"/>`,
    `<rect width="${LABEL_WIDTH}" height="${LABEL_HEIGHT}" rx="18" fill="${COLOR.white}"/>`,
    `<text data-customer-copy="true" x="${LABEL_WIDTH / 2}" y="45" text-anchor="middle" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900" letter-spacing="0.5">您的 8 位兑换码 · YOUR 8-CHARACTER CODE</text>`,
    `<text data-customer-copy="true" x="${LABEL_WIDTH / 2}" y="140" text-anchor="middle" fill="${COLOR.ink}" font-family="${MONO_FONT}" font-size="72" font-weight="900" letter-spacing="13">${SAMPLE_CODE}</text>`,
    `<text data-customer-copy="true" x="${LABEL_WIDTH / 2}" y="191" text-anchor="middle" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900">每卡一次 · ONE CLAIM PER CARD</text>`,
    `<text data-customer-copy="true" x="${LABEL_WIDTH / 2}" y="232" text-anchor="middle" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900">最新新卡起 14 天 · 14 DAYS FROM LATEST NEW CARD</text>`,
    `<text data-customer-copy="true" x="${LABEL_WIDTH / 2}" y="274" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900">示例码 · SAMPLE ONLY - NOT LIVE</text>`,
    '</svg>',
    '',
  ].join("\n");
}

function renderReviewSvg(options: Readonly<{
  backPng: Buffer;
  frontPng: Buffer;
  labelPng: Buffer;
}>): string {
  const front = `data:image/png;base64,${options.frontPng.toString("base64")}`;
  const back = `data:image/png;base64,${options.backPng.toString("base64")}`;
  const label = `data:image/png;base64,${options.labelPng.toString("base64")}`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="review-title review-description" width="2000" height="1350" viewBox="0 0 2000 1350">',
    '<title id="review-title">YGF static redemption card design review</title>',
    '<desc id="review-description">Front, back, and visible-code label sample shown together for review.</desc>',
    `<rect width="2000" height="1350" fill="#EEE8DD"/>`,
    `<text x="100" y="108" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="54" font-weight="900">YGF Redemption Card</text>`,
    `<text x="100" y="155" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="25" font-weight="700">BILINGUAL ZH + EN · OFFICIAL-SITE LOGO SOURCE · 300 DPI</text>`,
    '<rect x="92" y="212" width="858" height="531" rx="26" fill="#000000" opacity="0.13"/>',
    `<image href="${front}" x="72" y="190" width="858" height="515"/>`,
    `<text x="72" y="752" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="24" font-weight="900">FRONT · 品牌面</text>`,
    '<rect x="1062" y="212" width="858" height="531" rx="26" fill="#000000" opacity="0.13"/>',
    `<image href="${back}" x="1042" y="190" width="858" height="515"/>`,
    `<text x="1042" y="752" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="24" font-weight="900">BACK · 静态 QR + 标签定位区</text>`,
    `<text x="100" y="878" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="34" font-weight="900">Avery 5260 visible-code label sample</text>`,
    '<rect x="493" y="944" width="1014" height="386" rx="26" fill="#000000" opacity="0.12"/>',
    `<image href="${label}" x="475" y="925" width="1050" height="400"/>`,
    '</svg>',
    '',
  ].join("\n");
}

function verifyNoScratchLanguage(...values: string[]): void {
  const joined = values.join("\n");
  if (/scratch|刮开|刮刮/i.test(joined)) {
    throw new Error("STATIC_CARD_SCRATCH_LANGUAGE_FORBIDDEN");
  }
}

function verifyMinimumCustomerTextSize(...values: string[]): void {
  const customerTextTags = values
    .flatMap((value) => [...value.matchAll(/<text\b[^>]*>/g)])
    .map((match) => match[0])
    .filter((tag) => tag.includes('data-customer-copy="true"'));
  if (customerTextTags.length < 1) {
    throw new Error("STATIC_CARD_CUSTOMER_COPY_MISSING");
  }
  for (const tag of customerTextTags) {
    const fontSize = Number(tag.match(/font-size="([\d.]+)"/)?.[1]);
    if (!Number.isFinite(fontSize) || fontSize < MIN_CUSTOMER_TEXT_PX) {
      throw new Error("STATIC_CARD_CUSTOMER_TEXT_TOO_SMALL");
    }
    if (
      tag.includes('data-action-copy="true"') &&
      fontSize < MIN_ACTION_TEXT_PX
    ) {
      throw new Error("STATIC_CARD_ACTION_TEXT_TOO_SMALL");
    }
  }
}

function verifyStaticCardLayout(): void {
  const labelClearances = [
    LABEL_X - TRIM_LEFT_PX,
    TRIM_RIGHT_PX - (LABEL_X + LABEL_WIDTH),
    LABEL_Y - TRIM_TOP_PX,
    TRIM_BOTTOM_PX - (LABEL_Y + LABEL_HEIGHT),
  ];
  if (
    labelClearances.some(
      (clearance) => clearance + Number.EPSILON < SAFE_INSET_PX,
    )
  ) {
    throw new Error("STATIC_CARD_LABEL_SAFE_INSET_INVALID");
  }
  const qrClearances = [
    QR_X - TRIM_LEFT_PX,
    QR_Y - TRIM_TOP_PX,
    TRIM_RIGHT_PX - (QR_X + QR_SIZE),
    TRIM_BOTTOM_PX - (QR_Y + QR_SIZE),
  ];
  if (
    qrClearances.some(
      (clearance) => clearance + Number.EPSILON < SAFE_INSET_PX,
    ) ||
    QR_Y + QR_SIZE >= LABEL_Y ||
    QR_QUIET_ZONE < 4
  ) {
    throw new Error("STATIC_CARD_QR_LAYOUT_INVALID");
  }
}

function verifyQr(png: Buffer): void {
  const decoded = decodeAgentPassPngRgb(png);
  const rgba = new Uint8ClampedArray(
    decoded.width * decoded.height * 4,
  );
  for (let index = 0; index < decoded.width * decoded.height; index += 1) {
    rgba[index * 4] = decoded.pixels[index * 3];
    rgba[index * 4 + 1] = decoded.pixels[index * 3 + 1];
    rgba[index * 4 + 2] = decoded.pixels[index * 3 + 2];
    rgba[index * 4 + 3] = 255;
  }
  const result = jsQR(
    rgba,
    decoded.width,
    decoded.height,
  );
  if (result?.data !== STATIC_REDEEM_URL) {
    throw new Error("STATIC_CARD_QR_DECODE_FAILED");
  }
}

async function main(): Promise<void> {
  if (!RESERVED_PUBLIC_SAMPLE_CODES.has(SAMPLE_CODE)) {
    throw new Error("STATIC_CARD_SAMPLE_CODE_NOT_RESERVED");
  }
  const [photo, logo] = await Promise.all([
    readFile(photoPath),
    readFile(logoPath),
  ]);
  const frontSvg = renderStaticCardFrontSvg();
  const backSvg = renderStaticCardBackSvg();
  const labelSvg = renderCodeLabelSampleSvg();
  verifyNoScratchLanguage(frontSvg, backSvg, labelSvg);
  verifyMinimumCustomerTextSize(frontSvg, backSvg, labelSvg);
  verifyStaticCardLayout();
  const frontSvgForRaster = inlineOfficialLogo(frontSvg, logo);
  const backSvgForRaster = inlineOfficialLogo(backSvg, logo);

  const [frontPng, backPng, labelPng] = await Promise.all([
    rasterizeAgentPassSvg(frontSvgForRaster, CARD_WIDTH, CARD_HEIGHT, photo),
    rasterizeAgentPassSvg(backSvgForRaster, CARD_WIDTH, CARD_HEIGHT, photo),
    rasterizeAgentPassSvg(
      labelSvg,
      LABEL_RASTER_WIDTH,
      LABEL_RASTER_HEIGHT,
      photo,
    ),
  ]);
  verifyQr(backPng);

  const logoDigest = digest(logo);
  const frontDigest = digest(`${frontSvg}\nlogo:${logoDigest}`);
  const backDigest = digest(`${backSvg}\nlogo:${logoDigest}`);
  const combinedDigest = digest(
    `${frontSvg}\n${backSvg}\nlogo:${logoDigest}`,
  );
  const pageWidthPt = BLEED_WIDTH_IN * 72;
  const pageHeightPt = BLEED_HEIGHT_IN * 72;
  const trimSizePt = {
    height: TRIM_HEIGHT_IN * 72,
    width: TRIM_WIDTH_IN * 72,
  };
  const frontPdf = buildAgentPassRasterPdf({
    pageHeightPt,
    pages: [frontPng],
    pageWidthPt,
    sourceDigest: frontDigest,
    title: "YGF Static Redemption Card Front",
    trimSizePt,
  });
  const backPdf = buildAgentPassRasterPdf({
    pageHeightPt,
    pages: [backPng],
    pageWidthPt,
    sourceDigest: backDigest,
    title: "YGF Static Redemption Card Back",
    trimSizePt,
  });
  const duplexPdf = buildAgentPassRasterPdf({
    pageHeightPt,
    pages: [frontPng, backPng],
    pageWidthPt,
    sourceDigest: combinedDigest,
    title: "YGF Static Redemption Card Duplex",
    trimSizePt,
  });
  const reviewSvg = renderReviewSvg({ backPng, frontPng, labelPng });
  const reviewPng = await rasterizeAgentPassSvg(
    reviewSvg,
    2000,
    1350,
    photo,
  );

  await Promise.all([
    mkdir(outputRoot, { recursive: true }),
    mkdir(pdfOutputRoot, { recursive: true }),
  ]);

  const outputs = new Map<string, string | Buffer>([
    ["ygf-redemption-card-front.svg", frontSvg],
    ["ygf-redemption-card-back.svg", backSvg],
    ["ygf-redemption-code-label-sample.svg", labelSvg],
    ["ygf-redemption-card-front.png", frontPng],
    ["ygf-redemption-card-back.png", backPng],
    ["ygf-redemption-code-label-sample.png", labelPng],
    ["ygf-redemption-card-review.png", reviewPng],
  ]);
  await Promise.all(
    [...outputs].map(([file, contents]) =>
      writeFile(path.join(outputRoot, file), contents),
    ),
  );
  await Promise.all([
    writeFile(path.join(pdfOutputRoot, "ygf-redemption-card-front.pdf"), frontPdf),
    writeFile(path.join(pdfOutputRoot, "ygf-redemption-card-back.pdf"), backPdf),
    writeFile(path.join(pdfOutputRoot, "ygf-redemption-card-duplex.pdf"), duplexPdf),
  ]);

  const manifest = {
    version: 1,
    renderer: "ygf-static-redemption-card-v1",
    sourceDigest: combinedDigest,
    design: {
      bleedInches: [BLEED_WIDTH_IN, BLEED_HEIGHT_IN],
      trimInches: [TRIM_WIDTH_IN, TRIM_HEIGHT_IN],
      dpi: PRINT_DPI,
      minimumCustomerTextPoints: MIN_CUSTOMER_TEXT_PT,
      minimumActionTextPoints: MIN_ACTION_TEXT_PT,
      safeInsetInches: SAFE_INSET_IN,
      pdfBoxes: {
        bleedAndMediaInches: [BLEED_WIDTH_IN, BLEED_HEIGHT_IN],
        trimInches: [TRIM_WIDTH_IN, TRIM_HEIGHT_IN],
        trimInsetInches: [SAFE_INSET_IN, SAFE_INSET_IN],
      },
      staticQr: STATIC_REDEEM_URL,
      qr: {
        quietZoneModules: QR_QUIET_ZONE,
        sizeInches: QR_SIZE / PRINT_DPI,
        xInches: QR_X / PRINT_DPI,
        yInches: QR_Y / PRINT_DPI,
      },
      label: {
        product: "Avery 5260",
        sizeInches: [LABEL_WIDTH_IN, LABEL_HEIGHT_IN],
        placementInches: [LABEL_X / PRINT_DPI, LABEL_Y / PRINT_DPI],
        trimClearanceInches: {
          bottom: (TRIM_BOTTOM_PX - (LABEL_Y + LABEL_HEIGHT)) / PRINT_DPI,
          left: (LABEL_X - TRIM_LEFT_PX) / PRINT_DPI,
          right:
            (TRIM_RIGHT_PX - (LABEL_X + LABEL_WIDTH)) / PRINT_DPI,
          top: (LABEL_Y - TRIM_TOP_PX) / PRINT_DPI,
        },
        sampleCode: SAMPLE_CODE,
        sampleOnly: true,
      },
    },
    controls: {
      liveCodesCommitted: false,
      liveCsvUploadedToCardPrinter: false,
      visibleCodeLabel: true,
      concealmentLayer: false,
      physicalDistributionAuthorized: false,
      visibleCodePolicyApprovalRequired: true,
      sampleCodeReservedFromProduction: true,
    },
    sources: {
      photo: "public/media/ygf-authentic-hero-mobile-card.png",
      photoSha256: digest(photo),
      photoRightsStatus: "user-source-ai-enhanced-pending-creative-brand-approval",
      logo: "public/media/ygf-official-logo.png",
      logoSourceUrl: "https://www.ygfus.com/images/logoone.png",
      logoSha256: logoDigest,
      logoRightsStatus: "official-site-source-brand-approval-required",
    },
    files: Object.fromEntries([
      ...[...outputs].map(([file, contents]) => [
        `output/redemption-card/${file}`,
        digest(contents),
      ]),
      ["output/pdf/ygf-redemption-card-front.pdf", digest(frontPdf)],
      ["output/pdf/ygf-redemption-card-back.pdf", digest(backPdf)],
      ["output/pdf/ygf-redemption-card-duplex.pdf", digest(duplexPdf)],
    ]),
  };
  await writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputRoot, "README.md"),
    [
      "# YGF static redemption card",
      "",
      "- Finished trim: 3.5 x 2 inches.",
      "- Upload canvas: 3.75 x 2.25 inches with 0.125-inch bleed.",
      "- Export resolution: 300 DPI.",
      "- PDF boxes: 3.75 x 2.25 inch MediaBox/BleedBox with a centered 3.5 x 2 inch TrimBox.",
      "- Customer-facing card and sample-label copy is at least 6 pt at the 300-DPI physical size.",
      "- Customer action copy is at least 7 pt at the 300-DPI physical size.",
      `- Static QR: ${STATIC_REDEEM_URL}`,
      "- Variable field: Avery 5260, 2.625 x 1 inch label, produced only through an approved local-only workflow from the ignored private CSV.",
      "- The Avery label slot stays at least 0.125 inch inside every finished trim edge.",
      "- The checked-in label uses SAMPLE ONLY value A7K3B9Q2. No live redemption code is included.",
      "- Do not upload the private code CSV to Staples or another card printer.",
      "- This version uses a visible code label with no concealment layer. Current operations documentation still requires manager approval for that custody model before physical distribution.",
      "- Front image: existing YGF mobile hero composite, derived from the user-provided ingredient-wall source with an AI-generated bowl. Creative and brand approval remain required.",
      "- Logo source: https://www.ygfus.com/images/logoone.png, referenced by the official YGF US home page. Brand approval remains required for production use.",
      "- Core offer, instructions, and code-label warnings are presented in Simplified Chinese and English.",
      "- Scan the physical proof under store lighting before release.",
      "- The static QR opens `/redeem` and never contains a claim; the customer manually enters the Avery label's eight-character code.",
      "- Reuse production batch `929c4026-7cfc-4a5e-bf3b-420d26e01ae2` from 2026-08-07. Do not reset or regenerate it for this card format.",
      "- Render the public fake-code sheet with `node scripts/render-avery-5260-labels.mts --sample`; it uses only `SAMPLE01` through `SAMPLE30`, which are invalid under the production alphabet.",
      "- The approved local-only merge command and its read-only verifier are documented in `docs/operations/avery-5260-label-production.md`. They consume the existing canonical CSV and cannot create, reset, or register codes.",
      "- Keep every private CSV and live label artifact directly under ignored `private/` at mode 0600. Reconcile labels with non-secret row references, never copied plaintext codes.",
      "- This documentation and renderer do not upload artwork or inventory, physically print labels, place an order, authorize distribution, or make a payment.",
      "- Follow `docs/operations/avery-5260-label-production.md` for the custody, proof, reconciliation, and release gates.",
      "",
    ].join("\n"),
  );

  process.stdout.write(
    `Rendered YGF static redemption card pack (${CARD_WIDTH}x${CARD_HEIGHT} at ${PRINT_DPI} DPI).\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "STATIC_CARD_RENDER_FAILED";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
