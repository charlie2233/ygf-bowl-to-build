import { deflateSync, inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ImageResponse } from "next/og.js";
import { createElement } from "react";

type AgentPassVariant = Readonly<{
  crop: "xMaxYMid" | "xMidYMid" | "xMinYMid";
  english: string;
  number: string;
  slug: "career" | "coding" | "pick-my-bowl" | "study";
  title: string;
}>;

type Paper = Readonly<{
  heightMm: number;
  name: "a4" | "letter";
  widthMm: number;
}>;

type PngDetails = Readonly<{
  colorType: number;
  height: number;
  metadataChunks: readonly string[];
  width: number;
}>;

type PdfTextCommand = Readonly<{
  color: string;
  fontSize: number;
  fontWeight: 400 | 600 | 700 | 800 | 900;
  letterSpacing?: number;
  lineHeight?: number;
  lines: readonly string[];
  textAnchor?: "middle" | "start";
  x: number;
  y: number;
}>;

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");

const PHOTO_FILE = "ygf-user-photo.png";
const PUBLIC_PHOTO_HREF = "../../media/ygf-user-photo.png";
const PRINT_PHOTO_HREF = "../../public/media/ygf-user-photo.png";
const PRINT_DPI = 300;
const PREVIEW_DPI = 120;
const PDF_INTEGRITY_PREFIX = "YGF_AGENT_PASS_SHA256_";
const PDF_SOURCE_PREFIX = "YGF_AGENT_PASS_SOURCE_";
const PNG_INTEGRITY_KEYWORD = "ygf-agent-pass";
const IMPOSITION_GUTTER_MM = 10;
const ARTIFACT_RENDER_VERSION =
  "ygf-agent-pass-layered-pdf-v2";

const COLOR = Object.freeze({
  cream: "#F6F0E4",
  gold: "#E8B94A",
  ink: "#16261F",
  red: "#D84A32",
  redBright: "#D84A32",
  sage: "#667868",
  white: "#FFFFFF",
});

const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Helvetica, Arial, sans-serif";

export const AGENT_PASS_SIZE = Object.freeze({
  heightMm: 54,
  viewHeight: 540,
  viewWidth: 856,
  widthMm: 85.6,
});

export const AGENT_PASS_COPY = Object.freeze({
  duration: "14 天有效",
  hashtag: "#一碗一算力",
  headline: "吃饱了，也给你的 AI 充点算力。",
  reward: "领取 3,000 YGF AI Credits",
  university:
    "This promotion is offered by YGF for the USC community and is not sponsored, endorsed by, or administered by the University of Southern California.",
  useCases: "学习 · 编程 · 求职 · 下一碗",
});

export const AGENT_PASS_VARIANTS: readonly AgentPassVariant[] = Object.freeze([
  Object.freeze({
    crop: "xMinYMid",
    english: "STUDY",
    number: "01 / 04",
    slug: "study",
    title: "学习",
  }),
  Object.freeze({
    crop: "xMidYMid",
    english: "CODING",
    number: "02 / 04",
    slug: "coding",
    title: "编程",
  }),
  Object.freeze({
    crop: "xMaxYMid",
    english: "CAREER",
    number: "03 / 04",
    slug: "career",
    title: "求职",
  }),
  Object.freeze({
    crop: "xMidYMid",
    english: "PICK MY BOWL",
    number: "04 / 04",
    slug: "pick-my-bowl",
    title: "下一碗",
  }),
]);

const PAPERS: readonly Paper[] = Object.freeze([
  Object.freeze({
    heightMm: 279.4,
    name: "letter",
    widthMm: 215.9,
  }),
  Object.freeze({
    heightMm: 297,
    name: "a4",
    widthMm: 210,
  }),
]);

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

function photoSymbol(photoHref: string): string {
  return `<image id="agent-pass-photo-source" href="${escapeXml(photoHref)}" width="1600" height="1200"/>`;
}

function frontBody(
  variant: AgentPassVariant,
  namespace: string,
): string {
  const clipId = `agent-pass-photo-clip-${namespace}`;
  const titleId = `agent-pass-use-case-${namespace}`;
  const englishLabelSize =
    variant.slug === "pick-my-bowl" ? 10.5 : 16;
  const englishLabelX =
    variant.slug === "pick-my-bowl" ? 166 : 150;
  const numberLabelX =
    variant.slug === "pick-my-bowl" ? 166 : 150;
  const photoX = {
    xMaxYMid: 136,
    xMidYMid: 259,
    xMinYMid: 382,
  }[variant.crop];
  return [
    `<defs><clipPath id="${clipId}"><rect x="382" y="0" width="474" height="540"/></clipPath></defs>`,
    `<rect width="856" height="540" fill="${COLOR.cream}"/>`,
    `<g clip-path="url(#${clipId})"><use href="#agent-pass-photo-source" transform="translate(${photoX} 0) scale(0.45)"/></g>`,
    `<rect x="0" y="0" width="472" height="540" fill="${COLOR.red}"/>`,
    `<path d="M472 0 L534 0 L472 84 Z" fill="${COLOR.gold}"/>`,
    `<rect x="18" y="18" width="820" height="504" rx="20" fill="none" stroke="${COLOR.gold}" stroke-width="3"/>`,
    `<text x="46" y="64" fill="${COLOR.gold}" font-family="${FONT_FAMILY}" font-size="18" font-weight="800" letter-spacing="2.8">YGF BOWL-TO-BUILD · AGENT PASS</text>`,
    `<g aria-labelledby="${titleId}">`,
    `<rect x="46" y="88" width="212" height="72" rx="12" fill="${COLOR.cream}"/>`,
    `<text id="${titleId}" x="66" y="126" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="31" font-weight="900">${escapeXml(variant.title)}</text>`,
    `<text x="${englishLabelX}" y="126" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="${englishLabelSize}" font-weight="800" letter-spacing="${variant.slug === "pick-my-bowl" ? 0.7 : 1.4}">${escapeXml(variant.english)}</text>`,
    `<text x="${numberLabelX}" y="148" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="12" font-weight="800" letter-spacing="1">${escapeXml(variant.number)}</text>`,
    "</g>",
    `<text x="46" y="207" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="33" font-weight="900"><tspan x="46" dy="0">吃饱了，也给你的 AI 充点</tspan><tspan x="46" dy="42">算力。</tspan></text>`,
    `<text x="46" y="304" fill="${COLOR.gold}" font-family="${FONT_FAMILY}" font-size="24" font-weight="900">${escapeXml(AGENT_PASS_COPY.reward)}</text>`,
    `<rect x="46" y="328" width="143" height="40" rx="20" fill="${COLOR.gold}"/>`,
    `<text x="117.5" y="355" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="17" font-weight="900">${escapeXml(AGENT_PASS_COPY.duration)}</text>`,
    `<text x="46" y="405" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="17" font-weight="800">${escapeXml(AGENT_PASS_COPY.useCases)}</text>`,
    `<text x="46" y="442" fill="${COLOR.gold}" font-family="${FONT_FAMILY}" font-size="20" font-weight="900">${escapeXml(AGENT_PASS_COPY.hashtag)}</text>`,
    `<rect x="0" y="456" width="856" height="84" fill="${COLOR.cream}" fill-opacity="0.96"/>`,
    `<text x="46" y="478" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="12" font-weight="900">COLLECT ALL FOUR · BUILD YOUR NEXT MOVE</text>`,
    `<text x="46" y="501" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="17.5" font-weight="700"><tspan x="46" dy="0">This promotion is offered by YGF for the USC community and is not sponsored,</tspan><tspan x="46" dy="22">endorsed by, or administered by the University of Southern California.</tspan></text>`,
  ].join("\n");
}

