import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import QRCode from "qrcode";

type Color = `#${string}`;

type CampaignVariant = Readonly<{
  file: string;
  height: number;
  outputHeight: string;
  outputWidth: string;
  source: string;
  width: number;
}>;

type RectCommand = Readonly<{
  fill: Color;
  height: number;
  kind: "rect";
  radius?: number;
  width: number;
  x: number;
  y: number;
}>;

type ImageCommand = Readonly<{
  height: number;
  href: string;
  kind: "image";
  radius: number;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
}>;

type TextCommand = Readonly<{
  color: Color;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700 | 800;
  kind: "text";
  letterSpacing?: number;
  lineHeight: number;
  lines: readonly string[];
  x: number;
  y: number;
}>;

type QrCommand = Readonly<{
  kind: "qr";
  size: number;
  url: string;
  x: number;
  y: number;
}>;

type UseCaseIcon = "book" | "bowl" | "briefcase" | "code";

type UseCaseCommand = Readonly<{
  height: number;
  icon: UseCaseIcon;
  kind: "use-case";
  label: string;
  width: number;
  x: number;
  y: number;
}>;

type SceneCommand =
  | ImageCommand
  | QrCommand
  | RectCommand
  | TextCommand
  | UseCaseCommand;

type CampaignScene = Readonly<{
  commands: readonly SceneCommand[];
  height: number;
  qrUrl: string;
  title: string;
  variant: CampaignVariant;
  width: number;
}>;

type QrGeometry = Readonly<{
  moduleCount: number;
  modules: readonly Readonly<{ x: number; y: number }>[];
  quietZone: number;
  totalModules: number;
}>;

type ParsedPng = Readonly<{
  compressedScanlines: Buffer;
  height: number;
  width: number;
}>;

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const PUBLIC_ORIGIN = "https://build.ygf.example";
const HERO_IMAGE_HREF = "../media/malatang-hero.png";
const HERO_IMAGE_WIDTH = 1536;
const HERO_IMAGE_HEIGHT = 1024;
const QR_QUIET_ZONE = 4;

export const CAMPAIGN_TOKENS = Object.freeze({
  color: Object.freeze({
    accent: "#D84A32" as Color,
    cream: "#F6F0E4" as Color,
    gold: "#E8B94A" as Color,
    ink: "#16261F" as Color,
    sage: "#667868" as Color,
    white: "#FFFFFF" as Color,
  }),
  copy: Object.freeze({
    checkout: "Get your code at checkout.",
    finePrint:
      "Limited-time YGF promotional Build Credits. Qualifying purchase required. One redemption per person/account. Non-transferable. No cash value. Expires 14 days after redemption. Eligible AI tasks only. Terms and privacy apply.",
    headline: "Buy a bowl. Build with AI.",
    scan: "Scan to claim",
    shortUniversity:
      "For the USC community. Not affiliated with or endorsed by USC.",
    subhead:
      "Spend $25+ at YGF and unlock limited Build Credits for study help, coding help, career tasks, and smarter bowl picks.",
    university:
      "This promotion is offered by YGF for the USC community and is not sponsored, endorsed by, or administered by the University of Southern California.",
  }),
  fontFamily: "Inter, Avenir Next, Helvetica, Arial, sans-serif",
  useCases: Object.freeze([
    Object.freeze({ icon: "book" as const, label: "Study" }),
    Object.freeze({ icon: "code" as const, label: "Coding" }),
    Object.freeze({ icon: "briefcase" as const, label: "Career" }),
    Object.freeze({ icon: "bowl" as const, label: "Pick My Bowl" }),
  ]),
});

export const CAMPAIGN_VARIANTS: readonly CampaignVariant[] = Object.freeze([
  Object.freeze({
    file: "poster-24x36.svg",
    height: 1800,
    outputHeight: "36in",
    outputWidth: "24in",
    source: "poster-24x36",
    width: 1200,
  }),
  Object.freeze({
    file: "poster-11x17.svg",
    height: 1700,
    outputHeight: "17in",
    outputWidth: "11in",
    source: "poster-11x17",
    width: 1100,
  }),
  Object.freeze({
    file: "counter-card-5x7.svg",
    height: 1400,
    outputHeight: "7in",
    outputWidth: "5in",
    source: "counter-card-5x7",
    width: 1000,
  }),
  Object.freeze({
    file: "social-feed-1080x1350.svg",
    height: 1350,
    outputHeight: "1350",
    outputWidth: "1080",
    source: "social-feed-1080x1350",
    width: 1080,
  }),
  Object.freeze({
    file: "social-story-1080x1920.svg",
    height: 1920,
    outputHeight: "1920",
    outputWidth: "1080",
    source: "social-story-1080x1920",
    width: 1080,
  }),
  Object.freeze({
    file: "social-horizontal-1200x628.svg",
    height: 628,
    outputHeight: "628",
    outputWidth: "1200",
    source: "social-horizontal-1200x628",
    width: 1200,
  }),
]);

const CAMPAIGN_PRINT_ASSETS = Object.freeze([
  Object.freeze({
    file: "ygf-poster-24x36.pdf",
    pageHeight: 36 * 72,
    pageWidth: 24 * 72,
    sceneFile: "poster-24x36.svg",
  }),
  Object.freeze({
    file: "ygf-counter-card-5x7.pdf",
    pageHeight: 7 * 72,
    pageWidth: 5 * 72,
    sceneFile: "counter-card-5x7.svg",
  }),
]);

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapePdf(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function formatNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

function wrapText(value: string, maximumCharacters: number) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maximumCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function offerUrl(origin: string, source: string) {
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    base.username !== "" ||
    base.password !== ""
  ) {
    throw new Error("Campaign QR origin must use HTTPS.");
  }
  base.pathname = "/offer";
  base.search = "";
  base.hash = "";
  base.searchParams.set("utm_source", source);
  return base.toString();
}

