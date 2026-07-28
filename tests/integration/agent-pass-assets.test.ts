// @vitest-environment node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import jsQR from "jsqr";
import { beforeAll, describe, expect, it } from "vitest";

import {
  generatePrivateRowReferences,
  serializePrivateCodeCsv,
} from "@/lib/admin/code-batch";
// @ts-expect-error -- Vitest resolves the executable .mts module.
import { AGENT_PASS_COPY, AGENT_PASS_SIZE, AGENT_PASS_VARIANTS, inspectAgentPassPhoto, renderAgentPassAssets, verifyAgentPassAssets } from "@/scripts/render-agent-pass-assets.mts";
// @ts-expect-error -- Vitest resolves the executable .mts module.
import { writePrivateAgentPassBatchFromCsv } from "@/scripts/render-private-agent-pass-batch.mts";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const rendererPath = path.join(
  repositoryRoot,
  "scripts/render-private-agent-pass-batch.mts",
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
    /<g data-qr-url="([^"]+)" data-qr-modules="(\d+)" data-qr-quiet-zone="(\d+)">([\s\S]*?)<\/g>/,
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

async function createPrivateCsvFixture() {
  const cwd = await mkdtemp(
    path.join(tmpdir(), "ygf-agent-pass-private-"),
  );
  const privateDirectory = path.join(cwd, "private");
  await writeFile(path.join(cwd, ".gitignore"), "private/\n");
  await execFileAsync("git", ["init", "--quiet"], { cwd });
  await mkdir(privateDirectory, { mode: 0o700 });
  await chmod(privateDirectory, 0o700);
  const codes = ["23456789", "ABCDEFGH", "JKMNPQRS"];
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
  await renderAgentPassAssets({ root: generatedRoot });
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
        `transform="translate(${{
          xMaxYMid: 136,
          xMidYMid: 259,
          xMinYMid: 382,
        }[variant.crop]} 0) scale(0.45)"`,
      );
      expect(svg).not.toContain(
        `preserveAspectRatio="${variant.crop} slice"`,
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

  it("writes exact card, Letter, and A4 PDF page boxes", async () => {
    const expectations = [
      {
        file: "study-front.pdf",
        mediaBox: "/MediaBox [0 0 242.6457 153.0709]",
      },
      {
        file: "fronts-letter.pdf",
        mediaBox: "/MediaBox [0 0 612 792]",
      },
      {
        file: "backs-a4.pdf",
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
      expect(searchable).toContain("/Subtype /Type0");
      expect(searchable).toContain(
        "/Encoding /UniGB-UCS2-H",
      );
      expect(searchable.match(/\sTj/g)?.length).toBeGreaterThan(
        5,
      );
    }
  });

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
    const result = await writePrivateAgentPassBatchFromCsv({
      cwd: fixture.cwd,
      input: "private/admin-download.csv",
      out: "private/agent-pass-batch.html",
    });
    const [sourceAfter, html] = await Promise.all([
      readFile(fixture.source, "utf8"),
      readFile(result.destination, "utf8"),
    ]);
    const svgs = readEmbeddedAgentPassSvgs(html);
    expect(result.rowCount).toBe(fixture.codes.length);
    expect(sha256(sourceAfter)).toBe(sourceHash);
    expect((await stat(result.destination)).mode & 0o777).toBe(
      0o600,
    );
    expect(html).toContain("size: letter portrait");
    expect(html).toContain("margin: 16.7mm 17.35mm");
    expect(html).toContain("gap: 10mm");
    expect(html).toContain('class="cut-mark tl-h"');
    expect(svgs).toHaveLength(fixture.codes.length);

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
  });

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
    expect(stdout).toBe("Rendered 3 protected Agent Pass backs.\n");
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
  });
});