function sharedBackBody(namespace: string): string {
  return [
    `<rect width="856" height="540" fill="${COLOR.cream}"/>`,
    `<rect x="0" y="0" width="856" height="78" fill="${COLOR.red}"/>`,
    `<rect x="18" y="18" width="820" height="504" rx="20" fill="none" stroke="${COLOR.gold}" stroke-width="3"/>`,
    `<circle cx="64" cy="39" r="18" fill="${COLOR.gold}"/>`,
    `<text x="64" y="46" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="22" font-weight="900">Y</text>`,
    `<text x="96" y="49" fill="${COLOR.white}" font-family="${FONT_FAMILY}" font-size="23" font-weight="900" letter-spacing="2">YGF AGENT PASS</text>`,
    `<text x="46" y="118" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="31" font-weight="900">${escapeXml(AGENT_PASS_COPY.reward)}</text>`,
    `<text x="46" y="151" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="18" font-weight="900">${escapeXml(AGENT_PASS_COPY.duration)} · ${escapeXml(AGENT_PASS_COPY.hashtag)}</text>`,
    `<text x="46" y="184" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="13" font-weight="900" letter-spacing="1">3 STEPS · 三步开始</text>`,
    `<g data-agent-pass-steps="scratch-scan-start">`,
    `<rect x="46" y="198" width="216" height="60" rx="12" fill="${COLOR.white}"/>`,
    `<rect x="298" y="198" width="216" height="60" rx="12" fill="${COLOR.white}"/>`,
    `<rect x="550" y="198" width="260" height="60" rx="12" fill="${COLOR.white}"/>`,
    `<text x="62" y="235" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="18" font-weight="900">1 刮开 / OPEN</text>`,
    `<text x="314" y="235" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="18" font-weight="900">2 扫码 / SCAN</text>`,
    `<text x="566" y="235" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="18" font-weight="900">3 开始使用 / START USING</text>`,
    "</g>",
    `<g data-protected-overlay-slot="empty" aria-label="Protected checkout overlay area">`,
    `<rect x="46" y="275" width="764" height="120" rx="18" fill="${COLOR.white}" stroke="${COLOR.redBright}" stroke-width="3" stroke-dasharray="10 8"/>`,
    `<text x="428" y="312" text-anchor="middle" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="19" font-weight="900" letter-spacing="1.2">PROTECTED CHECKOUT OVERLAY AREA</text>`,
    `<text x="428" y="341" text-anchor="middle" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="15" font-weight="700">The public template is intentionally credential-free.</text>`,
    `<text x="428" y="369" text-anchor="middle" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="13" font-weight="600">Fulfilled passes receive a matched human code and scan target here.</text>`,
    "</g>",
    `<text x="46" y="425" fill="${COLOR.red}" font-family="${FONT_FAMILY}" font-size="20" font-weight="900">刮开后请勿拍照分享</text>`,
    `<text x="46" y="451" fill="${COLOR.ink}" font-family="${FONT_FAMILY}" font-size="13" font-weight="800">A physical claim unlocks credits. It is never an API credential.</text>`,
    `<text x="46" y="477" fill="${COLOR.sage}" font-family="${FONT_FAMILY}" font-size="17.5" font-weight="700"><tspan x="46" dy="0">This promotion is offered by YGF for the USC community and is not sponsored,</tspan><tspan x="46" dy="22">endorsed by, or administered by the University of Southern California.</tspan></text>`,
    `<metadata data-back-namespace="${escapeXml(namespace)}"/>`,
  ].join("\n");
}

function frontPdfTextCommands(
  variant: AgentPassVariant,
): readonly PdfTextCommand[] {
  const pickMyBowl = variant.slug === "pick-my-bowl";
  return [
    {
      color: COLOR.gold,
      fontSize: 18,
      fontWeight: 800,
      letterSpacing: 2.8,
      lines: ["YGF BOWL-TO-BUILD · AGENT PASS"],
      x: 46,
      y: 64,
    },
    {
      color: COLOR.red,
      fontSize: 31,
      fontWeight: 900,
      lines: [variant.title],
      x: 66,
      y: 126,
    },
    {
      color: COLOR.red,
      fontSize: pickMyBowl ? 10.5 : 16,
      fontWeight: 800,
      letterSpacing: pickMyBowl ? 0.7 : 1.4,
      lines: [variant.english],
      x: pickMyBowl ? 166 : 150,
      y: 126,
    },
    {
      color: COLOR.sage,
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: 1,
      lines: [variant.number],
      x: pickMyBowl ? 166 : 150,
      y: 148,
    },
    {
      color: COLOR.white,
      fontSize: 31,
      fontWeight: 900,
      lineHeight: 42,
      lines: ["吃饱了，也给你的 AI 充点", "算力。"],
      x: 46,
      y: 207,
    },
    {
      color: COLOR.gold,
      fontSize: 24,
      fontWeight: 900,
      lines: [AGENT_PASS_COPY.reward],
      x: 46,
      y: 304,
    },
    {
      color: COLOR.ink,
      fontSize: 17,
      fontWeight: 900,
      lines: [AGENT_PASS_COPY.duration],
      textAnchor: "middle",
      x: 117.5,
      y: 355,
    },
    {
      color: COLOR.white,
      fontSize: 17,
      fontWeight: 800,
      lines: [AGENT_PASS_COPY.useCases],
      x: 46,
      y: 405,
    },
    {
      color: COLOR.gold,
      fontSize: 20,
      fontWeight: 900,
      lines: [AGENT_PASS_COPY.hashtag],
      x: 46,
      y: 442,
    },
    {
      color: COLOR.red,
      fontSize: 12,
      fontWeight: 900,
      lines: ["COLLECT ALL FOUR · BUILD YOUR NEXT MOVE"],
      x: 46,
      y: 478,
    },
    {
      color: COLOR.ink,
      fontSize: 17.5,
      fontWeight: 700,
      lineHeight: 22,
      lines: [
        "This promotion is offered by YGF for the USC community and is not sponsored,",
        "endorsed by, or administered by the University of Southern California.",
      ],
      x: 46,
      y: 501,
    },
  ];
}