function text(
  lines: readonly string[],
  options: Omit<TextCommand, "kind" | "lines">,
): TextCommand {
  return { ...options, kind: "text", lines };
}

function addUseCases(
  commands: SceneCommand[],
  options: Readonly<{
    columns: 2 | 4;
    gap: number;
    height: number;
    width: number;
    x: number;
    y: number;
  }>,
) {
  const rows = CAMPAIGN_TOKENS.useCases.length / options.columns;
  const cardWidth =
    (options.width - options.gap * (options.columns - 1)) / options.columns;
  const cardHeight =
    (options.height - options.gap * (rows - 1)) / rows;

  CAMPAIGN_TOKENS.useCases.forEach(({ icon, label }, index) => {
    const column = index % options.columns;
    const row = Math.floor(index / options.columns);
    commands.push({
      height: cardHeight,
      icon,
      kind: "use-case",
      label,
      width: cardWidth,
      x: options.x + column * (cardWidth + options.gap),
      y: options.y + row * (cardHeight + options.gap),
    });
  });
}

function buildPortraitScene(
  variant: CampaignVariant,
  origin: string,
): CampaignScene {
  const { height, width } = variant;
  const colors = CAMPAIGN_TOKENS.color;
  const copy = CAMPAIGN_TOKENS.copy;
  const margin = Math.min(width * 0.065, height * 0.047);
  const headlineSize = Math.min(width * 0.069, height * 0.05);
  const subheadSize = Math.min(width * 0.026, height * 0.019);
  const labelSize = Math.min(width * 0.026, height * 0.017);
  const footerTop = height * 0.7;
  const qrSize = Math.min(width * 0.24, height * 0.18);
  const qrUrl = offerUrl(origin, variant.source);
  const commands: SceneCommand[] = [
    {
      fill: colors.cream,
      height,
      kind: "rect",
      width,
      x: 0,
      y: 0,
    },
    {
      fill: colors.gold,
      height: height * 0.2,
      kind: "rect",
      radius: Math.min(width, height) * 0.1,
      width: width * 0.2,
      x: width * 0.87,
      y: -height * 0.05,
    },
    {
      color: colors.accent,
      fontSize: labelSize,
      fontWeight: 800,
      kind: "text",
      letterSpacing: labelSize * 0.15,
      lineHeight: labelSize * 1.2,
      lines: ["YGF BOWL-TO-BUILD"],
      x: margin,
      y: height * 0.064,
    },
    {
      fill: colors.accent,
      height: labelSize * 2,
      kind: "rect",
      radius: labelSize,
      width: width * 0.26,
      x: margin,
      y: height * 0.078,
    },
    text(["LIMITED-TIME OFFER"], {
      color: colors.white,
      fontSize: labelSize * 0.69,
      fontWeight: 800,
      letterSpacing: labelSize * 0.08,
      lineHeight: labelSize,
      x: margin + labelSize * 0.85,
      y: height * 0.078 + labelSize * 1.34,
    }),
    text(["Buy a bowl.", "Build with AI."], {
      color: colors.ink,
      fontSize: headlineSize,
      fontWeight: 800,
      lineHeight: headlineSize * 1.02,
      x: margin,
      y: height * 0.166,
    }),
    {
      height: height * 0.35,
      href: HERO_IMAGE_HREF,
      kind: "image",
      radius: Math.min(width, height) * 0.032,
      sourceHeight: HERO_IMAGE_HEIGHT,
      sourceWidth: HERO_IMAGE_WIDTH,
      width: width * 0.395,
      x: width * 0.55,
      y: height * 0.105,
    },
    text(
      wrapText(
        copy.subhead,
        Math.max(25, Math.floor((width * 0.415) / (subheadSize * 0.54))),
      ),
      {
        color: colors.sage,
        fontSize: subheadSize,
        fontWeight: 500,
        lineHeight: subheadSize * 1.35,
        x: margin,
        y: height * 0.32,
      },
    ),
    text(["FOUR WAYS TO BUILD"], {
      color: colors.ink,
      fontSize: labelSize * 0.87,
      fontWeight: 800,
      letterSpacing: labelSize * 0.09,
      lineHeight: labelSize,
      x: margin,
      y: height * 0.478,
    }),
    {
      fill: colors.accent,
      height: height - footerTop,
      kind: "rect",
      width,
      x: 0,
      y: footerTop,
    },
    {
      kind: "qr",
      size: qrSize,
      url: qrUrl,
      x: margin,
      y: height * 0.724,
    },
    text([copy.scan], {
      color: colors.white,
      fontSize: Math.min(width * 0.052, height * 0.038),
      fontWeight: 800,
      lineHeight: Math.min(width * 0.057, height * 0.043),
      x: margin + qrSize + width * 0.045,
      y: height * 0.763,
    }),
    text([copy.checkout], {
      color: colors.white,
      fontSize: Math.min(width * 0.024, height * 0.018),
      fontWeight: 600,
      lineHeight: Math.min(width * 0.03, height * 0.023),
      x: margin + qrSize + width * 0.045,
      y: height * 0.805,
    }),
    text([copy.shortUniversity], {
      color: colors.cream,
      fontSize: Math.min(width * 0.014, height * 0.011),
      fontWeight: 700,
      letterSpacing: Math.min(width * 0.001, height * 0.001),
      lineHeight: Math.min(width * 0.018, height * 0.014),
      x: margin + qrSize + width * 0.045,
      y: height * 0.837,
    }),
  ];

  addUseCases(commands, {
    columns: width <= 1000 ? 2 : 4,
    gap: width * 0.018,
    height: height * 0.168,
    width: width - margin * 2,
    x: margin,
    y: height * 0.495,
  });

  const finePrintSize =
    width <= 1000
      ? 16.5
      : Math.max(9, Math.min(width * 0.013, height * 0.009));
  const finePrintCharacters = Math.max(
    58,
    Math.floor((width - margin * 2) / (finePrintSize * 0.53)),
  );
  const finePrintLines = wrapText(copy.finePrint, finePrintCharacters);
  const universityLines = wrapText(copy.university, finePrintCharacters);
  const finePrintY = height * (width <= 1000 ? 0.912 : 0.902);
  const finePrintLineHeight = finePrintSize * 1.28;

  commands.push(
    text(finePrintLines, {
      color: colors.white,
      fontSize: finePrintSize,
      fontWeight: 500,
      lineHeight: finePrintLineHeight,
      x: margin,
      y: finePrintY,
    }),
    text(universityLines, {
      color: colors.white,
      fontSize: finePrintSize,
      fontWeight: 500,
      lineHeight: finePrintLineHeight,
      x: margin,
      y:
        finePrintY +
        finePrintLines.length * finePrintLineHeight +
        finePrintSize * 0.55,
    }),
  );

  return {
    commands,
    height,
    qrUrl,
    title: copy.headline,
    variant,
    width,
  };
}

