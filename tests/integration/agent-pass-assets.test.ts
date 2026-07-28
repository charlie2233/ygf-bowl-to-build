// @vitest-environment node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rmdir,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import jsQR from "jsqr";
import { beforeAll, describe, expect, it } from "vitest";

import {
  generatePrivateRowReferences,
  serializePrivateCodeCsv,
} from "@/lib/admin/code-batch";
import {
  AGENT_PASS_COPY,
  AGENT_PASS_PAPERS,
  AGENT_PASS_SIZE,
  AGENT_PASS_VARIANTS,
  agentPassImpositionCardPosition,
  agentPassMillimetersToPixels,
  agentPassMillimetersToPoints,
  decodeAgentPassPngRgb,
  inspectAgentPassPhoto,
  verifyAgentPassAssets,
  // @ts-expect-error -- Vitest resolves the executable .mts module.
} from "@/scripts/render-agent-pass-assets.mts";
// @ts-expect-error -- Vitest resolves the executable .mts module.
import { writePrivateAgentPassBatchFromCsv } from "@/scripts/render-private-agent-pass-batch.mts";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const rendererPath = path.join(
  repositoryRoot,
  "scripts/render-private-agent-pass-batch.mts",
);
const publicRendererPath = path.join(
  repositoryRoot,
  "scripts/render-agent-pass-assets.mts",
);
let generatedRoot = "";
let publicDirectory = "";
let printDirectory = "";

function decodeXmlText(svg: string): string {
  return svg
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .replace(/(\p{Script=Han})\s+(\p{Script=Han})/gu, "$1$2")
    .trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Bytes(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicCode(index: number): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let value = index;
  let code = "";
  for (let position = 0; position < 8; position += 1) {
    code =
      alphabet[value % alphabet.length] + code;
    value = Math.floor(value / alphabet.length);
  }
  return code;
}

function readEmbeddedAgentPassSvgs(html: string): readonly string[] {
  return [
    ...html.matchAll(
      /<img class="agent-pass-back"[^>]+src="data:image\/svg\+xml;base64,([^"]+)"/g,
    ),
  ].map((match) =>
    Buffer.from(match[1], "base64").toString("utf8"),
  );
}

function readQrGeometry(svg: string) {
  const group = svg.match(
    /<g data-qr-url="([^"]+)" data-qr-modules="(\d+)" data-qr-quiet-zone="(\d+)"[^>]*>([\s\S]*?)<\/g>/,
  );
  if (!group) {
    throw new Error("Protected Agent Pass is missing QR geometry.");
  }
  const [, encodedUrl, moduleCountText, quietZoneText, body] =
    group;
  return {
    moduleCount: Number(moduleCountText),
    modules: [
      ...body.matchAll(
        /<rect class="qr-module" x="(\d+)" y="(\d+)" width="1" height="1"\/>/g,
      ),
    ].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
    })),
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
    for (let y = 0; y < scale; y += 1) {
      for (let x = 0; x < scale; x += 1) {
        const pixelX = qrModule.x * scale + x;
        const pixelY = qrModule.y * scale + y;
        const index = (pixelY * width + pixelX) * 4;
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

function cropRgbToRgba(options: Readonly<{
  height: number;
  pixels: Buffer;
  width: number;
  x: number;
  y: number;
  cropWidth: number;
  cropHeight: number;
}>): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(
    options.cropWidth * options.cropHeight * 4,
  );
  for (
    let cropY = 0;
    cropY < options.cropHeight;
    cropY += 1
  ) {
    for (
      let cropX = 0;
      cropX < options.cropWidth;
      cropX += 1
    ) {
      const sourceX = options.x + cropX;
      const sourceY = options.y + cropY;
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= options.width ||
        sourceY >= options.height
      ) {
        continue;
      }
      const source =
        (sourceY * options.width + sourceX) * 3;
      const destination =
        (cropY * options.cropWidth + cropX) * 4;
      rgba[destination] = options.pixels[source];
      rgba[destination + 1] =
        options.pixels[source + 1];
      rgba[destination + 2] =
        options.pixels[source + 2];
      rgba[destination + 3] = 255;
    }
  }
  return rgba;
}

async function rasterizePdfPage(options: Readonly<{
  file: string;
  page?: number;
}>): Promise<Readonly<{
  png: Buffer;
  remove: () => Promise<void>;
}>> {
  const rasterDirectory = await mkdtemp(
    path.join(tmpdir(), "ygf-agent-pass-pdf-raster-"),
  );
  const prefix = path.join(rasterDirectory, "page");
  const page = String(options.page ?? 1);
  await execFileAsync(
    "pdftoppm",
    [
      "-f",
      page,
      "-l",
      page,
      "-singlefile",
      "-r",
      "300",
      "-png",
      options.file,
      prefix,
    ],
    { encoding: "buffer" },
  );
  const output = `${prefix}.png`;
  return {
    png: await readFile(output),
    remove: async () => {
      await unlink(output).catch(() => undefined);
      await rmdir(rasterDirectory).catch(() => undefined);
    },
  };
}