function sharedBackPdfTextCommands(): readonly PdfTextCommand[] {
  return [
    {
      color: COLOR.ink,
      fontSize: 22,
      fontWeight: 900,
      lines: ["Y"],
      textAnchor: "middle",
      x: 64,
      y: 46,
    },
    {
      color: COLOR.white,
      fontSize: 23,
      fontWeight: 900,
      letterSpacing: 2,
      lines: ["YGF AGENT PASS"],
      x: 96,
      y: 49,
    },
    {
      color: COLOR.ink,
      fontSize: 33,
      fontWeight: 900,
      lines: [AGENT_PASS_COPY.reward],
      x: 46,
      y: 118,
    },
    {
      color: COLOR.red,
      fontSize: 18,
      fontWeight: 900,
      lines: [
        `${AGENT_PASS_COPY.duration} · ${AGENT_PASS_COPY.hashtag}`,
      ],
      x: 46,
      y: 151,
    },
    {
      color: COLOR.sage,
      fontSize: 13,
      fontWeight: 900,
      letterSpacing: 1,
      lines: ["3 STEPS · 三步开始"],
      x: 46,
      y: 184,
    },
    {
      color: COLOR.ink,
      fontSize: 18,
      fontWeight: 900,
      lines: ["1 刮开 / OPEN"],
      x: 62,
      y: 235,
    },
    {
      color: COLOR.ink,
      fontSize: 18,
      fontWeight: 900,
      lines: ["2 扫码 / SCAN"],
      x: 314,
      y: 235,
    },
    {
      color: COLOR.ink,
      fontSize: 18,
      fontWeight: 900,
      lines: ["3 开始使用 / START USING"],
      x: 566,
      y: 235,
    },
    {
      color: COLOR.red,
      fontSize: 19,
      fontWeight: 900,
      letterSpacing: 1.2,
      lines: ["PROTECTED CHECKOUT OVERLAY AREA"],
      textAnchor: "middle",
      x: 428,
      y: 312,
    },
    {
      color: COLOR.ink,
      fontSize: 15,
      fontWeight: 700,
      lines: [
        "The public template is intentionally credential-free.",
      ],
      textAnchor: "middle",
      x: 428,
      y: 341,
    },
    {
      color: COLOR.sage,
      fontSize: 13,
      fontWeight: 600,
      lines: [
        "Fulfilled passes receive a matched human code and scan target here.",
      ],
      textAnchor: "middle",
      x: 428,
      y: 369,
    },
    {
      color: COLOR.red,
      fontSize: 20,
      fontWeight: 900,
      lines: ["刮开后请勿拍照分享"],
      x: 46,
      y: 425,
    },
    {
      color: COLOR.ink,
      fontSize: 13,
      fontWeight: 800,
      lines: [
        "A physical claim unlocks credits. It is never an API credential.",
      ],
      x: 46,
      y: 451,
    },
    {
      color: COLOR.sage,
      fontSize: 17.5,
      fontWeight: 700,
      lineHeight: 22,
      lines: [
        "This promotion is offered by YGF for the USC community and is not sponsored,",
        "endorsed by, or administered by the University of Southern California.",
      ],
      x: 46,
      y: 477,
    },
  ];
}