function buildHorizontalScene(
  variant: CampaignVariant,
  origin: string,
): CampaignScene {
  const { height, width } = variant;
  const colors = CAMPAIGN_TOKENS.color;
  const copy = CAMPAIGN_TOKENS.copy;
  const margin = 44;
  const qrUrl = offerUrl(origin, variant.source);
  const commands: SceneCommand[] = [
    {
      fill: colors.cream,
      height,
      kind: "rect",
      width,
      x: 0,
      y: 0,
    },
    {
      fill: colors.accent,
      height: 313,
      kind: "rect",
      width: 450,
      x: 750,
      y: 315,
    },
    text(["YGF BOWL-TO-BUILD"], {
      color: colors.accent,
      fontSize: 17,
      fontWeight: 800,
      letterSpacing: 2.3,
      lineHeight: 20,
      x: margin,
      y: 42,
    }),
    text(["Buy a bowl.", "Build with AI."], {
      color: colors.ink,
      fontSize: 58,
      fontWeight: 800,
      lineHeight: 59,
      x: margin,
      y: 105,
    }),
    text(wrapText(copy.subhead, 56), {
      color: colors.sage,
      fontSize: 20,
      fontWeight: 500,
      lineHeight: 27,
      x: margin,
      y: 247,
    }),
    {
      height: 264,
      href: HERO_IMAGE_HREF,
      kind: "image",
      radius: 25,
      sourceHeight: HERO_IMAGE_HEIGHT,
      sourceWidth: HERO_IMAGE_WIDTH,
      width: 406,
      x: 760,
      y: 31,
    },
    {
      kind: "qr",
      size: 170,
      url: qrUrl,
      x: 770,
      y: 338,
    },
    text([copy.scan], {
      color: colors.white,
      fontSize: 32,
      fontWeight: 800,
      lineHeight: 37,
      x: 965,
      y: 376,
    }),
    text(["Spend $25+."], {
      color: colors.white,
      fontSize: 18,
      fontWeight: 700,
      lineHeight: 23,
      x: 965,
      y: 414,
    }),
    text([copy.checkout], {
      color: colors.white,
      fontSize: 14,
      fontWeight: 600,
      lineHeight: 18,
      x: 965,
      y: 444,
    }),
    text(["PUBLIC OFFER QR"], {
      color: colors.cream,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 1.2,
      lineHeight: 13,
      x: 965,
      y: 472,
    }),
    text([copy.shortUniversity], {
      color: colors.ink,
      fontSize: 10,
      fontWeight: 700,
      lineHeight: 13,
      x: margin,
      y: 475,
    }),
  ];

  addUseCases(commands, {
    columns: 4,
    gap: 12,
    height: 94,
    width: 670,
    x: margin,
    y: 345,
  });

  const finePrintLines = wrapText(copy.finePrint, 166);
  const universityLines = wrapText(copy.university, 166);
  commands.push(
    text(finePrintLines, {
      color: colors.ink,
      fontSize: 8.8,
      fontWeight: 500,
      lineHeight: 11.5,
      x: margin,
      y: 496,
    }),
    text(universityLines, {
      color: colors.ink,
      fontSize: 8.8,
      fontWeight: 500,
      lineHeight: 11.5,
      x: margin,
      y: 531,
    }),
  );

  return {
    commands,
    height,
    qrUrl,
    title: copy.headline,
    variant,
    width,
  };
}

function buildScene(variant: CampaignVariant, origin: string) {
  return variant.width / variant.height > 1
    ? buildHorizontalScene(variant, origin)
    : buildPortraitScene(variant, origin);
}

function qrGeometry(url: string): QrGeometry {
  const code = QRCode.create(url, {
    errorCorrectionLevel: "M",
  });
  const modules: Array<{ x: number; y: number }> = [];

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
    quietZone: QR_QUIET_ZONE,
    totalModules: code.modules.size + QR_QUIET_ZONE * 2,
  };
}