async function inspectPdfStructureInChild(
  file: string,
): Promise<Readonly<{
  count: number | null;
  forbidden: boolean;
  mediaBoxes: readonly string[];
  pageObjects: number;
}>> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--eval",
      [
        'const fs = require("node:fs");',
        "const searchable = fs.readFileSync(process.argv[1]).toString(\"latin1\");",
        "const count = searchable.match(/\\/Count (\\d+)/)?.[1];",
        "const mediaBoxes = [...searchable.matchAll(/\\/MediaBox \\[([^\\]]+)\\]/g)].map((match) => match[1]);",
        "const pageObjects = searchable.match(/\\/Type \\/Page\\b/g)?.length ?? 0;",
        "const forbidden = /\\/Font\\b|\\/BaseFont\\b|\\/Subtype\\s+\\/Type[01]\\b|(?:^|\\s)(?:Tf|Tj|TJ)(?:\\s|$)/m.test(searchable);",
        "process.stdout.write(JSON.stringify({ count: count ? Number(count) : null, forbidden, mediaBoxes, pageObjects }));",
      ].join("\n"),
      file,
    ],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(stdout) as Readonly<{
    count: number | null;
    forbidden: boolean;
    mediaBoxes: readonly string[];
    pageObjects: number;
  }>;
}

function groupTagForSourceIndex(
  svg: string,
  sourceLocalIndex: number,
): string {
  const tag = svg.match(
    new RegExp(
      `<g data-agent-pass-slot="[^"]+" data-source-local-index="${sourceLocalIndex}"[^>]*\\/?>`,
    ),
  )?.[0];
  if (!tag) {
    throw new Error("Private sheet metadata is missing.");
  }
  return tag;
}

async function createPrivateCsvFixture(rowCount = 3) {
  const cwd = await mkdtemp(
    path.join(tmpdir(), "ygf-agent-pass-private-"),
  );
  const privateDirectory = path.join(cwd, "private");
  const mediaDirectory = path.join(cwd, "public/media");
  await writeFile(path.join(cwd, ".gitignore"), "private/\n");
  await execFileAsync("git", ["init", "--quiet"], { cwd });
  await mkdir(privateDirectory, { mode: 0o700 });
  await mkdir(mediaDirectory, { recursive: true });
  await copyFile(
    path.join(
      repositoryRoot,
      "public/media/ygf-user-photo.png",
    ),
    path.join(mediaDirectory, "ygf-user-photo.png"),
  );
  await chmod(privateDirectory, 0o700);
  const codes = Array.from(
    { length: rowCount },
    (_value, index) => deterministicCode(index + 1),
  );
  const rowReferences = generatePrivateRowReferences(
    codes.length,
    () => 0,
  );
  const csv = serializePrivateCodeCsv(
    codes,
    "https://build.ygf.example",
    rowReferences,
  );
  const source = path.join(
    privateDirectory,
    "admin-download.csv",
  );
  await writeFile(source, csv, { mode: 0o600 });
  await chmod(source, 0o600);
  return {
    codes,
    csv,
    cwd,
    rowReferences,
    source,
  };
}

async function runPrivateAgentPassCli(
  cwd: string,
  stem: string,
): Promise<Readonly<{ stderr: string; stdout: string }>> {
  return execFileAsync(
    process.execPath,
    [
      "--no-warnings",
      rendererPath,
      "--input",
      "private/admin-download.csv",
      "--out",
      `private/${stem}.html`,
    ],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );
}

beforeAll(async () => {
  generatedRoot = await mkdtemp(
    path.join(tmpdir(), "ygf-agent-pass-assets-"),
  );
  const mediaDirectory = path.join(
    generatedRoot,
    "public/media",
  );
  await mkdir(mediaDirectory, { recursive: true });
  await copyFile(
    path.join(
      repositoryRoot,
      "public/media/ygf-user-photo.png",
    ),
    path.join(mediaDirectory, "ygf-user-photo.png"),
  );
  await cp(
    path.join(
      repositoryRoot,
      "public/campaign/agent-pass",
    ),
    path.join(
      generatedRoot,
      "public/campaign/agent-pass",
    ),
    { recursive: true },
  );
  await cp(
    path.join(repositoryRoot, "output/agent-pass"),
    path.join(generatedRoot, "output/agent-pass"),
    { recursive: true },
  );
  publicDirectory = path.join(
    generatedRoot,
    "public/campaign/agent-pass",
  );
  printDirectory = path.join(
    generatedRoot,
    "output/agent-pass",
  );
}, 60_000);