function svgDocument(options: Readonly<{
  body: string;
  description: string;
  metadata: string;
  photoHref?: string;
  title: string;
}>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="agent-pass-title agent-pass-description" width="${AGENT_PASS_SIZE.widthMm}mm" height="${AGENT_PASS_SIZE.heightMm}mm" viewBox="0 0 ${AGENT_PASS_SIZE.viewWidth} ${AGENT_PASS_SIZE.viewHeight}">`,
    `<title id="agent-pass-title">${escapeXml(options.title)}</title>`,
    `<desc id="agent-pass-description">${escapeXml(options.description)}</desc>`,
    `<metadata data-renderer="ygf-agent-pass-v1" data-card-width-mm="${AGENT_PASS_SIZE.widthMm}" data-card-height-mm="${AGENT_PASS_SIZE.heightMm}" data-photo-source="user-provided" data-rights-status="pending-brand-rights-confirmation" ${options.metadata}/>`,
    options.photoHref
      ? `<defs>${photoSymbol(options.photoHref)}</defs>`
      : "",
    options.body,
    "</svg>",
    "",
  ].join("\n");
}

export function renderAgentPassFrontSvg(
  variant: AgentPassVariant,
  photoHref = PUBLIC_PHOTO_HREF,
): string {
  if (
    !AGENT_PASS_VARIANTS.some(
      (candidate) => candidate.slug === variant.slug,
    )
  ) {
    throw new Error("AGENT_PASS_VARIANT_INVALID");
  }
  return svgDocument({
    body: frontBody(variant, variant.slug),
    description:
      "A photo-forward collectible YGF Agent Pass front with campaign copy and user-provided food photography.",
    metadata: `data-side="front" data-variant="${escapeXml(variant.slug)}" data-approved-headline="${escapeXml(AGENT_PASS_COPY.headline)}" data-approved-reward="${escapeXml(AGENT_PASS_COPY.reward)}" data-university-note="${escapeXml(AGENT_PASS_COPY.university)}"`,
    photoHref,
    title: `YGF Agent Pass ${variant.english} front`,
  });
}

export function renderAgentPassSharedBackSvg(): string {
  return svgDocument({
    body: sharedBackBody("shared-back"),
    description:
      "The shared credential-free YGF Agent Pass back template. A protected claim overlay is applied only in private fulfillment.",
    metadata: 'data-side="back" data-variant="shared"',
    title: "YGF Agent Pass shared back template",
  });
}

function cutMarks(
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const gap = 1.2;
  const length = 3.5;
  const segments = [
    [x - gap - length, y, x - gap, y],
    [x, y - gap - length, x, y - gap],
    [x + width + gap, y, x + width + gap + length, y],
    [x + width, y - gap - length, x + width, y - gap],
    [x - gap - length, y + height, x - gap, y + height],
    [x, y + height + gap, x, y + height + gap + length],
    [x + width + gap, y + height, x + width + gap + length, y + height],
    [x + width, y + height + gap, x + width, y + height + gap + length],
  ];
  return segments
    .map(
      ([x1, y1, x2, y2]) =>
        `<line x1="${formatNumber(x1)}" y1="${formatNumber(y1)}" x2="${formatNumber(x2)}" y2="${formatNumber(y2)}"/>`,
    )
    .join("");
}

function impositionCardPosition(
  paper: Paper,
  index: number,
): Readonly<{ x: number; y: number }> {
  const columns = 2;
  const rows = 4;
  const usedWidth =
    columns * AGENT_PASS_SIZE.widthMm +
    (columns - 1) * IMPOSITION_GUTTER_MM;
  const usedHeight =
    rows * AGENT_PASS_SIZE.heightMm +
    (rows - 1) * IMPOSITION_GUTTER_MM;
  const startX = (paper.widthMm - usedWidth) / 2;
  const startY = (paper.heightMm - usedHeight) / 2;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x:
      startX +
      column *
        (AGENT_PASS_SIZE.widthMm + IMPOSITION_GUTTER_MM),
    y:
      startY +
      row *
        (AGENT_PASS_SIZE.heightMm + IMPOSITION_GUTTER_MM),
  };
}

export function renderAgentPassImpositionSvg(
  paper: Paper,
  side: "backs" | "fronts",
  photoHref = PRINT_PHOTO_HREF,
): string {
  const columns = 2;
  const rows = 4;
  const cardScaleX =
    AGENT_PASS_SIZE.widthMm / AGENT_PASS_SIZE.viewWidth;
  const cardScaleY =
    AGENT_PASS_SIZE.heightMm / AGENT_PASS_SIZE.viewHeight;
  const cards: string[] = [];
  const marks: string[] = [];

  for (let index = 0; index < columns * rows; index += 1) {
    const { x, y } = impositionCardPosition(paper, index);
    const body =
      side === "fronts"
        ? frontBody(
            AGENT_PASS_VARIANTS[index % AGENT_PASS_VARIANTS.length],
            `${paper.name}-${side}-${index}`,
          )
        : sharedBackBody(`${paper.name}-${side}-${index}`);
    cards.push(
      `<g data-agent-pass-slot="${index + 1}" transform="translate(${formatNumber(x)} ${formatNumber(y)}) scale(${formatNumber(cardScaleX)} ${formatNumber(cardScaleY)})">${body}</g>`,
    );
    marks.push(
      cutMarks(
        x,
        y,
        AGENT_PASS_SIZE.widthMm,
        AGENT_PASS_SIZE.heightMm,
      ),
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="sheet-title sheet-description" width="${paper.widthMm}mm" height="${paper.heightMm}mm" viewBox="0 0 ${paper.widthMm} ${paper.heightMm}">`,
    `<title id="sheet-title">YGF Agent Pass ${side} ${paper.name.toUpperCase()} imposition</title>`,
    `<desc id="sheet-description">Eight 85.6 by 54 millimeter YGF Agent Pass ${side} arranged at 100 percent scale with a 10 millimeter gutter and cut marks.</desc>`,
    `<metadata data-renderer="ygf-agent-pass-v1" data-paper="${paper.name}" data-side="${side}" data-card-width-mm="${AGENT_PASS_SIZE.widthMm}" data-card-height-mm="${AGENT_PASS_SIZE.heightMm}" data-gutter-mm="${IMPOSITION_GUTTER_MM}" data-scale="100-percent" data-rights-status="pending-brand-rights-confirmation"/>`,
    side === "fronts"
      ? `<defs>${photoSymbol(photoHref)}</defs>`
      : "",
    `<rect width="${paper.widthMm}" height="${paper.heightMm}" fill="${COLOR.white}"/>`,
    cards.join("\n"),
    `<g data-cut-marks="true" fill="none" stroke="#000000" stroke-width="0.18">${marks.join("")}</g>`,
    "</svg>",
    "",
  ].join("\n");
}

function pngChunks(buffer: Buffer): Readonly<{
  chunks: readonly Readonly<{
    data: Buffer;
    end: number;
    start: number;
    type: string;
  }>[];
  details: PngDetails;
}> {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("AGENT_PASS_PHOTO_INVALID");
  }
  const chunks: Array<Readonly<{
    data: Buffer;
    end: number;
    start: number;
    type: string;
  }>> = [];
  const metadataChunks: string[] = [];
  let width = 0;
  let height = 0;
  let colorType = -1;
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error("AGENT_PASS_PHOTO_INVALID");
    }
    const data = buffer.subarray(dataStart, dataEnd);
    const chunkEnd = dataEnd + 4;
    chunks.push({
      data,
      end: chunkEnd,
      start: offset,
      type,
    });
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) {
        throw new Error("AGENT_PASS_PHOTO_INVALID");
      }
      colorType = data[9];
    }
    if (
      type[0] === type[0]?.toLowerCase()
    ) {
      metadataChunks.push(type);
    }
    offset = chunkEnd;
    if (type === "IEND") {
      break;
    }
  }

  if (
    !width ||
    !height ||
    ![2, 6].includes(colorType) ||
    chunks.at(-1)?.type !== "IEND" ||
    offset !== buffer.length
  ) {
    throw new Error("AGENT_PASS_PHOTO_INVALID");
  }
  return {
    chunks,
    details: {
      colorType,
      height,
      metadataChunks,
      width,
    },
  };
}

export function inspectAgentPassPhoto(buffer: Buffer): PngDetails {
  return pngChunks(buffer).details;
}

function paethPredictor(
  left: number,
  above: number,
  upperLeft: number,
): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (
    leftDistance <= aboveDistance &&
    leftDistance <= upperLeftDistance
  ) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePngToPdfScanlines(buffer: Buffer): Readonly<{
  compressedScanlines: Buffer;
  height: number;
  width: number;
}> {
  const parsed = pngChunks(buffer);
  const { colorType, height, width } = parsed.details;
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const sourceStride = width * bytesPerPixel;
  const compressed = Buffer.concat(
    parsed.chunks
      .filter(({ type }) => type === "IDAT")
      .map(({ data }) => data),
  );
  const raw = inflateSync(compressed);
  if (raw.length !== (sourceStride + 1) * height) {
    throw new Error("AGENT_PASS_RASTER_INVALID");
  }

  const pdfScanlines = Buffer.alloc((width * 3 + 1) * height);
  let previous = Buffer.alloc(sourceStride);
  let rawOffset = 0;
  let pdfOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const current = Buffer.alloc(sourceStride);
    for (let x = 0; x < sourceStride; x += 1) {
      const encoded = raw[rawOffset + x];
      const left = x >= bytesPerPixel
        ? current[x - bytesPerPixel]
        : 0;
      const above = previous[x] ?? 0;
      const upperLeft =
        x >= bytesPerPixel
          ? previous[x - bytesPerPixel] ?? 0
          : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = above;
      } else if (filter === 3) {
        predictor = Math.floor((left + above) / 2);
      } else if (filter === 4) {
        predictor = paethPredictor(left, above, upperLeft);
      } else if (filter !== 0) {
        throw new Error("AGENT_PASS_RASTER_INVALID");
      }
      current[x] = (encoded + predictor) & 0xff;
    }
    rawOffset += sourceStride;
    pdfScanlines[pdfOffset] = 0;
    pdfOffset += 1;

    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const alpha =
        bytesPerPixel === 4 ? current[source + 3] : 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = current[source + channel];
        pdfScanlines[pdfOffset] = Math.round(
          (value * alpha + 255 * (255 - alpha)) / 255,
        );
        pdfOffset += 1;
      }
    }
    previous = current;
  }

  return {
    compressedScanlines: deflateSync(pdfScanlines, {
      level: 9,
    }),
    height,
    width,
  };
}