function renderTextSvg(command: TextCommand) {
  const attributes = [
    `x="${formatNumber(command.x)}"`,
    `y="${formatNumber(command.y)}"`,
    `fill="${command.color}"`,
    `font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}"`,
    `font-size="${formatNumber(command.fontSize)}"`,
    `font-weight="${command.fontWeight}"`,
  ];
  if (command.letterSpacing) {
    attributes.push(
      `letter-spacing="${formatNumber(command.letterSpacing)}"`,
    );
  }

  const lines = command.lines
    .map(
      (line, index) =>
        `<tspan x="${formatNumber(command.x)}" dy="${
          index === 0 ? "0" : formatNumber(command.lineHeight)
        }">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text ${attributes.join(" ")}>${lines}</text>`;
}

function renderIconSvg(
  icon: UseCaseIcon,
  x: number,
  y: number,
  size: number,
) {
  const stroke = CAMPAIGN_TOKENS.color.accent;
  const strokeWidth = Math.max(2, size * 0.055);
  const common = `fill="none" stroke="${stroke}" stroke-width="${formatNumber(
    strokeWidth,
  )}" stroke-linecap="round" stroke-linejoin="round"`;

  switch (icon) {
    case "book":
      return [
        `<rect x="${formatNumber(x)}" y="${formatNumber(y + size * 0.12)}" width="${formatNumber(size * 0.45)}" height="${formatNumber(size * 0.7)}" rx="${formatNumber(size * 0.06)}" ${common}/>`,
        `<rect x="${formatNumber(x + size * 0.45)}" y="${formatNumber(y + size * 0.12)}" width="${formatNumber(size * 0.45)}" height="${formatNumber(size * 0.7)}" rx="${formatNumber(size * 0.06)}" ${common}/>`,
        `<line x1="${formatNumber(x + size * 0.45)}" y1="${formatNumber(y + size * 0.16)}" x2="${formatNumber(x + size * 0.45)}" y2="${formatNumber(y + size * 0.78)}" ${common}/>`,
      ].join("");
    case "code":
      return [
        `<rect x="${formatNumber(x)}" y="${formatNumber(y + size * 0.08)}" width="${formatNumber(size * 0.92)}" height="${formatNumber(size * 0.64)}" rx="${formatNumber(size * 0.08)}" ${common}/>`,
        `<line x1="${formatNumber(x + size * 0.2)}" y1="${formatNumber(y + size * 0.86)}" x2="${formatNumber(x + size * 0.72)}" y2="${formatNumber(y + size * 0.86)}" ${common}/>`,
        `<line x1="${formatNumber(x + size * 0.33)}" y1="${formatNumber(y + size * 0.3)}" x2="${formatNumber(x + size * 0.23)}" y2="${formatNumber(y + size * 0.4)}" ${common}/>`,
        `<line x1="${formatNumber(x + size * 0.23)}" y1="${formatNumber(y + size * 0.4)}" x2="${formatNumber(x + size * 0.33)}" y2="${formatNumber(y + size * 0.5)}" ${common}/>`,
        `<line x1="${formatNumber(x + size * 0.59)}" y1="${formatNumber(y + size * 0.3)}" x2="${formatNumber(x + size * 0.69)}" y2="${formatNumber(y + size * 0.4)}" ${common}/>`,
        `<line x1="${formatNumber(x + size * 0.69)}" y1="${formatNumber(y + size * 0.4)}" x2="${formatNumber(x + size * 0.59)}" y2="${formatNumber(y + size * 0.5)}" ${common}/>`,
      ].join("");
    case "briefcase":
      return [
        `<rect x="${formatNumber(x)}" y="${formatNumber(y + size * 0.25)}" width="${formatNumber(size * 0.92)}" height="${formatNumber(size * 0.58)}" rx="${formatNumber(size * 0.08)}" ${common}/>`,
        `<rect x="${formatNumber(x + size * 0.3)}" y="${formatNumber(y + size * 0.08)}" width="${formatNumber(size * 0.32)}" height="${formatNumber(size * 0.2)}" rx="${formatNumber(size * 0.05)}" ${common}/>`,
        `<line x1="${formatNumber(x)}" y1="${formatNumber(y + size * 0.48)}" x2="${formatNumber(x + size * 0.92)}" y2="${formatNumber(y + size * 0.48)}" ${common}/>`,
      ].join("");
    case "bowl":
      return [
        `<ellipse cx="${formatNumber(x + size * 0.46)}" cy="${formatNumber(y + size * 0.36)}" rx="${formatNumber(size * 0.45)}" ry="${formatNumber(size * 0.17)}" ${common}/>`,
        `<path d="M ${formatNumber(x + size * 0.03)} ${formatNumber(y + size * 0.38)} Q ${formatNumber(x + size * 0.11)} ${formatNumber(y + size * 0.82)} ${formatNumber(x + size * 0.46)} ${formatNumber(y + size * 0.84)} Q ${formatNumber(x + size * 0.82)} ${formatNumber(y + size * 0.82)} ${formatNumber(x + size * 0.89)} ${formatNumber(y + size * 0.38)}" ${common}/>`,
        `<line x1="${formatNumber(x + size * 0.68)}" y1="${formatNumber(y + size * 0.02)}" x2="${formatNumber(x + size * 0.86)}" y2="${formatNumber(y + size * 0.35)}" ${common}/>`,
      ].join("");
  }
}

function renderUseCaseSvg(command: UseCaseCommand) {
  const iconSize = Math.min(command.height * 0.43, command.width * 0.26);
  const iconX = command.x + command.width * 0.08;
  const iconY = command.y + (command.height - iconSize) / 2;
  const fontSize = Math.min(command.height * 0.18, command.width * 0.115);
  const labelX = iconX + iconSize + command.width * 0.07;
  const labelY = command.y + command.height * 0.57;

  return [
    `<g data-use-case="${escapeXml(command.label)}">`,
    `<rect x="${formatNumber(command.x)}" y="${formatNumber(command.y)}" width="${formatNumber(command.width)}" height="${formatNumber(command.height)}" rx="${formatNumber(Math.min(command.height, command.width) * 0.12)}" fill="${CAMPAIGN_TOKENS.color.white}"/>`,
    renderIconSvg(command.icon, iconX, iconY, iconSize),
    `<text x="${formatNumber(labelX)}" y="${formatNumber(labelY)}" fill="${CAMPAIGN_TOKENS.color.ink}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="${formatNumber(fontSize)}" font-weight="700">${escapeXml(command.label)}</text>`,
    "</g>",
  ].join("");
}

function renderQrSvg(command: QrCommand) {
  const geometry = qrGeometry(command.url);
  const moduleSize = command.size / geometry.totalModules;
  const modules = geometry.modules
    .map(
      ({ x, y }) =>
        `<rect class="qr-module" x="${x}" y="${y}" width="1" height="1"/>`,
    )
    .join("");

  return [
    `<g transform="translate(${formatNumber(command.x)} ${formatNumber(command.y)}) scale(${formatNumber(moduleSize)})">`,
    `<g data-qr-url="${escapeXml(command.url)}" data-qr-modules="${geometry.moduleCount}" data-qr-quiet-zone="${geometry.quietZone}">`,
    `<rect class="qr-background" x="0" y="0" width="${geometry.totalModules}" height="${geometry.totalModules}" fill="#FFFFFF"/>`,
    `<g fill="${CAMPAIGN_TOKENS.color.ink}">${modules}</g>`,
    "</g>",
    "</g>",
  ].join("");
}

export function renderPrivateClaimRowSvg(
  row: Readonly<{
    claimUrl: string;
    code: string;
    rowReference: string;
  }>,
) {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(row.code)) {
    throw new Error("PRIVATE_CLAIM_CODE_INVALID");
  }
  const rowReference = row.rowReference;
  if (
    !/^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$/.test(
      rowReference,
    )
  ) {
    throw new Error("PRIVATE_ROW_REFERENCE_INVALID");
  }

  let claimUrl: URL;
  try {
    claimUrl = new URL(row.claimUrl);
  } catch {
    throw new Error("PRIVATE_CLAIM_URL_INVALID");
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
    throw new Error("PRIVATE_CLAIM_URL_INVALID");
  }

  const qr = renderQrSvg({
    kind: "qr",
    size: 230,
    url: claimUrl.toString(),
    x: 430,
    y: 45,
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="claim-title claim-description" data-private-claim="true" width="3.5in" height="2in" viewBox="0 0 700 400">',
    `<title id="claim-title">Private YGF Build Credits claim row ${escapeXml(row.code)}</title>`,
    `<desc id="claim-description">A private claim credential with matching human-readable code and QR plus non-secret row reference ${escapeXml(rowReference)}. Hand out only after a qualifying purchase.</desc>`,
    `<rect width="700" height="400" fill="${CAMPAIGN_TOKENS.color.cream}"/>`,
    `<rect x="0" y="0" width="20" height="400" fill="${CAMPAIGN_TOKENS.color.accent}"/>`,
    `<text x="52" y="66" fill="${CAMPAIGN_TOKENS.color.accent}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="23" font-weight="800" letter-spacing="2">YGF BOWL-TO-BUILD</text>`,
    `<text x="52" y="118" fill="${CAMPAIGN_TOKENS.color.ink}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="18" font-weight="700">YOUR PRIVATE CLAIM CODE</text>`,
    `<text x="52" y="183" fill="${CAMPAIGN_TOKENS.color.ink}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="52" font-weight="800" letter-spacing="5">${escapeXml(row.code)}</text>`,
    `<text x="52" y="232" fill="${CAMPAIGN_TOKENS.color.sage}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="18" font-weight="600">Scan the matching QR or enter this code.</text>`,
    `<text x="52" y="276" fill="${CAMPAIGN_TOKENS.color.ink}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="14" font-weight="500"><tspan x="52" dy="0">Keep private. One redemption per person/account.</tspan><tspan x="52" dy="22">Credits expire 14 days after redemption.</tspan></text>`,
    `<text x="52" y="350" fill="${CAMPAIGN_TOKENS.color.accent}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="13" font-weight="800" letter-spacing="1">HAND OUT ONLY AFTER A QUALIFYING $25+ PURCHASE</text>`,
    qr,
    `<text x="465" y="312" fill="${CAMPAIGN_TOKENS.color.ink}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="13" font-weight="800" letter-spacing="1">PRIVATE CLAIM QR</text>`,
    `<text data-row-reference="${escapeXml(rowReference)}" x="465" y="342" fill="${CAMPAIGN_TOKENS.color.sage}" font-family="${escapeXml(CAMPAIGN_TOKENS.fontFamily)}" font-size="12" font-weight="700">ROW REF: ${escapeXml(rowReference)}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

function renderSvg(scene: CampaignScene) {
  const clipDefinitions: string[] = [];
  const body = scene.commands
    .map((command, index) => {
      switch (command.kind) {
        case "rect":
          return `<rect x="${formatNumber(command.x)}" y="${formatNumber(command.y)}" width="${formatNumber(command.width)}" height="${formatNumber(command.height)}"${command.radius ? ` rx="${formatNumber(command.radius)}"` : ""} fill="${command.fill}"/>`;
        case "image": {
          const clipId = `image-clip-${index}`;
          clipDefinitions.push(
            `<clipPath id="${clipId}"><rect x="${formatNumber(command.x)}" y="${formatNumber(command.y)}" width="${formatNumber(command.width)}" height="${formatNumber(command.height)}" rx="${formatNumber(command.radius)}"/></clipPath>`,
          );
          return `<image href="${escapeXml(command.href)}" x="${formatNumber(command.x)}" y="${formatNumber(command.y)}" width="${formatNumber(command.width)}" height="${formatNumber(command.height)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`;
        }
        case "text":
          return renderTextSvg(command);
        case "qr":
          return renderQrSvg(command);
        case "use-case":
          return renderUseCaseSvg(command);
      }
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-labelledby="campaign-title campaign-description" width="${scene.variant.outputWidth}" height="${scene.variant.outputHeight}" viewBox="0 0 ${scene.width} ${scene.height}">`,
    `<title id="campaign-title">${escapeXml(scene.title)}</title>`,
    `<desc id="campaign-description">YGF Bowl-to-Build campaign creative with a public offer QR code. A private claim code is supplied only after a qualifying purchase.</desc>`,
    `<metadata data-renderer="ygf-campaign-v1" data-source="${escapeXml(scene.variant.source)}" data-public-qr="${escapeXml(scene.qrUrl)}"/>`,
    `<defs>${clipDefinitions.join("")}</defs>`,
    body,
    "</svg>",
    "",
  ].join("\n");
}

function parseHexColor(color: Color) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error(`Unsupported color: ${color}`);
  }
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ] as const;
}

function pdfFill(color: Color) {
  return `${parseHexColor(color).map(formatNumber).join(" ")} rg`;
}

function pdfStroke(color: Color) {
  return `${parseHexColor(color).map(formatNumber).join(" ")} RG`;
}

function pdfRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  pageHeight: number,
  scaleX: number,
  scaleY: number,
) {
  return `${formatNumber(x * scaleX)} ${formatNumber(
    pageHeight - (y + height) * scaleY,
  )} ${formatNumber(width * scaleX)} ${formatNumber(height * scaleY)} re`;
}

function renderPdfText(
  command: TextCommand,
  pageHeight: number,
  scaleX: number,
  scaleY: number,
) {
  const font = command.fontWeight >= 700 ? "F2" : "F1";
  const lines = command.lines.map((line, index) => {
    const baseline = command.y + index * command.lineHeight;
    return [
      "BT",
      pdfFill(command.color),
      `/${font} ${formatNumber(command.fontSize * scaleY)} Tf`,
      command.letterSpacing
        ? `${formatNumber(command.letterSpacing * scaleX)} Tc`
        : "0 Tc",
      `1 0 0 1 ${formatNumber(command.x * scaleX)} ${formatNumber(
        pageHeight - baseline * scaleY,
      )} Tm`,
      `(${escapePdf(line)}) Tj`,
      "ET",
    ].join("\n");
  });
  return lines.join("\n");
}

function renderPdfLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
  pageHeight: number,
  scaleX: number,
  scaleY: number,
) {
  return [
    pdfStroke(CAMPAIGN_TOKENS.color.accent),
    `${formatNumber(strokeWidth * scaleX)} w`,
    `${formatNumber(x1 * scaleX)} ${formatNumber(pageHeight - y1 * scaleY)} m`,
    `${formatNumber(x2 * scaleX)} ${formatNumber(pageHeight - y2 * scaleY)} l`,
    "S",
  ].join("\n");
}

function renderPdfEllipse(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  strokeWidth: number,
  pageHeight: number,
  scaleX: number,
  scaleY: number,
) {
  const kappa = 0.5522847498;
  const x = centerX * scaleX;
  const y = pageHeight - centerY * scaleY;
  const rx = radiusX * scaleX;
  const ry = radiusY * scaleY;

  return [
    pdfStroke(CAMPAIGN_TOKENS.color.accent),
    `${formatNumber(strokeWidth * scaleX)} w`,
    `${formatNumber(x + rx)} ${formatNumber(y)} m`,
    `${formatNumber(x + rx)} ${formatNumber(y + ry * kappa)} ${formatNumber(x + rx * kappa)} ${formatNumber(y + ry)} ${formatNumber(x)} ${formatNumber(y + ry)} c`,
    `${formatNumber(x - rx * kappa)} ${formatNumber(y + ry)} ${formatNumber(x - rx)} ${formatNumber(y + ry * kappa)} ${formatNumber(x - rx)} ${formatNumber(y)} c`,
    `${formatNumber(x - rx)} ${formatNumber(y - ry * kappa)} ${formatNumber(x - rx * kappa)} ${formatNumber(y - ry)} ${formatNumber(x)} ${formatNumber(y - ry)} c`,
    `${formatNumber(x + rx * kappa)} ${formatNumber(y - ry)} ${formatNumber(x + rx)} ${formatNumber(y - ry * kappa)} ${formatNumber(x + rx)} ${formatNumber(y)} c`,
    "S",
  ].join("\n");
}

function renderUseCasePdf(
  command: UseCaseCommand,
  pageHeight: number,
  scaleX: number,
  scaleY: number,
) {
  const iconSize = Math.min(command.height * 0.43, command.width * 0.26);
  const iconX = command.x + command.width * 0.08;
  const iconY = command.y + (command.height - iconSize) / 2;
  const strokeWidth = Math.max(2, iconSize * 0.055);
  const parts = [
    pdfFill(CAMPAIGN_TOKENS.color.white),
    `${pdfRectangle(
      command.x,
      command.y,
      command.width,
      command.height,
      pageHeight,
      scaleX,
      scaleY,
    )} f`,
  ];

  switch (command.icon) {
    case "book":
      parts.push(
        renderPdfLine(
          iconX,
          iconY + iconSize * 0.12,
          iconX,
          iconY + iconSize * 0.82,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
        renderPdfLine(
          iconX,
          iconY + iconSize * 0.12,
          iconX + iconSize * 0.9,
          iconY + iconSize * 0.12,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
        renderPdfLine(
          iconX + iconSize * 0.45,
          iconY + iconSize * 0.12,
          iconX + iconSize * 0.45,
          iconY + iconSize * 0.82,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
      );
      break;
    case "code":
      parts.push(
        renderPdfLine(
          iconX,
          iconY + iconSize * 0.08,
          iconX + iconSize * 0.92,
          iconY + iconSize * 0.08,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
        renderPdfLine(
          iconX,
          iconY + iconSize * 0.72,
          iconX + iconSize * 0.92,
          iconY + iconSize * 0.72,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
        renderPdfLine(
          iconX + iconSize * 0.2,
          iconY + iconSize * 0.86,
          iconX + iconSize * 0.72,
          iconY + iconSize * 0.86,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
      );
      break;
    case "briefcase":
      parts.push(
        `${pdfStroke(CAMPAIGN_TOKENS.color.accent)}\n${formatNumber(
          strokeWidth * scaleX,
        )} w\n${pdfRectangle(
          iconX,
          iconY + iconSize * 0.25,
          iconSize * 0.92,
          iconSize * 0.58,
          pageHeight,
          scaleX,
          scaleY,
        )} S`,
        renderPdfLine(
          iconX,
          iconY + iconSize * 0.48,
          iconX + iconSize * 0.92,
          iconY + iconSize * 0.48,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
      );
      break;
    case "bowl":
      parts.push(
        renderPdfEllipse(
          iconX + iconSize * 0.46,
          iconY + iconSize * 0.36,
          iconSize * 0.45,
          iconSize * 0.17,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
        renderPdfLine(
          iconX + iconSize * 0.08,
          iconY + iconSize * 0.48,
          iconX + iconSize * 0.84,
          iconY + iconSize * 0.48,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
        renderPdfLine(
          iconX + iconSize * 0.68,
          iconY + iconSize * 0.02,
          iconX + iconSize * 0.86,
          iconY + iconSize * 0.35,
          strokeWidth,
          pageHeight,
          scaleX,
          scaleY,
        ),
      );
      break;
  }

  const label: TextCommand = {
    color: CAMPAIGN_TOKENS.color.ink,
    fontSize: Math.min(command.height * 0.18, command.width * 0.115),
    fontWeight: 700,
    kind: "text",
    lineHeight: 1,
    lines: [command.label],
    x: iconX + iconSize + command.width * 0.07,
    y: command.y + command.height * 0.57,
  };
  parts.push(renderPdfText(label, pageHeight, scaleX, scaleY));
  return parts.join("\n");
}

function renderQrPdf(
  command: QrCommand,
  pageHeight: number,
  scaleX: number,
  scaleY: number,
) {
  const geometry = qrGeometry(command.url);
  const moduleWidth = command.size / geometry.totalModules;
  const parts = [
    pdfFill(CAMPAIGN_TOKENS.color.white),
    `${pdfRectangle(
      command.x,
      command.y,
      command.size,
      command.size,
      pageHeight,
      scaleX,
      scaleY,
    )} f`,
    pdfFill(CAMPAIGN_TOKENS.color.ink),
  ];

  for (const qrModule of geometry.modules) {
    parts.push(
      `${pdfRectangle(
        command.x + qrModule.x * moduleWidth,
        command.y + qrModule.y * moduleWidth,
        moduleWidth,
        moduleWidth,
        pageHeight,
        scaleX,
        scaleY,
      )} f`,
    );
  }

  return parts.join("\n");
}

function renderImagePdf(
  command: ImageCommand,
  pageHeight: number,
  scaleX: number,
  scaleY: number,
) {
  const sourceAspect = command.sourceWidth / command.sourceHeight;
  const boxAspect = command.width / command.height;
  let drawWidth = command.width;
  let drawHeight = command.height;

  if (sourceAspect > boxAspect) {
    drawWidth = command.height * sourceAspect;
  } else {
    drawHeight = command.width / sourceAspect;
  }

  const drawX = command.x + (command.width - drawWidth) / 2;
  const drawY = command.y + (command.height - drawHeight) / 2;
  const clip = pdfRectangle(
    command.x,
    command.y,
    command.width,
    command.height,
    pageHeight,
    scaleX,
    scaleY,
  );
  const imageY = pageHeight - (drawY + drawHeight) * scaleY;

  return [
    "q",
    `${clip} W n`,
    `${formatNumber(drawWidth * scaleX)} 0 0 ${formatNumber(
      drawHeight * scaleY,
    )} ${formatNumber(drawX * scaleX)} ${formatNumber(imageY)} cm`,
    "/Im0 Do",
    "Q",
  ].join("\n");
}

function parsePng(buffer: Buffer): ParsedPng {
  const signature = buffer.subarray(0, 8);
  const expected = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (!signature.equals(expected)) {
    throw new Error("Hero media is not a PNG.");
  }

  let width = 0;
  let height = 0;
  let offset = 8;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || colorType !== 2 || interlace !== 0) {
        throw new Error(
          "Hero PNG must be non-interlaced, 8-bit RGB for deterministic PDF embedding.",
        );
      }
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || idatChunks.length === 0) {
    throw new Error("Hero PNG is missing required image data.");
  }

  return {
    compressedScanlines: Buffer.concat(idatChunks),
    height,
    width,
  };
}

function pdfStream(dictionary: string, data: Buffer) {
  return Buffer.concat([
    Buffer.from(
      `<< ${dictionary} /Length ${data.length} >>\nstream\n`,
      "ascii",
    ),
    data,
    Buffer.from("\nendstream", "ascii"),
  ]);
}

function buildPdf(
  scene: CampaignScene,
  pageWidth: number,
  pageHeight: number,
  image: ParsedPng,
) {
  const scaleX = pageWidth / scene.width;
  const scaleY = pageHeight / scene.height;
  const contentParts = scene.commands.map((command) => {
    switch (command.kind) {
      case "rect":
        return `${pdfFill(command.fill)}\n${pdfRectangle(
          command.x,
          command.y,
          command.width,
          command.height,
          pageHeight,
          scaleX,
          scaleY,
        )} f`;
      case "image":
        return renderImagePdf(
          command,
          pageHeight,
          scaleX,
          scaleY,
        );
      case "text":
        return renderPdfText(
          command,
          pageHeight,
          scaleX,
          scaleY,
        );
      case "qr":
        return renderQrPdf(command, pageHeight, scaleX, scaleY);
      case "use-case":
        return renderUseCasePdf(
          command,
          pageHeight,
          scaleX,
          scaleY,
        );
    }
  });
  const content = Buffer.from(`${contentParts.join("\n")}\n`, "ascii");
  const imageObject = pdfStream(
    `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${image.width} >>`,
    image.compressedScanlines,
  );

  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "ascii"),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(
        pageWidth,
      )} ${formatNumber(
        pageHeight,
      )}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im0 6 0 R >> >> /Contents 7 0 R >>`,
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
    imageObject,
    pdfStream("", content),
    Buffer.from(
      `<< /Title (${escapePdf(
        CAMPAIGN_TOKENS.copy.headline,
      )}) /Subject (${escapePdf(
        "Limited-time YGF promotional Build Credits.",
      )}) /Creator (YGF deterministic campaign renderer) >>`,
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
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF",
    "",
  ].join("\n");
  chunks.push(Buffer.from(xref, "ascii"));
  return Buffer.concat(chunks);
}