describe("public collectible Agent Pass assets", () => {
  it("renders exactly four fronts and one shared no-secret back", async () => {
    expect((await readdir(publicDirectory)).sort()).toEqual(
      [
        ...AGENT_PASS_VARIANTS.map(
          ({ slug }) => `${slug}-front.svg`,
        ),
        "shared-back.svg",
      ].sort(),
    );
  });

  it("uses four explicit, unique, in-bounds photo translations", () => {
    const translations = AGENT_PASS_VARIANTS.map(
      ({ photoTranslateX }) => photoTranslateX,
    );
    expect(translations).toEqual([382, 300, 218, 136]);
    expect(new Set(translations).size).toBe(4);
    for (const translation of translations) {
      expect(translation).toBeLessThanOrEqual(382);
      expect(translation + 1600 * 0.45).toBeGreaterThanOrEqual(
        856,
      );
    }
  });

  it.each(AGENT_PASS_VARIANTS)(
    "renders the $english front at 85.6x54mm with approved public copy and no credential",
    async (variant) => {
      const svg = await readFile(
        path.join(
          publicDirectory,
          `${variant.slug}-front.svg`,
        ),
        "utf8",
      );
      const text = decodeXmlText(svg);
      expect(svg).toContain(
        `width="${AGENT_PASS_SIZE.widthMm}mm"`,
      );
      expect(svg).toContain(
        `height="${AGENT_PASS_SIZE.heightMm}mm"`,
      );
      expect(svg).toContain(
        'href="../../media/ygf-user-photo.png"',
      );
      expect(svg).toContain(
        'data-photo-source="user-provided"',
      );
      expect(svg).toContain(
        'data-rights-status="pending-brand-rights-confirmation"',
      );
      expect(svg).toContain(
        `transform="translate(${variant.photoTranslateX} 0) scale(0.45)"`,
      );
      expect(svg).toContain("#D84A32");
      expect(svg).toContain("#E8B94A");
      expect(svg).toContain("#F6F0E4");
      expect(svg).not.toContain("#B73529");
      expect(text).toContain(AGENT_PASS_COPY.headline);
      expect(text).toContain(AGENT_PASS_COPY.reward);
      expect(text).toContain(AGENT_PASS_COPY.duration);
      expect(text).toContain(AGENT_PASS_COPY.useCases);
      expect(text).toContain(AGENT_PASS_COPY.hashtag);
      expect(text).toContain(variant.english);
      expect(text).toContain(AGENT_PASS_COPY.university);
      expect(svg).not.toMatch(
        /data-qr|qr-module|#code=|\/redeem|ygf_[A-Za-z0-9]|sk-[A-Za-z0-9]/i,
      );
      expect(svg).not.toMatch(
        /usc[^<]*(?:logo|mark)|(?:logo|mark)[^<]*usc/i,
      );
      if (variant.slug === "pick-my-bowl") {
        expect(svg).toContain(
          'x="166" y="126" fill="#D84A32"',
        );
        expect(svg).toContain('font-size="10.5"');
      }
    },
  );

  it("keeps the shared public back credential-free and marks the protected overlay as empty", async () => {
    const svg = await readFile(
      path.join(publicDirectory, "shared-back.svg"),
      "utf8",
    );
    const text = decodeXmlText(svg);
    expect(svg).toContain('data-side="back"');
    expect(svg).toContain(
      'data-protected-overlay-slot="empty"',
    );
    expect(text).toContain(
      "The public template is intentionally credential-free.",
    );
    expect(text).toContain(AGENT_PASS_COPY.reward);
    expect(text).toContain(AGENT_PASS_COPY.university);
    expect(svg).toContain(
      'data-agent-pass-steps="scratch-scan-start"',
    );
    expect(text).toContain("1 刮开 / OPEN");
    expect(text).toContain("2 扫码 / SCAN");
    expect(text).toContain("3 开始使用 / START USING");
    expect(text).toContain("刮开后请勿拍照分享");
    expect(svg).not.toMatch(
      /data-qr|qr-module|#code=|\/redeem|ygf_[A-Za-z0-9]|sk-[A-Za-z0-9]/i,
    );
  });

  it("uses the inspected user photo without personal metadata or a rights-cleared claim", async () => {
    const photo = await readFile(
      path.join(
        repositoryRoot,
        "public/media/ygf-user-photo.png",
      ),
    );
    const details = inspectAgentPassPhoto(photo);
    expect(details).toMatchObject({
      colorType: 2,
      height: 1200,
      metadataChunks: [],
      width: 1600,
    });
    const ledger = await readFile(
      path.join(
        repositoryRoot,
        "docs/design/media-ledger.md",
      ),
      "utf8",
    );
    expect(ledger).toContain(
      "user-provided; pending brand-rights confirmation",
    );
    expect(ledger).not.toContain(
      "`public/media/ygf-user-photo.png` is rights-cleared",
    );
  });
});

