import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import jsQR from "jsqr";
import QRCode from "qrcode";

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
  "ygf-user-photo.png",
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
const LABEL_WIDTH = Math.round(LABEL_WIDTH_IN * PRINT_DPI);
const LABEL_HEIGHT = Math.round(LABEL_HEIGHT_IN * PRINT_DPI);
const QR_QUIET_ZONE = 4;

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
    `<metadata data-renderer="ygf-static-redemption-card-v1" data-side="front" data-bleed-width-in="${BLEED_WIDTH_IN}" data-bleed-height-in="${BLEED_HEIGHT_IN}" data-trim-width-in="${TRIM_WIDTH_IN}" data-trim-height-in="${TRIM_HEIGHT_IN}" data-photo-source="user-provided" data-rights-status="pending-brand-rights-confirmation"/>`,
    '<defs>',
    '<clipPath id="front-photo-clip"><path d="M610 0 H1125 V675 H535 L650 0 Z"/></clipPath>',
    `<image id="agent-pass-photo-source" href="../../public/media/ygf-user-photo.png" x="510" y="0" width="615" height="675" preserveAspectRatio="xMidYMid slice"/>`,
    '</defs>',
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.red}"/>`,
    '<g clip-path="url(#front-photo-clip)"><use href="#agent-pass-photo-source"/></g>',
    `<path d="M610 0 H680 L565 675 H495 Z" fill="${COLOR.gold}"/>`,
    `<rect x="58" y="58" width="1009" height="559" rx="26" fill="none" stroke="${COLOR.gold}" stroke-width="4"/>`,
    `<text x="94" y="118" fill="${COLOR.gold}" font-family="${FONT_FAMILY}" font-size="24" font-weight="900" letter-spacing="4">YGF BOWL-TO-BUILD</text>`,
    `<text x="94" y="218" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="59" font-weight="900"><tspan x="94" dy="0">吃一碗，</tspan><tspan x="94" dy="72">给 AI 充点算力。</tspan></text>`,
    `<text x="94" y="386" fill="${COLOR.gold}" font-family="${FONT_FAMILY}" font-size="34" font-weight="900">领取 3,000 YGF AI Credits</text>`,
    `<rect x="94" y="430" width="186" height="58" rx="29" fill="${COLOR.gold}"/>`,
    `<text x="187" y="468" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="23" font-weight="900">14 天有效</text>`,
    `<text x="94" y="541" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="22" font-weight="800">学习 · 编程 · 求职 · 下一碗</text>`,
    `<text x="94" y="583" fill="${COLOR.gold}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900">#一碗一算力</text>`,
    '</svg>',
    '',
  ].join("\n");
}