function parseOriginArgument(argv: readonly string[]) {
  const originIndex = argv.indexOf("--origin");
  if (originIndex < 0) {
    return PUBLIC_ORIGIN;
  }
  const origin = argv[originIndex + 1];
  if (!origin) {
    throw new Error("--origin requires an HTTPS URL.");
  }
  return origin;
}

function assertExactCampaignAsset(
  file: string,
  actual: Buffer,
  expected: Buffer,
) {
  if (!actual.equals(expected)) {
    throw new Error(
      `Campaign asset ${file} does not use the reviewed origin or does not match the exact deterministic render. Expected the reviewed-origin exact deterministic render byte-for-byte.`,
    );
  }
}

export async function verifyCampaignAssetOrigin(
  options: Readonly<{
    origin?: string;
    root?: string;
  }> = {},
) {
  const root = options.root ?? repositoryRoot;
  const origin = options.origin ?? PUBLIC_ORIGIN;
  const campaignDirectory = path.join(root, "public/campaign");
  const pdfDirectory = path.join(root, "output/pdf");
  const scenes = new Map<string, CampaignScene>();

  for (const variant of CAMPAIGN_VARIANTS) {
    const scene = buildScene(variant, origin);
    scenes.set(variant.file, scene);
    const actual = await readFile(
      path.join(campaignDirectory, variant.file),
    );
    const expected = Buffer.from(renderSvg(scene), "utf8");
    assertExactCampaignAsset(variant.file, actual, expected);
  }

  const heroPath = path.join(root, "public/media/malatang-hero.png");
  const image = parsePng(await readFile(heroPath));
  for (const printAsset of CAMPAIGN_PRINT_ASSETS) {
    const scene = scenes.get(printAsset.sceneFile);
    if (!scene) {
      throw new Error(
        `Required print scene ${printAsset.sceneFile} was not generated.`,
      );
    }
    const actual = await readFile(
      path.join(pdfDirectory, printAsset.file),
    );
    const expected = buildPdf(
      scene,
      printAsset.pageWidth,
      printAsset.pageHeight,
      image,
    );
    assertExactCampaignAsset(printAsset.file, actual, expected);
  }

  return {
    pdfCount: CAMPAIGN_PRINT_ASSETS.length,
    svgCount: CAMPAIGN_VARIANTS.length,
  };
}