function pdfStream(dictionary: string, data: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(
      `<< ${dictionary} /Length ${data.length} >>\nstream\n`,
      "ascii",
    ),
    data,
    Buffer.from("\nendstream", "ascii"),
  ]);
}

function escapePdf(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("·", "\\267");
}

function pdfColor(color: string, operator: "RG" | "rg"): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error("AGENT_PASS_PDF_COLOR_INVALID");
  }
  const channels = [1, 3, 5].map(
    (offset) =>
      Number.parseInt(color.slice(offset, offset + 2), 16) /
      255,
  );
  return `${channels.map(formatNumber).join(" ")} ${operator}`;
}

function usesCjkFont(value: string): boolean {
  return [...value].some(
    (character) =>
      character !== "·" && /[^\x00-\x7f]/.test(character),
  );
}

function splitPdfTextRuns(
  value: string,
): readonly Readonly<{ cjk: boolean; text: string }>[] {
  const runs: Array<{ cjk: boolean; text: string }> = [];
  for (const character of value) {
    const cjk = usesCjkFont(character);
    const previous = runs.at(-1);
    if (previous?.cjk === cjk) {
      previous.text += character;
    } else {
      runs.push({ cjk, text: character });
    }
  }
  return runs;
}

function encodeCjkText(value: string): string {
  let hex = "";
  for (let index = 0; index < value.length; index += 1) {
    hex += value
      .charCodeAt(index)
      .toString(16)
      .padStart(4, "0");
  }
  return `<${hex}>`;
}

function estimateTextWidth(
  value: string,
  fontSize: number,
  letterSpacing: number,
): number {
  let ems = 0;
  for (const character of value) {
    if (/[^\x00-\x7f]/.test(character)) {
      ems += 1;
    } else if (character === " ") {
      ems += 0.28;
    } else if (/[A-Z0-9]/.test(character)) {
      ems += 0.62;
    } else if (/[a-z]/.test(character)) {
      ems += 0.5;
    } else {
      ems += 0.3;
    }
  }
  return (
    ems * fontSize +
    Math.max(0, [...value].length - 1) * letterSpacing
  );
}

function renderPdfTextCommands(
  commands: readonly PdfTextCommand[],
  pageWidthPt: number,
  pageHeightPt: number,
  sceneWidth: number,
  sceneHeight: number,
): string {
  const scaleX = pageWidthPt / sceneWidth;
  const scaleY = pageHeightPt / sceneHeight;
  const rendered: string[] = [];
  for (const command of commands) {
    command.lines.forEach((line, index) => {
      const letterSpacing = command.letterSpacing ?? 0;
      const baseline =
        command.y + index * (command.lineHeight ?? 0);
      const anchorOffset =
        command.textAnchor === "middle"
          ? estimateTextWidth(
              line,
              command.fontSize,
              letterSpacing,
            ) / 2
          : 0;
      const fontSizePt = command.fontSize * scaleY;
      const runs = splitPdfTextRuns(line);
      let cursor = command.x - anchorOffset;
      runs.forEach((run, runIndex) => {
        const font =
          run.cjk
            ? "F3"
            : command.fontWeight >= 700
              ? "F2"
              : "F1";
        const fakeCjkBold =
          run.cjk && command.fontWeight >= 700;
        rendered.push(
          [
            "BT",
            pdfColor(command.color, "rg"),
            fakeCjkBold
              ? pdfColor(command.color, "RG")
              : "",
            fakeCjkBold
              ? `${formatNumber(
                  Math.max(0.12, fontSizePt * 0.018),
                )} w`
              : "",
            fakeCjkBold ? "2 Tr" : "0 Tr",
            `/${font} ${formatNumber(fontSizePt)} Tf`,
            `${formatNumber(letterSpacing * scaleX)} Tc`,
            `1 0 0 1 ${formatNumber(
              cursor * scaleX,
            )} ${formatNumber(
              pageHeightPt - baseline * scaleY,
            )} Tm`,
            `${
              run.cjk
                ? encodeCjkText(run.text)
                : `(${escapePdf(run.text)})`
            } Tj`,
            "0 Tr",
            "ET",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        cursor += estimateTextWidth(
          run.text,
          command.fontSize,
          letterSpacing,
        );
        if (runIndex < runs.length - 1) {
          cursor += letterSpacing;
        }
      });
    });
  }
  return rendered.join("\n");
}

function buildLayeredPdf(
  png: Buffer,
  pageWidthPt: number,
  pageHeightPt: number,
  title: string,
  textCommands: readonly PdfTextCommand[],
  sceneWidth: number,
  sceneHeight: number,
  sourceDigest: string,
): Buffer {
  const image = decodePngToPdfScanlines(png);
  const content = Buffer.from(
    [
      "q",
      `${formatNumber(pageWidthPt)} 0 0 ${formatNumber(pageHeightPt)} 0 0 cm`,
      "/Im0 Do",
      "Q",
      renderPdfTextCommands(
        textCommands,
        pageWidthPt,
        pageHeightPt,
        sceneWidth,
        sceneHeight,
      ),
      "",
    ].join("\n"),
    "ascii",
  );
  const integrityPlaceholder =
    `${PDF_INTEGRITY_PREFIX}${"0".repeat(64)}`;
  const safeTitle = title.replaceAll(/[()\\]/g, "");
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "ascii"),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(pageWidthPt)} ${formatNumber(pageHeightPt)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> /XObject << /Im0 8 0 R >> >> /Contents 9 0 R >>`,
      "ascii",
    ),
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "ascii",
    ),
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
      "ascii",
    ),
    Buffer.from(
      "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [7 0 R] >>",
      "ascii",
    ),
    Buffer.from(
      "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /DW 1000 >>",
      "ascii",
    ),
    pdfStream(
      `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${image.width} >>`,
      image.compressedScanlines,
    ),
    pdfStream("", content),
    Buffer.from(
      `<< /Title (${safeTitle}) /Subject (${PDF_SOURCE_PREFIX}${sourceDigest}) /Creator (YGF Agent Pass renderer) /Producer (YGF Agent Pass renderer) /Keywords (${integrityPlaceholder}) >>`,
      "ascii",
    ),
  ];
  const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary");
  const chunks: Buffer[] = [header];
  const offsets = [0];
  let cursor = header.length;

  objects.forEach((body, index) => {
    offsets.push(cursor);
    const object = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, "ascii"),
      body,
      Buffer.from("\nendobj\n", "ascii"),
    ]);
    chunks.push(object);
    cursor += object.length;
  });
  const xrefOffset = cursor;
  chunks.push(
    Buffer.from(
      [
        `xref\n0 ${objects.length + 1}`,
        "0000000000 65535 f ",
        ...offsets
          .slice(1)
          .map(
            (offset) =>
              `${offset.toString().padStart(10, "0")} 00000 n `,
          ),
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 10 0 R >>`,
        `startxref\n${xrefOffset}`,
        "%%EOF",
        "",
      ].join("\n"),
      "ascii",
    ),
  );
  const pdf = Buffer.concat(chunks);
  const placeholderOffset = pdf.indexOf(
    Buffer.from(integrityPlaceholder, "ascii"),
  );
  if (placeholderOffset < 0) {
    throw new Error("AGENT_PASS_PDF_INTEGRITY_INVALID");
  }
  const digest = createHash("sha256").update(pdf).digest("hex");
  Buffer.from(
    `${PDF_INTEGRITY_PREFIX}${digest}`,
    "ascii",
  ).copy(pdf, placeholderOffset);
  return pdf;
}