export function renderStaticCardBackSvg(): string {
  const qr = renderQr(STATIC_REDEEM_URL, 76, 75, 240);
  const labelX = (CARD_WIDTH - LABEL_WIDTH) / 2;
  const labelY = 312;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="back-title back-description" width="${BLEED_WIDTH_IN}in" height="${BLEED_HEIGHT_IN}in" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">`,
    '<title id="back-title">YGF static redemption QR card back</title>',
    '<desc id="back-description">A credential-free static QR back with an exact Avery 5260 visible-code label placement area.</desc>',
    `<metadata data-renderer="ygf-static-redemption-card-v1" data-side="back" data-static-qr="${STATIC_REDEEM_URL}" data-bleed-width-in="${BLEED_WIDTH_IN}" data-bleed-height-in="${BLEED_HEIGHT_IN}" data-trim-width-in="${TRIM_WIDTH_IN}" data-trim-height-in="${TRIM_HEIGHT_IN}" data-label-width-in="${LABEL_WIDTH_IN}" data-label-height-in="${LABEL_HEIGHT_IN}" data-visible-code-policy="manager-approval-required"/>`,
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.cream}"/>`,
    `<rect x="0" y="0" width="46" height="${CARD_HEIGHT}" fill="${COLOR.red}"/>`,
    `<path d="M46 0 H158 L46 112 Z" fill="${COLOR.gold}"/>`,
    `<rect x="58" y="58" width="1009" height="559" rx="26" fill="none" stroke="${COLOR.gold}" stroke-width="4"/>`,
    qr,
    `<text x="365" y="115" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="25" font-weight="900" letter-spacing="2">YGF BOWL-TO-BUILD</text>`,
    `<text x="365" y="178" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="39" font-weight="900">扫码进入兑换页</text>`,
    `<text x="365" y="217" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="20" font-weight="900" letter-spacing="2.5">SCAN TO REDEEM</text>`,
    `<text x="365" y="264" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="20" font-weight="800">1 扫码  ·  2 输入标签上的 8 位兑换码</text>`,
    `<text x="365" y="296" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="16" font-weight="700">完成 $25+ 消费后领取 · 每张卡仅兑换一次</text>`,
    `<g data-avery-label-slot="5260" data-label-width-in="${LABEL_WIDTH_IN}" data-label-height-in="${LABEL_HEIGHT_IN}">`,
    `<rect x="${labelX}" y="${labelY}" width="${LABEL_WIDTH}" height="${LABEL_HEIGHT}" rx="18" fill="${COLOR.white}" stroke="${COLOR.red}" stroke-width="4" stroke-dasharray="14 10"/>`,
    `<text x="${CARD_WIDTH / 2}" y="${labelY + 121}" text-anchor="middle" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="28" font-weight="900">在此粘贴 Avery 5260 兑换码标签</text>`,
    `<text x="${CARD_WIDTH / 2}" y="${labelY + 165}" text-anchor="middle" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="17" font-weight="800" letter-spacing="1.5">APPLY UNIQUE CODE LABEL HERE</text>`,
    `<text x="${CARD_WIDTH / 2}" y="${labelY + 213}" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="16" font-weight="700">真实兑换码只在本地合并打印，不上传给卡片印刷商</text>`,
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
    `<metadata data-renderer="ygf-static-redemption-card-v1" data-side="label-sample" data-placeholder="true" data-label-width-in="${LABEL_WIDTH_IN}" data-label-height-in="${LABEL_HEIGHT_IN}"/>`,
    `<rect width="${LABEL_WIDTH}" height="${LABEL_HEIGHT}" rx="18" fill="${COLOR.white}"/>`,
    `<rect x="3" y="3" width="${LABEL_WIDTH - 6}" height="${LABEL_HEIGHT - 6}" rx="16" fill="none" stroke="${COLOR.red}" stroke-width="6"/>`,
    `<text x="${LABEL_WIDTH / 2}" y="55" text-anchor="middle" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="26" font-weight="900" letter-spacing="2">您的 8 位兑换码 · YOUR CODE</text>`,
    `<text x="${LABEL_WIDTH / 2}" y="165" text-anchor="middle" fill="${COLOR.ink}" font-family="${MONO_FONT}" font-size="76" font-weight="900" letter-spacing="13">${SAMPLE_CODE}</text>`,
    `<text x="${LABEL_WIDTH / 2}" y="222" text-anchor="middle" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="18" font-weight="800">每张仅兑换一次 · 请勿拍照分享</text>`,
    `<text x="${LABEL_WIDTH / 2}" y="258" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="15" font-weight="800" letter-spacing="1.2">SAMPLE ONLY · NOT A LIVE CODE</text>`,
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
    `<text x="100" y="155" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="25" font-weight="700">STATIC QR · VISIBLE UNIQUE CODE LABEL · 300 DPI</text>`,
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
  const photo = await readFile(photoPath);
  const frontSvg = renderStaticCardFrontSvg();
  const backSvg = renderStaticCardBackSvg();
  const labelSvg = renderCodeLabelSampleSvg();
  verifyNoScratchLanguage(frontSvg, backSvg, labelSvg);

  const [frontPng, backPng, labelPng] = await Promise.all([
    rasterizeAgentPassSvg(frontSvg, CARD_WIDTH, CARD_HEIGHT, photo),
    rasterizeAgentPassSvg(backSvg, CARD_WIDTH, CARD_HEIGHT, photo),
    rasterizeAgentPassSvg(labelSvg, LABEL_WIDTH, LABEL_HEIGHT, photo),
  ]);
  verifyQr(backPng);

  const frontDigest = digest(frontSvg);
  const backDigest = digest(backSvg);
  const combinedDigest = digest(`${frontSvg}\n${backSvg}`);
  const pageWidthPt = BLEED_WIDTH_IN * 72;
  const pageHeightPt = BLEED_HEIGHT_IN * 72;
  const frontPdf = buildAgentPassRasterPdf({
    pageHeightPt,
    pages: [frontPng],
    pageWidthPt,
    sourceDigest: frontDigest,
    title: "YGF Static Redemption Card Front",
  });
  const backPdf = buildAgentPassRasterPdf({
    pageHeightPt,
    pages: [backPng],
    pageWidthPt,
    sourceDigest: backDigest,
    title: "YGF Static Redemption Card Back",
  });
  const duplexPdf = buildAgentPassRasterPdf({
    pageHeightPt,
    pages: [frontPng, backPng],
    pageWidthPt,
    sourceDigest: combinedDigest,
    title: "YGF Static Redemption Card Duplex",
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
      staticQr: STATIC_REDEEM_URL,
      label: {
        product: "Avery 5260",
        sizeInches: [LABEL_WIDTH_IN, LABEL_HEIGHT_IN],
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
    },
    sources: {
      photo: "public/media/ygf-user-photo.png",
      photoSha256: digest(photo),
      photoRightsStatus: "pending-brand-rights-confirmation",
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
      `- Static QR: ${STATIC_REDEEM_URL}`,
      "- Variable field: Avery 5260, 2.625 x 1 inch label, printed locally from the ignored private CSV.",
      "- The checked-in label uses SAMPLE ONLY value A7K3B9Q2. No live redemption code is included.",
      "- Do not upload the private code CSV to Staples or another card printer.",
      "- This version uses a visible code label with no concealment layer. Current operations documentation still requires manager approval for that custody model before physical distribution.",
      "- Scan the physical proof under store lighting before release.",
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