export async function renderCampaignAssets(
  options: Readonly<{
    origin?: string;
    root?: string;
  }> = {},
) {
  const root = options.root ?? repositoryRoot;
  const origin = options.origin ?? PUBLIC_ORIGIN;
  const campaignDirectory = path.join(root, "public/campaign");
  const pdfDirectory = path.join(root, "output/pdf");
  const heroPath = path.join(root, "public/media/malatang-hero.png");
  const image = parsePng(await readFile(heroPath));

  await Promise.all([
    mkdir(campaignDirectory, { recursive: true }),
    mkdir(pdfDirectory, { recursive: true }),
  ]);

  const scenes = new Map<string, CampaignScene>();
  for (const variant of CAMPAIGN_VARIANTS) {
    const scene = buildScene(variant, origin);
    scenes.set(variant.file, scene);
    await writeFile(
      path.join(campaignDirectory, variant.file),
      renderSvg(scene),
      "utf8",
    );
  }

  await Promise.all(
    CAMPAIGN_PRINT_ASSETS.map(async (printAsset) => {
      const scene = scenes.get(printAsset.sceneFile);
      if (!scene) {
        throw new Error(
          `Required print scene ${printAsset.sceneFile} was not generated.`,
        );
      }
      await writeFile(
        path.join(pdfDirectory, printAsset.file),
        buildPdf(
          scene,
          printAsset.pageWidth,
          printAsset.pageHeight,
          image,
        ),
      );
    }),
  );

  return {
    pdfCount: CAMPAIGN_PRINT_ASSETS.length,
    svgCount: CAMPAIGN_VARIANTS.length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const argv = process.argv.slice(2);
  const verifyOnly = argv.includes("--verify-only");
  const unknown = argv.filter(
    (value, index) =>
      value !== "--verify-only" &&
      value !== "--origin" &&
      argv[index - 1] !== "--origin",
  );
  if (unknown.length > 0) {
    throw new Error(
      "Usage: render-campaign-assets.mts [--origin <https-origin>] [--verify-only]",
    );
  }
  const operation = verifyOnly
    ? verifyCampaignAssetOrigin
    : renderCampaignAssets;
  const result = await operation({
    origin: parseOriginArgument(argv),
  });
  process.stdout.write(
    `${verifyOnly ? "Verified" : "Rendered"} ${result.svgCount} campaign SVGs and ${result.pdfCount} PDFs.\n`,
  );
}