function verifyPdfIntegrity(
  pdf: Buffer,
  expectedTitle: string,
  expectedSourceDigest: string,
): void {
  const searchable = pdf.toString("latin1");
  const match = searchable.match(
    new RegExp(
      `/Keywords \\(${PDF_INTEGRITY_PREFIX}([0-9a-f]{64})\\)`,
    ),
  );
  const safeTitle = expectedTitle.replaceAll(/[()\\]/g, "");
  if (
    !match ||
    !searchable.includes(`/Title (${safeTitle})`) ||
    !searchable.includes(
      `/Subject (${PDF_SOURCE_PREFIX}${expectedSourceDigest})`,
    )
  ) {
    throw new Error("AGENT_PASS_PDF_SOURCE_INVALID");
  }
  const digest = match[1];
  const marker = `${PDF_INTEGRITY_PREFIX}${digest}`;
  const markerOffset = pdf.indexOf(Buffer.from(marker, "ascii"));
  if (markerOffset < 0) {
    throw new Error("AGENT_PASS_PDF_INTEGRITY_INVALID");
  }
  const normalized = Buffer.from(pdf);
  Buffer.from(
    `${PDF_INTEGRITY_PREFIX}${"0".repeat(64)}`,
    "ascii",
  ).copy(normalized, markerOffset);
  const actual = createHash("sha256")
    .update(normalized)
    .digest("hex");
  if (actual !== digest) {
    throw new Error("AGENT_PASS_PDF_INTEGRITY_INVALID");
  }
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc >>> 1) ^
        (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
  );
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function attachPngIntegrity(
  png: Buffer,
  identity: string,
  sourceDigest: string,
): Buffer {
  const parsed = pngChunks(png);
  const iend = parsed.chunks.at(-1);
  if (!iend || iend.type !== "IEND") {
    throw new Error("AGENT_PASS_PREVIEW_INTEGRITY_INVALID");
  }
  const digest = createHash("sha256").update(png).digest("hex");
  const data = Buffer.from(
    `${PNG_INTEGRITY_KEYWORD}\0${identity}|${sourceDigest}|${digest}`,
    "latin1",
  );
  return Buffer.concat([
    png.subarray(0, iend.start),
    pngChunk("tEXt", data),
    png.subarray(iend.start),
  ]);
}

function verifyPngIntegrity(
  png: Buffer,
  expectedIdentity: string,
  expectedSourceDigest: string,
): void {
  const parsed = pngChunks(png);
  const prefix = `${PNG_INTEGRITY_KEYWORD}\0`;
  const matches = parsed.chunks.filter(
    ({ data, type }) =>
      type === "tEXt" &&
      data.toString("latin1").startsWith(prefix),
  );
  if (matches.length !== 1) {
    throw new Error("AGENT_PASS_PREVIEW_INTEGRITY_INVALID");
  }
  const integrity = matches[0];
  const value = integrity.data
    .toString("latin1")
    .slice(prefix.length);
  const fields = value.split("|");
  const [identity, sourceDigest, digest] = fields;
  if (
    fields.length !== 3 ||
    identity !== expectedIdentity ||
    sourceDigest !== expectedSourceDigest ||
    !/^[0-9a-f]{64}$/.test(digest)
  ) {
    throw new Error("AGENT_PASS_PREVIEW_SOURCE_INVALID");
  }
  const original = Buffer.concat([
    png.subarray(0, integrity.start),
    png.subarray(integrity.end),
  ]);
  const actual = createHash("sha256")
    .update(original)
    .digest("hex");
  if (actual !== digest) {
    throw new Error("AGENT_PASS_PREVIEW_INTEGRITY_INVALID");
  }
}

function millimetersToPixels(
  millimeters: number,
  dpi: number,
): number {
  return Math.round((millimeters / 25.4) * dpi);
}

function millimetersToPoints(millimeters: number): number {
  return (millimeters / 25.4) * 72;
}