describe("print-ready Agent Pass outputs", () => {
  it("renders and verifies a fresh exact artifact root in an isolated child process", async () => {
    const freshRoot = await mkdtemp(
      path.join(tmpdir(), "ygf-agent-pass-child-render-"),
    );
    const mediaDirectory = path.join(
      freshRoot,
      "public/media",
    );
    await mkdir(mediaDirectory, { recursive: true });
    await copyFile(
      path.join(
        repositoryRoot,
        "public/media/ygf-user-photo.png",
      ),
      path.join(mediaDirectory, "ygf-user-photo.png"),
    );
    const moduleUrl = pathToFileURL(publicRendererPath).href;
    await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `const renderer = await import(${JSON.stringify(moduleUrl)}); await renderer.renderAgentPassAssets({ root: process.argv[1] });`,
        freshRoot,
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );
    await expect(
      verifyAgentPassAssets({ root: freshRoot }),
    ).resolves.toEqual({
      pdfCount: 9,
      previewCount: 4,
      printSvgCount: 9,
      publicSvgCount: 5,
    });
  }, 60_000);

  it("produces individual SVG/PDF cards plus Letter and A4 front/back impositions", async () => {
    const files = (await readdir(printDirectory)).sort();
    const individual = [
      ...AGENT_PASS_VARIANTS.map(
        ({ slug }) => `${slug}-front`,
      ),
      "shared-back",
    ];
    const sheets = [
      "fronts-letter",
      "backs-letter",
      "fronts-a4",
      "backs-a4",
    ];
    expect(files).toEqual(
      [
        ...[...individual, ...sheets].flatMap(
          (basename) => [
            `${basename}.pdf`,
            `${basename}.svg`,
          ],
        ),
        "previews",
      ].sort(),
    );
    for (const basename of [...individual, ...sheets]) {
      expect(files).toContain(`${basename}.svg`);
      expect(files).toContain(`${basename}.pdf`);
    }

    for (const basename of sheets) {
      const svg = await readFile(
        path.join(printDirectory, `${basename}.svg`),
        "utf8",
      );
      expect(svg.match(/data-agent-pass-slot=/g)).toHaveLength(
        8,
      );
      expect(svg).toContain('data-scale="100-percent"');
      expect(svg).toContain('data-gutter-mm="10"');
      expect(svg).toContain('data-cut-marks="true"');
    }
  });

  it("writes exact 300-DPI RGB raster card, Letter, and A4 PDFs without fonts or text operators", async () => {
    const expectations = [
      {
        file: "study-front.pdf",
        image: "/Width 1011 /Height 638",
        mediaBox: "/MediaBox [0 0 242.6457 153.0709]",
      },
      {
        file: "fronts-letter.pdf",
        image: "/Width 2550 /Height 3300",
        mediaBox: "/MediaBox [0 0 612 792]",
      },
      {
        file: "backs-a4.pdf",
        image: "/Width 2480 /Height 3508",
        mediaBox: "/MediaBox [0 0 595.2756 841.8898]",
      },
    ];
    for (const expectation of expectations) {
      const pdf = await readFile(
        path.join(printDirectory, expectation.file),
      );
      const searchable = pdf.toString("latin1");
      expect(searchable.startsWith("%PDF-1.4")).toBe(true);
      expect(searchable).toContain(expectation.mediaBox);
      expect(searchable).toContain("/Subtype /Image");
      expect(searchable).toContain(expectation.image);
      expect(searchable).toContain("/ColorSpace /DeviceRGB");
      expect(searchable).not.toMatch(
        /\/Font\b|\/BaseFont\b|\/Subtype\s+\/Type[01]\b|(?:^|\s)(?:Tf|Tj|TJ)(?:\s|$)/m,
      );
    }
  });

  it("passes pdffonts and 300-DPI Poppler raster geometry checks with four distinct photo crops", async () => {
    const individual = [
      ...AGENT_PASS_VARIANTS.map(
        ({ slug }) => `${slug}-front`,
      ),
      "shared-back",
    ];
    const sheets = [
      "fronts-letter",
      "backs-letter",
      "fronts-a4",
      "backs-a4",
    ];
    const cropDigests: string[] = [];
    for (const basename of [...individual, ...sheets]) {
      const file = path.join(
        printDirectory,
        `${basename}.pdf`,
      );
      const { stdout: fontOutput } = await execFileAsync(
        "pdffonts",
        [file],
        { encoding: "utf8" },
      );
      expect(
        fontOutput
          .trim()
          .split("\n")
          .filter(Boolean),
      ).toHaveLength(2);

      const raster = await rasterizePdfPage({ file });
      try {
        const details = inspectAgentPassPhoto(raster.png);
        const paper = AGENT_PASS_PAPERS.find(
          ({ name }) => basename.endsWith(`-${name}`),
        );
        const expectedHeight =
          agentPassMillimetersToPixels(
            paper?.heightMm ?? AGENT_PASS_SIZE.heightMm,
            300,
          );
        const expectedWidth =
          agentPassMillimetersToPixels(
            paper?.widthMm ?? AGENT_PASS_SIZE.widthMm,
            300,
          );
        expect(details.height).toBe(expectedHeight);
        expect([expectedWidth, expectedWidth + 1]).toContain(
          details.width,
        );
        if (basename.endsWith("-front") && basename !== "shared-back") {
          const decoded = decodeAgentPassPngRgb(raster.png);
          const crop = cropRgbToRgba({
            cropHeight: 414,
            cropWidth: 354,
            height: decoded.height,
            pixels: decoded.pixels,
            width: decoded.width,
            x: 614,
            y: 94,
          });
          cropDigests.push(
            sha256Bytes(Buffer.from(crop)),
          );
        }
      } finally {
        await raster.remove();
      }
    }
    expect(cropDigests).toHaveLength(4);
    expect(new Set(cropDigests).size).toBe(4);
  }, 60_000);

  it("provides dimensioned raster previews for both paper sizes and sides", async () => {
    const expectations = [
      ["fronts-letter-preview.png", 1020, 1320],
      ["backs-letter-preview.png", 1020, 1320],
      ["fronts-a4-preview.png", 992, 1403],
      ["backs-a4-preview.png", 992, 1403],
    ] as const;
    for (const [file, width, height] of expectations) {
      const preview = await readFile(
        path.join(printDirectory, "previews", file),
      );
      expect(inspectAgentPassPhoto(preview)).toMatchObject({
        height,
        width,
      });
    }
  });

  it("verifies generated public, print, PDF, and preview artifacts without rewriting them", async () => {
    await expect(
      verifyAgentPassAssets({ root: generatedRoot }),
    ).resolves.toEqual({
      pdfCount: 9,
      previewCount: 4,
      printSvgCount: 9,
      publicSvgCount: 5,
    });
  });

  it("rejects stale or extra files in every public artifact directory", async () => {
    const extras = [
      path.join(publicDirectory, "stale.svg"),
      path.join(printDirectory, "stale.pdf"),
      path.join(
        printDirectory,
        "previews",
        "stale-preview.png",
      ),
    ];
    for (const extra of extras) {
      await writeFile(extra, "stale", "utf8");
      try {
        await expect(
          verifyAgentPassAssets({ root: generatedRoot }),
        ).rejects.toThrow("AGENT_PASS_ARTIFACT_SET_INVALID");
      } finally {
        await unlink(extra);
      }
    }
    await expect(
      verifyAgentPassAssets({ root: generatedRoot }),
    ).resolves.toBeDefined();
  });

  it("rejects swapped same-size PDFs and previews", async () => {
    const studyPdfPath = path.join(
      printDirectory,
      "study-front.pdf",
    );
    const sharedPdfPath = path.join(
      printDirectory,
      "shared-back.pdf",
    );
    const studyPdf = await readFile(studyPdfPath);
    const sharedPdf = await readFile(sharedPdfPath);
    try {
      await writeFile(studyPdfPath, sharedPdf);
      await expect(
        verifyAgentPassAssets({ root: generatedRoot }),
      ).rejects.toThrow("AGENT_PASS_PDF_SOURCE_INVALID");
    } finally {
      await writeFile(studyPdfPath, studyPdf);
    }

    const frontsPreviewPath = path.join(
      printDirectory,
      "previews/fronts-letter-preview.png",
    );
    const backsPreviewPath = path.join(
      printDirectory,
      "previews/backs-letter-preview.png",
    );
    const frontsPreview = await readFile(frontsPreviewPath);
    const backsPreview = await readFile(backsPreviewPath);
    try {
      await writeFile(frontsPreviewPath, backsPreview);
      await expect(
        verifyAgentPassAssets({ root: generatedRoot }),
      ).rejects.toThrow(
        "AGENT_PASS_PREVIEW_SOURCE_INVALID",
      );
    } finally {
      await writeFile(frontsPreviewPath, frontsPreview);
    }
    await expect(
      verifyAgentPassAssets({ root: generatedRoot }),
    ).resolves.toBeDefined();
  });

  it("rejects internally valid stale artifacts after a source-photo change", async () => {
    const photoPath = path.join(
      generatedRoot,
      "public/media/ygf-user-photo.png",
    );
    const photo = await readFile(photoPath);
    const staleSource = Buffer.from(photo);
    const idat = staleSource.indexOf(Buffer.from("IDAT"));
    expect(idat).toBeGreaterThan(0);
    staleSource[idat + 4] ^= 1;
    try {
      await writeFile(photoPath, staleSource);
      await expect(
        verifyAgentPassAssets({ root: generatedRoot }),
      ).rejects.toThrow("AGENT_PASS_PDF_SOURCE_INVALID");
    } finally {
      await writeFile(photoPath, photo);
    }
  });
});