function inlinePhoto(svg: string, photo: Buffer): string {
  const dataUrl = `data:image/png;base64,${photo.toString("base64")}`;
  const inlined = svg.replace(
    /(<image id="agent-pass-photo-source" href=")[^"]+(")/,
    `$1${dataUrl}$2`,
  );
  if (
    svg.includes('id="agent-pass-photo-source"') &&
    inlined === svg
  ) {
    throw new Error("AGENT_PASS_PHOTO_REFERENCE_INVALID");
  }
  return inlined;
}

async function rasterizeSvg(
  svg: string,
  widthPixels: number,
  heightPixels: number,
  photo: Buffer,
): Promise<Buffer> {
  const inlinedSvg = inlinePhoto(svg, photo);
  const source = `data:image/svg+xml;base64,${Buffer.from(
    inlinedSvg,
    "utf8",
  ).toString("base64")}`;
  const response = new ImageResponse(
    createElement("img", {
      alt: "",
      height: heightPixels,
      src: source,
      style: {
        display: "block",
        height: `${heightPixels}px`,
        width: `${widthPixels}px`,
      },
      width: widthPixels,
    }),
    {
      height: heightPixels,
      width: widthPixels,
    },
  );
  return Buffer.from(await response.arrayBuffer());
}

function expectedPublicSvgs(): ReadonlyMap<string, string> {
  const entries: Array<readonly [string, string]> =
    AGENT_PASS_VARIANTS.map((variant) => [
      `${variant.slug}-front.svg`,
      renderAgentPassFrontSvg(variant),
    ]);
  entries.push([
    "shared-back.svg",
    renderAgentPassSharedBackSvg(),
  ]);
  return new Map(entries);
}

function expectedPrintSvgs(): ReadonlyMap<string, string> {
  const entries: Array<readonly [string, string]> =
    AGENT_PASS_VARIANTS.map((variant) => [
      `${variant.slug}-front.svg`,
      renderAgentPassFrontSvg(variant, PRINT_PHOTO_HREF),
    ]);
  entries.push([
    "shared-back.svg",
    renderAgentPassSharedBackSvg(),
  ]);
  for (const paper of PAPERS) {
    for (const side of ["fronts", "backs"] as const) {
      entries.push([
        `${side}-${paper.name}.svg`,
        renderAgentPassImpositionSvg(
          paper,
          side,
          PRINT_PHOTO_HREF,
        ),
      ]);
    }
  }
  return new Map(entries);
}

function stripSvgText(svg: string): string {
  return svg.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, "");
}

function transformPdfTextCommands(
  commands: readonly PdfTextCommand[],
  x: number,
  y: number,
  scale: number,
): readonly PdfTextCommand[] {
  return commands.map((command) => ({
    ...command,
    fontSize: command.fontSize * scale,
    letterSpacing:
      command.letterSpacing === undefined
        ? undefined
        : command.letterSpacing * scale,
    lineHeight:
      command.lineHeight === undefined
        ? undefined
        : command.lineHeight * scale,
    x: x + command.x * scale,
    y: y + command.y * scale,
  }));
}

function pdfTextForPrintFile(
  file: string,
  paper: Paper | undefined,
): Readonly<{
  commands: readonly PdfTextCommand[];
  sceneHeight: number;
  sceneWidth: number;
}> {
  const variant = AGENT_PASS_VARIANTS.find(
    ({ slug }) => file === `${slug}-front.svg`,
  );
  if (variant) {
    return {
      commands: frontPdfTextCommands(variant),
      sceneHeight: AGENT_PASS_SIZE.viewHeight,
      sceneWidth: AGENT_PASS_SIZE.viewWidth,
    };
  }
  if (file === "shared-back.svg") {
    return {
      commands: sharedBackPdfTextCommands(),
      sceneHeight: AGENT_PASS_SIZE.viewHeight,
      sceneWidth: AGENT_PASS_SIZE.viewWidth,
    };
  }
  if (!paper) {
    throw new Error("AGENT_PASS_PDF_SCENE_INVALID");
  }
  const fronts = file.startsWith("fronts-");
  const backs = file.startsWith("backs-");
  if (!fronts && !backs) {
    throw new Error("AGENT_PASS_PDF_SCENE_INVALID");
  }
  const commands: PdfTextCommand[] = [];
  for (let index = 0; index < 8; index += 1) {
    const { x, y } = impositionCardPosition(paper, index);
    const cardCommands = fronts
      ? frontPdfTextCommands(
          AGENT_PASS_VARIANTS[
            index % AGENT_PASS_VARIANTS.length
          ],
        )
      : sharedBackPdfTextCommands();
    commands.push(
      ...transformPdfTextCommands(cardCommands, x, y, 0.1),
    );
  }
  return {
    commands,
    sceneHeight: paper.heightMm,
    sceneWidth: paper.widthMm,
  };
}

function artifactSourceDigest(
  svg: string,
  photo: Buffer,
  widthPixels: number,
  heightPixels: number,
  kind: "pdf" | "preview",
): string {
  return createHash("sha256")
    .update(ARTIFACT_RENDER_VERSION)
    .update("\0")
    .update(kind)
    .update("\0")
    .update(`${widthPixels}x${heightPixels}`)
    .update("\0")
    .update(svg)
    .update("\0")
    .update(photo)
    .digest("hex");
}

function assertSafePhoto(details: PngDetails): void {
  if (
    details.width !== 1600 ||
    details.height !== 1200 ||
    details.colorType !== 2 ||
    details.metadataChunks.length > 0
  ) {
    throw new Error(
      "Agent Pass photo must be the reviewed 1600x1200 metadata-stripped RGB PNG.",
    );
  }
}

export async function renderAgentPassAssets(
  options: Readonly<{
    root?: string;
  }> = {},
): Promise<Readonly<{
  pdfCount: number;
  previewCount: number;
  printSvgCount: number;
  publicSvgCount: number;
}>> {
  const root = path.resolve(options.root ?? repositoryRoot);
  const publicDirectory = path.join(
    root,
    "public/campaign/agent-pass",
  );
  const printDirectory = path.join(root, "output/agent-pass");
  const previewDirectory = path.join(
    printDirectory,
    "previews",
  );
  const photo = await readFile(
    path.join(root, "public/media", PHOTO_FILE),
  );
  assertSafePhoto(inspectAgentPassPhoto(photo));
  await Promise.all([
    mkdir(publicDirectory, { recursive: true }),
    mkdir(printDirectory, { recursive: true }),
    mkdir(previewDirectory, { recursive: true }),
  ]);

  const publicSvgs = expectedPublicSvgs();
  const printSvgs = expectedPrintSvgs();
  await Promise.all([
    ...[...publicSvgs].map(([file, svg]) =>
      writeFile(path.join(publicDirectory, file), svg, "utf8"),
    ),
    ...[...printSvgs].map(([file, svg]) =>
      writeFile(path.join(printDirectory, file), svg, "utf8"),
    ),
  ]);

  let pdfCount = 0;
  let previewCount = 0;
  for (const [file, svg] of printSvgs) {
    const isSheet =
      file.startsWith("fronts-") ||
      file.startsWith("backs-");
    const paper = PAPERS.find(({ name }) =>
      file.endsWith(`-${name}.svg`),
    );
    const widthMm = paper?.widthMm ?? AGENT_PASS_SIZE.widthMm;
    const heightMm =
      paper?.heightMm ?? AGENT_PASS_SIZE.heightMm;
    const printWidthPixels = millimetersToPixels(
      widthMm,
      PRINT_DPI,
    );
    const printHeightPixels = millimetersToPixels(
      heightMm,
      PRINT_DPI,
    );
    const png = await rasterizeSvg(
      stripSvgText(svg),
      printWidthPixels,
      printHeightPixels,
      photo,
    );
    const pdfText = pdfTextForPrintFile(file, paper);
    const pdfSourceDigest = artifactSourceDigest(
      svg,
      photo,
      printWidthPixels,
      printHeightPixels,
      "pdf",
    );
    const pdfFile = file.replace(/\.svg$/, ".pdf");
    await writeFile(
      path.join(printDirectory, pdfFile),
      buildLayeredPdf(
        png,
        millimetersToPoints(widthMm),
        millimetersToPoints(heightMm),
        `YGF Agent Pass ${file.replace(/\.svg$/, "")}`,
        pdfText.commands,
        pdfText.sceneWidth,
        pdfText.sceneHeight,
        pdfSourceDigest,
      ),
    );
    pdfCount += 1;

    if (isSheet) {
      const previewWidthPixels = millimetersToPixels(
        widthMm,
        PREVIEW_DPI,
      );
      const previewHeightPixels = millimetersToPixels(
        heightMm,
        PREVIEW_DPI,
      );
      const preview = await rasterizeSvg(
        svg,
        previewWidthPixels,
        previewHeightPixels,
        photo,
      );
      const previewSourceDigest = artifactSourceDigest(
        svg,
        photo,
        previewWidthPixels,
        previewHeightPixels,
        "preview",
      );
      await writeFile(
        path.join(
          previewDirectory,
          file.replace(/\.svg$/, "-preview.png"),
        ),
        attachPngIntegrity(
          preview,
          `${file.replace(/\.svg$/, "")}-preview`,
          previewSourceDigest,
        ),
      );
      previewCount += 1;
    }
  }

  return {
    pdfCount,
    previewCount,
    printSvgCount: printSvgs.size,
    publicSvgCount: publicSvgs.size,
  };
}

export async function verifyAgentPassAssets(
  options: Readonly<{
    root?: string;
  }> = {},
): Promise<Readonly<{
  pdfCount: number;
  previewCount: number;
  printSvgCount: number;
  publicSvgCount: number;
}>> {
  const root = path.resolve(options.root ?? repositoryRoot);
  const publicDirectory = path.join(
    root,
    "public/campaign/agent-pass",
  );
  const printDirectory = path.join(root, "output/agent-pass");
  const photo = await readFile(
    path.join(root, "public/media", PHOTO_FILE),
  );
  assertSafePhoto(inspectAgentPassPhoto(photo));
  const publicSvgs = expectedPublicSvgs();
  const printSvgs = expectedPrintSvgs();

  for (const [file, expected] of publicSvgs) {
    const actual = await readFile(
      path.join(publicDirectory, file),
      "utf8",
    );
    if (actual !== expected) {
      throw new Error(
        `Agent Pass public SVG ${file} does not match its deterministic render.`,
      );
    }
  }
  for (const [file, expected] of printSvgs) {
    const actual = await readFile(
      path.join(printDirectory, file),
      "utf8",
    );
    if (actual !== expected) {
      throw new Error(
        `Agent Pass print SVG ${file} does not match its deterministic render.`,
      );
    }
    const paper = PAPERS.find(({ name }) =>
      file.endsWith(`-${name}.svg`),
    );
    const widthMm = paper?.widthMm ?? AGENT_PASS_SIZE.widthMm;
    const heightMm =
      paper?.heightMm ?? AGENT_PASS_SIZE.heightMm;
    const printWidthPixels = millimetersToPixels(
      widthMm,
      PRINT_DPI,
    );
    const printHeightPixels = millimetersToPixels(
      heightMm,
      PRINT_DPI,
    );
    const pdf = await readFile(
      path.join(
        printDirectory,
        file.replace(/\.svg$/, ".pdf"),
      ),
    );
    const mediaBox =
      `/MediaBox [0 0 ${formatNumber(
        millimetersToPoints(widthMm),
      )} ${formatNumber(millimetersToPoints(heightMm))}]`;
    if (
      !pdf.subarray(0, 8).toString("latin1").startsWith("%PDF-1.4") ||
      !pdf.toString("latin1").includes(mediaBox)
    ) {
      throw new Error(
        `Agent Pass PDF ${file.replace(/\.svg$/, ".pdf")} has invalid page dimensions.`,
      );
    }
    verifyPdfIntegrity(
      pdf,
      `YGF Agent Pass ${file.replace(/\.svg$/, "")}`,
      artifactSourceDigest(
        expected,
        photo,
        printWidthPixels,
        printHeightPixels,
        "pdf",
      ),
    );
  }
  for (const paper of PAPERS) {
    for (const side of ["fronts", "backs"] as const) {
      const preview = await readFile(
        path.join(
          printDirectory,
          "previews",
          `${side}-${paper.name}-preview.png`,
        ),
      );
      const details = inspectAgentPassPhoto(preview);
      if (
        details.width !==
          millimetersToPixels(paper.widthMm, PREVIEW_DPI) ||
        details.height !==
          millimetersToPixels(paper.heightMm, PREVIEW_DPI)
      ) {
        throw new Error(
          `Agent Pass preview ${side}-${paper.name} has invalid dimensions.`,
        );
      }
      verifyPngIntegrity(
        preview,
        `${side}-${paper.name}-preview`,
        artifactSourceDigest(
          printSvgs.get(`${side}-${paper.name}.svg`) ??
            "",
          photo,
          millimetersToPixels(
            paper.widthMm,
            PREVIEW_DPI,
          ),
          millimetersToPixels(
            paper.heightMm,
            PREVIEW_DPI,
          ),
          "preview",
        ),
      );
    }
  }
  return {
    pdfCount: printSvgs.size,
    previewCount: PAPERS.length * 2,
    printSvgCount: printSvgs.size,
    publicSvgCount: publicSvgs.size,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const arguments_ = process.argv.slice(2);
  if (
    arguments_.some((value) => value !== "--verify-only") ||
    arguments_.filter((value) => value === "--verify-only").length > 1
  ) {
    throw new Error(
      "Usage: render-agent-pass-assets.mts [--verify-only]",
    );
  }
  const verifyOnly = arguments_.includes("--verify-only");
  const operation = verifyOnly
    ? verifyAgentPassAssets
    : renderAgentPassAssets;
  operation()
    .then((result) => {
      process.stdout.write(
        `${verifyOnly ? "Verified" : "Rendered"} ${result.publicSvgCount} public Agent Pass SVGs, ${result.printSvgCount} print SVGs, ${result.pdfCount} PDFs, and ${result.previewCount} previews.\n`,
      );
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "AGENT_PASS_RENDER_FAILED";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