describe("protected private Agent Pass fulfillment", () => {
  it("uses every canonical admin CSV row and pairs the same human code with the decoded redemption QR", async () => {
    const fixture = await createPrivateCsvFixture();
    const sourceHash = sha256(fixture.csv);
    const { stderr, stdout } =
      await runPrivateAgentPassCli(
        fixture.cwd,
        "agent-pass-batch",
      );
    expect(stderr).toBe("");
    expect(stdout).toBe(
      "Rendered 3 protected Agent Pass rows into 7 private files.\n",
    );
    const destination = path.join(
      fixture.cwd,
      "private/agent-pass-batch.html",
    );
    const [sourceAfter, html] = await Promise.all([
      readFile(fixture.source, "utf8"),
      readFile(destination, "utf8"),
    ]);
    const svgs = readEmbeddedAgentPassSvgs(html);
    expect(sha256(sourceAfter)).toBe(sourceHash);
    expect((await stat(destination)).mode & 0o777).toBe(
      0o600,
    );
    expect(html).toContain('data-duplex="long-edge"');
    expect(html).toContain("portrait, 100%, long-edge");
    expect(svgs).toHaveLength(fixture.codes.length);
    expect((await readdir(path.join(fixture.cwd, "private"))).sort()).toEqual(
      [
        "admin-download.csv",
        "agent-pass-batch-a4-duplex.pdf",
        "agent-pass-batch-a4-p001-back.svg",
        "agent-pass-batch-a4-p001-front.svg",
        "agent-pass-batch-letter-duplex.pdf",
        "agent-pass-batch-letter-p001-back.svg",
        "agent-pass-batch-letter-p001-front.svg",
        "agent-pass-batch.html",
      ],
    );

    svgs.forEach((svg, index) => {
      const code = fixture.codes[index];
      const expected =
        `https://build.ygf.example/redeem#code=${code}`;
      const { decoded, qr } = decodeQrFromSvg(svg);
      expect(svg).toContain('width="85.6mm"');
      expect(svg).toContain('height="54mm"');
      expect(svg).toContain(`>${code}<`);
      expect(svg).toContain(
        `data-row-reference="${fixture.rowReferences[index]}"`,
      );
      expect(svg).toContain(
        'data-agent-pass-steps="scratch-scan-start"',
      );
      expect(decodeXmlText(svg)).toContain(
        "1 刮开 / OPEN",
      );
      expect(decodeXmlText(svg)).toContain(
        "2 扫码或输入 / SCAN OR ENTER",
      );
      expect(decodeXmlText(svg)).toContain(
        "3 开始使用 / START USING",
      );
      expect(decodeXmlText(svg)).toContain(
        "刮开后请勿拍照分享",
      );
      expect(qr.quietZone).toBeGreaterThanOrEqual(4);
      expect(qr.url).toBe(expected);
      expect(decoded).toBe(expected);
    });

    const letter = AGENT_PASS_PAPERS.find(
      ({ name }) => name === "letter",
    );
    expect(letter).toBeDefined();
    if (!letter) {
      throw new Error("Letter paper is unavailable.");
    }
    const duplexPdf = path.join(
      fixture.cwd,
      "private/agent-pass-batch-letter-duplex.pdf",
    );
    const raster = await rasterizePdfPage({
      file: duplexPdf,
      page: 2,
    });
    try {
      const decodedPage = decodeAgentPassPngRgb(raster.png);
      const frontPosition = agentPassImpositionCardPosition(
        letter,
        0,
      );
      const backX =
        letter.widthMm -
        frontPosition.x -
        AGENT_PASS_SIZE.widthMm;
      const cropX = Math.floor(
        agentPassMillimetersToPixels(
          backX + 56.6 - 1,
          300,
        ),
      );
      const cropY = Math.floor(
        agentPassMillimetersToPixels(
          frontPosition.y + 9.1 - 1,
          300,
        ),
      );
      const cropSize = agentPassMillimetersToPixels(
        23.8 + 2,
        300,
      );
      const qrPixels = cropRgbToRgba({
        cropHeight: cropSize,
        cropWidth: cropSize,
        height: decodedPage.height,
        pixels: decodedPage.pixels,
        width: decodedPage.width,
        x: cropX,
        y: cropY,
      });
      expect(
        jsQR(qrPixels, cropSize, cropSize, {
          inversionAttempts: "attemptBoth",
        })?.data,
      ).toBe(
        `https://build.ygf.example/redeem#code=${fixture.codes[0]}`,
      );
    } finally {
      await raster.remove();
    }
  }, 60_000);

  it.each([1, 3, 8, 9])(
    "creates an exact atomic duplex bundle with reflected and blank slots for %i row(s)",
    async (rowCount) => {
      const fixture =
        await createPrivateCsvFixture(rowCount);
      const stem = `batch-${rowCount}`;
      const { stderr } = await runPrivateAgentPassCli(
        fixture.cwd,
        stem,
      );
      expect(stderr).toBe("");
      const pageCount = Math.ceil(rowCount / 8);
      expect(
        (
          await stat(
            path.join(fixture.cwd, "private"),
          )
        ).mode & 0o777,
      ).toBe(0o700);
      const expectedFiles = [
        "admin-download.csv",
        `${stem}.html`,
      ];
      for (const paper of AGENT_PASS_PAPERS) {
        for (
          let page = 1;
          page <= pageCount;
          page += 1
        ) {
          const pageLabel = String(page).padStart(3, "0");
          expectedFiles.push(
            `${stem}-${paper.name}-p${pageLabel}-front.svg`,
            `${stem}-${paper.name}-p${pageLabel}-back.svg`,
          );
        }
        expectedFiles.push(
          `${stem}-${paper.name}-duplex.pdf`,
        );
      }
      expect(
        (
          await readdir(
            path.join(fixture.cwd, "private"),
          )
        ).sort(),
      ).toEqual(expectedFiles.sort());
      for (const destination of expectedFiles
        .filter((file) => file !== "admin-download.csv")
        .map((file) =>
          path.join(fixture.cwd, "private", file),
        )) {
        expect((await stat(destination)).mode & 0o777).toBe(
          0o600,
        );
      }

      for (const paper of AGENT_PASS_PAPERS) {
        const structure = await inspectPdfStructureInChild(
          path.join(
            fixture.cwd,
            "private",
            `${stem}-${paper.name}-duplex.pdf`,
          ),
        );
        expect(structure.pageObjects).toBe(pageCount * 2);
        expect(structure.count).toBe(pageCount * 2);
        expect(new Set(structure.mediaBoxes)).toEqual(
          new Set([
            `0 0 ${Number(
            agentPassMillimetersToPoints(
              paper.widthMm,
            ).toFixed(4),
          )} ${Number(
            agentPassMillimetersToPoints(
              paper.heightMm,
            ).toFixed(4),
          )}`,
          ]),
        );
        expect(structure.forbidden).toBe(false);

        for (
          let pageIndex = 0;
          pageIndex < pageCount;
          pageIndex += 1
        ) {
          const pageLabel = String(pageIndex + 1).padStart(
            3,
            "0",
          );
          const [frontSvg, backSvg] = await Promise.all([
            readFile(
              path.join(
                fixture.cwd,
                "private",
                `${stem}-${paper.name}-p${pageLabel}-front.svg`,
              ),
              "utf8",
            ),
            readFile(
              path.join(
                fixture.cwd,
                "private",
                `${stem}-${paper.name}-p${pageLabel}-back.svg`,
              ),
              "utf8",
            ),
          ]);
          for (const [svg, side] of [
            [frontSvg, "front"],
            [backSvg, "back"],
          ] as const) {
            expect(svg).toContain(
              `width="${paper.widthMm}mm"`,
            );
            expect(svg).toContain(
              `height="${paper.heightMm}mm"`,
            );
            expect(svg).toContain(
              `data-page="${pageIndex + 1}" data-side="${side}" data-duplex="long-edge"`,
            );
          }

          for (
            let localIndex = 0;
            localIndex < 8;
            localIndex += 1
          ) {
            const occupied =
              pageIndex * 8 + localIndex < rowCount;
            const frontPosition =
              agentPassImpositionCardPosition(
                paper,
                localIndex,
              );
            const reflectedX =
              paper.widthMm -
              frontPosition.x -
              AGENT_PASS_SIZE.widthMm;
            const frontTag = groupTagForSourceIndex(
              frontSvg,
              localIndex,
            );
            const backTag = groupTagForSourceIndex(
              backSvg,
              localIndex,
            );
            expect(frontTag).toContain(
              `data-agent-pass-slot="${localIndex + 1}"`,
            );
            expect(backTag).toContain(
              `data-agent-pass-slot="${(localIndex ^ 1) + 1}"`,
            );
            expect(frontTag).toContain(
              `data-x-mm="${Number(
                frontPosition.x.toFixed(4),
              )}"`,
            );
            expect(backTag).toContain(
              `data-x-mm="${Number(
                reflectedX.toFixed(4),
              )}"`,
            );
            expect(backTag).toContain(
              `data-y-mm="${Number(
                frontPosition.y.toFixed(4),
              )}"`,
            );
            expect(frontTag).toContain(
              `data-blank="${occupied ? "false" : "true"}"`,
            );
            expect(backTag).toContain(
              `data-blank="${occupied ? "false" : "true"}"`,
            );
          }
        }
      }
    },
    120_000,
  );

  it("allows only direct ignored private CSV and HTML destinations", async () => {
    const fixture = await createPrivateCsvFixture();
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: fixture.cwd,
        input: "nested/private/admin-download.csv",
        out: "private/batch.html",
      }),
    ).rejects.toThrow("PRIVATE_AGENT_PASS_PATH_REQUIRED");
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: fixture.cwd,
        input: "private/admin-download.csv",
        out: "../batch.html",
      }),
    ).rejects.toThrow("PRIVATE_AGENT_PASS_PATH_REQUIRED");

    const missingIgnoreRoot = await mkdtemp(
      path.join(tmpdir(), "ygf-agent-pass-not-ignored-"),
    );
    await execFileAsync("git", ["init", "--quiet"], {
      cwd: missingIgnoreRoot,
    });
    const missingIgnorePrivate = path.join(
      missingIgnoreRoot,
      "private",
    );
    await mkdir(missingIgnorePrivate, { mode: 0o700 });
    await writeFile(
      path.join(missingIgnorePrivate, "admin.csv"),
      fixture.csv,
      { mode: 0o600 },
    );
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: missingIgnoreRoot,
        input: "private/admin.csv",
        out: "private/batch.html",
      }),
    ).rejects.toThrow("PRIVATE_AGENT_PASS_PATH_REQUIRED");

    const negatedFixture = await createPrivateCsvFixture();
    await writeFile(
      path.join(negatedFixture.cwd, ".gitignore"),
      "private/*\n!private/*.html\n",
    );
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: negatedFixture.cwd,
        input: "private/admin-download.csv",
        out: "private/exposed.html",
      }),
    ).rejects.toThrow("PRIVATE_AGENT_PASS_PATH_REQUIRED");

    const trackedFixture = await createPrivateCsvFixture();
    const trackedDestination = path.join(
      trackedFixture.cwd,
      "private/tracked.html",
    );
    await writeFile(trackedDestination, "tracked", {
      mode: 0o600,
    });
    await execFileAsync(
      "git",
      ["add", "-f", "private/tracked.html"],
      { cwd: trackedFixture.cwd },
    );
    await unlink(trackedDestination);
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: trackedFixture.cwd,
        input: "private/admin-download.csv",
        out: "private/tracked.html",
      }),
    ).rejects.toThrow("PRIVATE_AGENT_PASS_PATH_REQUIRED");
  });

  it("publishes with no overwrite and preserves an existing destination byte-for-byte", async () => {
    const fixture = await createPrivateCsvFixture();
    const destination = path.join(
      fixture.cwd,
      "private/existing.html",
    );
    await writeFile(destination, "existing", { mode: 0o600 });
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: fixture.cwd,
        input: "private/admin-download.csv",
        out: "private/existing.html",
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(destination, "utf8")).toBe("existing");
    expect(
      (await readdir(path.dirname(destination))).some((file) =>
        file.endsWith(".tmp"),
      ),
    ).toBe(false);
  });

  it("preflights every derived destination and rolls back only its own files after a publish race", async () => {
    const preflightFixture =
      await createPrivateCsvFixture(1);
    const preflightConflict = path.join(
      preflightFixture.cwd,
      "private/preflight-letter-p001-back.svg",
    );
    await writeFile(preflightConflict, "existing", {
      mode: 0o600,
    });
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: preflightFixture.cwd,
        input: "private/admin-download.csv",
        out: "private/preflight.html",
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(
      (
        await readdir(
          path.join(preflightFixture.cwd, "private"),
        )
      ).sort(),
    ).toEqual([
      "admin-download.csv",
      "preflight-letter-p001-back.svg",
    ]);
    expect(
      await readFile(preflightConflict, "utf8"),
    ).toBe("existing");

    const raceFixture = await createPrivateCsvFixture(1);
    const raceConflict = path.join(
      raceFixture.cwd,
      "private/race-a4-duplex.pdf",
    );
    const privateModuleUrl =
      pathToFileURL(rendererPath).href;
    await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          `const renderer = await import(${JSON.stringify(privateModuleUrl)});`,
          'const fs = await import("node:fs/promises");',
          "let conflict = false;",
          "try {",
          '  await renderer.writePrivateAgentPassBatchFromCsv({ cwd: process.argv[1], input: "private/admin-download.csv", out: "private/race.html" }, { beforePublish: () => fs.writeFile(process.argv[2], "raced", { mode: 0o600 }) });',
          "} catch (error) {",
          '  if (error && error.code === "EEXIST") conflict = true; else throw error;',
          "}",
          'if (!conflict) throw new Error("EXPECTED_PRIVATE_CONFLICT");',
        ].join("\n"),
        raceFixture.cwd,
        raceConflict,
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );
    expect(
      (
        await readdir(
          path.join(raceFixture.cwd, "private"),
        )
      ).sort(),
    ).toEqual([
      "admin-download.csv",
      "race-a4-duplex.pdf",
    ]);
    expect(await readFile(raceConflict, "utf8")).toBe(
      "raced",
    );
  }, 60_000);

  it("rejects symlinked and oversized private input plus more than 3,000 rows before rendering", async () => {
    const symlinkFixture =
      await createPrivateCsvFixture(1);
    const original = path.join(
      symlinkFixture.cwd,
      "private/original.csv",
    );
    await writeFile(original, symlinkFixture.csv, {
      mode: 0o600,
    });
    await unlink(symlinkFixture.source);
    await symlink(
      original,
      symlinkFixture.source,
    );
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: symlinkFixture.cwd,
        input: "private/admin-download.csv",
        out: "private/symlink.html",
      }),
    ).rejects.toThrow("PRIVATE_AGENT_PASS_CSV_INVALID");

    const oversizedFixture =
      await createPrivateCsvFixture(1);
    await writeFile(
      oversizedFixture.source,
      Buffer.alloc(2 * 1024 * 1024 + 1, 0x41),
      { mode: 0o600 },
    );
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: oversizedFixture.cwd,
        input: "private/admin-download.csv",
        out: "private/oversized.html",
      }),
    ).rejects.toThrow("PRIVATE_AGENT_PASS_CSV_INVALID");

    const tooManyRowsFixture =
      await createPrivateCsvFixture(1);
    const tooManyRows = Array.from(
      { length: 3_001 },
      (_value, index) => {
        const code = deterministicCode(index + 1);
        const rowReference =
          `YGF-22222222-${String(index + 1).padStart(4, "0")}`;
        const claimUrl =
          `https://build.ygf.example/redeem#code=${code}`;
        return `"${rowReference}","${code}","${claimUrl}"`;
      },
    );
    await writeFile(
      tooManyRowsFixture.source,
      [
        "row_reference,code,claim_url",
        ...tooManyRows,
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    await expect(
      writePrivateAgentPassBatchFromCsv({
        cwd: tooManyRowsFixture.cwd,
        input: "private/admin-download.csv",
        out: "private/too-many.html",
      }),
    ).rejects.toThrow("PRIVATE_AGENT_PASS_CSV_INVALID");
  }, 60_000);

  it("keeps every claim, URL, and row reference out of CLI stdout and stderr", async () => {
    const fixture = await createPrivateCsvFixture();
    const { stderr, stdout } = await execFileAsync(
      process.execPath,
      [
        rendererPath,
        "--input",
        "private/admin-download.csv",
        "--out",
        "private/cli-batch.html",
      ],
      {
        cwd: fixture.cwd,
        encoding: "utf8",
      },
    );
    expect(stdout).toBe(
      "Rendered 3 protected Agent Pass rows into 7 private files.\n",
    );
    for (const secret of [
      ...fixture.codes,
      ...fixture.rowReferences,
      "/redeem#code=",
      "build.ygf.example",
    ]) {
      expect(`${stdout}\n${stderr}`).not.toContain(secret);
    }
    expect(
      (
        await stat(
          path.join(fixture.cwd, "private/cli-batch.html"),
        )
      ).mode & 0o777,
    ).toBe(0o600);
  }, 60_000);
});
