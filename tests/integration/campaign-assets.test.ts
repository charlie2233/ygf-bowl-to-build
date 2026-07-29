import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import jsQR from "jsqr";
import { beforeAll, describe, expect, it } from "vitest";

// @ts-expect-error -- Vitest resolves the executable .mts module; the app
// project intentionally does not enable TypeScript-extension imports globally.
import { renderCampaignAssets, renderPrivateClaimRowSvg, verifyCampaignAssetOrigin } from "@/scripts/render-campaign-assets.mts";

const repositoryRoot = process.cwd();
const expectedOrigin =
  process.env.YGF_ASSET_ORIGIN ?? "https://build.ygf.example";
let generatedRoot = "";
let campaignDirectory = "";
let pdfDirectory = "";

const variants = [
  {
    file: "poster-24x36.svg",
    height: "36in",
    source: "poster-24x36",
    width: "24in",
  },
  {
    file: "poster-11x17.svg",
    height: "17in",
    source: "poster-11x17",
    width: "11in",
  },
  {
    file: "counter-card-5x7.svg",
    height: "7in",
    source: "counter-card-5x7",
    width: "5in",
  },
  {
    file: "social-feed-1080x1350.svg",
    height: "1350",
    source: "social-feed-1080x1350",
    width: "1080",
  },
  {
    file: "social-story-1080x1920.svg",
    height: "1920",
    source: "social-story-1080x1920",
    width: "1080",
  },
  {
    file: "social-horizontal-1200x628.svg",
    height: "628",
    source: "social-horizontal-1200x628",
    width: "1200",
  },
] as const;

const finePrint =
  "Limited-time YGF promotional Build Credits. Qualifying purchase required. One redemption per person/account. Non-transferable. No cash value. Expires 14 days after redemption. Eligible AI tasks only. Terms and privacy apply.";
const universityDisclaimer =
  "This promotion is offered by YGF for the USC community and is not sponsored, endorsed by, or administered by the University of Southern California.";

function decodeXmlText(svg: string) {
  return svg
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

function readQrGeometry(svg: string) {
  const group = svg.match(
    /<g data-qr-url="([^"]+)" data-qr-modules="(\d+)" data-qr-quiet-zone="(\d+)">([\s\S]*?)<\/g>/,
  );

  if (!group) {
    throw new Error("Campaign asset is missing machine-readable QR geometry.");
  }

  const [, encodedUrl, moduleCountText, quietZoneText, body] = group;
  const moduleCount = Number(moduleCountText);
  const quietZone = Number(quietZoneText);
  const modules = [...body.matchAll(
    /<rect class="qr-module" x="(\d+)" y="(\d+)" width="1" height="1"\/>/g,
  )].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));

  return {
    moduleCount,
    modules,
    quietZone,
    url: encodedUrl.replaceAll("&amp;", "&"),
  };
}

function decodeQrFromSvg(svg: string) {
  const qr = readQrGeometry(svg);
  const scale = 8;
  const imageModules = qr.moduleCount + qr.quietZone * 2;
  const width = imageModules * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  pixels.fill(255);

  for (const qrModule of qr.modules) {
    for (let offsetY = 0; offsetY < scale; offsetY += 1) {
      for (let offsetX = 0; offsetX < scale; offsetX += 1) {
        const x = qrModule.x * scale + offsetX;
        const y = qrModule.y * scale + offsetY;
        const index = (y * width + x) * 4;
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

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

beforeAll(async () => {
  generatedRoot = await mkdtemp(
    path.join(tmpdir(), "ygf-campaign-assets-"),
  );
  const mediaDirectory = path.join(
    generatedRoot,
    "public/media",
  );
  await mkdir(mediaDirectory, { recursive: true });
  await copyFile(
    path.join(repositoryRoot, "public/media/malatang-hero.png"),
    path.join(mediaDirectory, "malatang-hero.png"),
  );
  await renderCampaignAssets({
    origin: expectedOrigin,
    root: generatedRoot,
  });
  campaignDirectory = path.join(
    generatedRoot,
    "public/campaign",
  );
  pdfDirectory = path.join(generatedRoot, "output/pdf");
});

describe("campaign asset renderer", () => {
  it("generates exactly the six tokenized SVG variants", async () => {
    const generated = (await readdir(campaignDirectory))
      .filter((name) => name.endsWith(".svg"))
      .sort();

    expect(generated).toEqual(
      variants.map(({ file }) => file).sort(),
    );
  });

  it.each(variants)(
    "renders $file at its required size with approved copy and vector content",
    async ({ file, height, width }) => {
      const svg = await readFile(
        path.join(campaignDirectory, file),
        "utf8",
      );
      const text = decodeXmlText(svg);

      expect(svg).toContain(`width="${width}"`);
      expect(svg).toContain(`height="${height}"`);
      expect(text).toContain("Buy a bowl. Build with AI.");
      expect(text).toContain(
        "Spend $25+ at YGF and unlock limited Build Credits for study help, coding help, career tasks, and smarter bowl picks.",
      );
      expect(text).toContain(finePrint);
      expect(text).toContain(universityDisclaimer);
      expect(text).toContain(
        "For the USC community. Not affiliated with or endorsed by USC.",
      );
      expect(svg).toContain('href="../media/malatang-hero.png"');
      expect(svg.match(/data-use-case=/g)).toHaveLength(4);
      expect(svg).not.toMatch(/<foreignObject|<canvas|data:image\/svg\+xml/i);
    },
  );

  it.each(variants)(
    "decodes the exact $file QR modules to the public offer source",
    async ({ file, source }) => {
      const svg = await readFile(
        path.join(campaignDirectory, file),
        "utf8",
      );
      const { decoded, qr } = decodeQrFromSvg(svg);
      const expectedUrl = new URL("/offer", expectedOrigin);
      expectedUrl.searchParams.set("utm_source", source);
      const expected = expectedUrl.toString();

      expect(qr.quietZone).toBeGreaterThanOrEqual(4);
      expect(Math.min(...qr.modules.map(({ x }) => x))).toBe(
        qr.quietZone,
      );
      expect(Math.min(...qr.modules.map(({ y }) => y))).toBe(
        qr.quietZone,
      );
      expect(qr.url).toBe(expected);
      expect(decoded).toBe(expected);
    },
  );

  it("writes deterministic, correctly sized print PDFs", async () => {
    const expectations = [
      {
        file: "ygf-poster-24x36.pdf",
        mediaBox: "/MediaBox [0 0 1728 2592]",
      },
      {
        file: "ygf-counter-card-5x7.pdf",
        mediaBox: "/MediaBox [0 0 360 504]",
      },
    ] as const;
    const firstRun = new Map<string, string>();

    for (const { file, mediaBox } of expectations) {
      const pdf = await readFile(path.join(pdfDirectory, file));
      const searchable = pdf.toString("latin1");

      expect(searchable.startsWith("%PDF-1.4")).toBe(true);
      expect(searchable).toContain(mediaBox);
      expect(searchable).toContain("Buy a bowl. Build with AI.");
      expect(searchable).toContain("Limited-time YGF promotional Build Credits.");
      expect(searchable).toContain("/Subtype /Image");
      firstRun.set(file, sha256(pdf));
    }

    await renderCampaignAssets({
      origin: expectedOrigin,
      root: generatedRoot,
    });

    for (const { file } of expectations) {
      expect(
        sha256(await readFile(path.join(pdfDirectory, file))),
      ).toBe(firstRun.get(file));
    }
  });

  it("verifies an existing reviewed-origin asset set without rewriting it", async () => {
    const generatedAssetPaths = [
      ...variants.map(({ file }) =>
        path.join(campaignDirectory, file),
      ),
      path.join(pdfDirectory, "ygf-poster-24x36.pdf"),
      path.join(pdfDirectory, "ygf-counter-card-5x7.pdf"),
    ];
    const preservedTimestamp = new Date("2001-02-03T04:05:06.000Z");
    await Promise.all(
      generatedAssetPaths.map((file) =>
        utimes(file, preservedTimestamp, preservedTimestamp),
      ),
    );
    const generatedBefore = new Map(
      await Promise.all(
        generatedAssetPaths.map(async (file) => [
          file,
          {
            bytes: await readFile(file),
            modifiedAt: (await stat(file)).mtimeMs,
          },
        ] as const),
      ),
    );
    const repositoryAsset = path.join(
      repositoryRoot,
      "public/campaign",
      variants[0].file,
    );
    const repositoryBefore = await readFile(repositoryAsset);

    await expect(
      verifyCampaignAssetOrigin({
        origin: expectedOrigin,
        root: generatedRoot,
      }),
    ).resolves.toEqual({
      pdfCount: 2,
      svgCount: variants.length,
    });
    for (const [file, before] of generatedBefore) {
      expect((await readFile(file)).equals(before.bytes)).toBe(true);
      expect((await stat(file)).mtimeMs).toBe(before.modifiedAt);
    }
    expect(await readFile(repositoryAsset)).toEqual(
      repositoryBefore,
    );
    await expect(
      verifyCampaignAssetOrigin({
        origin: "https://wrong-origin.example",
        root: generatedRoot,
      }),
    ).rejects.toThrow("does not use the reviewed origin");
  });

  it("rejects a module-only SVG substitution with reviewed-origin markers intact", async () => {
    const assetPath = path.join(
      campaignDirectory,
      variants[0].file,
    );
    const reviewed = await readFile(assetPath);
    const svg = reviewed.toString("utf8");
    const substituted = svg.replace(
      /<rect class="qr-module" x="\d+" y="\d+" width="1" height="1"\/>/,
      "",
    );

    expect(substituted).not.toBe(svg);
    expect(substituted).toContain(
      `data-public-qr="${expectedOrigin}/offer?utm_source=poster-24x36"`,
    );
    expect(substituted).toContain(
      `data-qr-url="${expectedOrigin}/offer?utm_source=poster-24x36"`,
    );

    try {
      await writeFile(assetPath, substituted, "utf8");
      await expect(
        verifyCampaignAssetOrigin({
          origin: expectedOrigin,
          root: generatedRoot,
        }),
      ).rejects.toThrow("reviewed-origin exact deterministic render");
    } finally {
      await writeFile(assetPath, reviewed);
    }
  });

  it("rejects a valid PDF rendered for an alternate origin", async () => {
    const alternateRoot = await mkdtemp(
      path.join(tmpdir(), "ygf-campaign-assets-alternate-"),
    );
    const alternateMediaDirectory = path.join(
      alternateRoot,
      "public/media",
    );
    await mkdir(alternateMediaDirectory, { recursive: true });
    await copyFile(
      path.join(repositoryRoot, "public/media/malatang-hero.png"),
      path.join(alternateMediaDirectory, "malatang-hero.png"),
    );
    await renderCampaignAssets({
      origin: "https://alternate-origin.example",
      root: alternateRoot,
    });

    const file = "ygf-poster-24x36.pdf";
    const assetPath = path.join(pdfDirectory, file);
    const reviewed = await readFile(assetPath);
    const alternate = await readFile(
      path.join(alternateRoot, "output/pdf", file),
    );

    expect(alternate.subarray(0, 8)).toEqual(
      Buffer.from("%PDF-1.4"),
    );
    expect(alternate.equals(reviewed)).toBe(false);

    try {
      await writeFile(assetPath, alternate);
      await expect(
        verifyCampaignAssetOrigin({
          origin: expectedOrigin,
          root: generatedRoot,
        }),
      ).rejects.toThrow("reviewed-origin exact deterministic render");
    } finally {
      await writeFile(assetPath, reviewed);
    }
  });

  it("renders a print-ready private claim row whose text and QR carry the same code", () => {
    const code = "23456789";
    const claimUrl =
      `https://build.ygf.example/redeem#code=${code}`;
    const claimRow = renderPrivateClaimRowSvg({
      claimUrl,
      code,
      rowReference: "YGF-JKMNPQRS-0001",
    });
    const { decoded, qr } = decodeQrFromSvg(claimRow);

    expect(claimRow).toContain('data-private-claim="true"');
    expect(claimRow).toContain('width="3.5in"');
    expect(decodeXmlText(claimRow)).toContain(code);
    expect(qr.quietZone).toBeGreaterThanOrEqual(4);
    expect(qr.url).toBe(claimUrl);
    expect(decoded).toBe(claimUrl);
    expect(claimRow).not.toContain("utm_source");
    expect(() =>
      renderPrivateClaimRowSvg({
        claimUrl:
          "https://build.ygf.example/redeem#code=ABCDEFGH",
        code,
        rowReference: "YGF-JKMNPQRS-0001",
      }),
    ).toThrow("PRIVATE_CLAIM_URL_INVALID");
  });
});

describe("campaign operations pack", () => {
  it("documents staff handoff, recovery, soft testing, launch gates, and design fidelity", async () => {
    const documents = await Promise.all(
      [
        "docs/operations/staff-sop.md",
        "docs/operations/code-recovery-and-reissue.md",
        "docs/operations/launch-checklist.md",
        "docs/operations/soft-test-script.md",
        "docs/design/design-system.md",
        "docs/design/fidelity-ledger.md",
      ].map((file) => readFile(path.join(repositoryRoot, file), "utf8")),
    );
    const corpus = documents.join("\n").toLowerCase();

    for (const requiredPhrase of [
      "$25+",
      "human-readable code",
      "public campaign qr",
      "private claim qr",
      "invalid",
      "already used",
      "expired",
      "manager-only",
      "privacy-safe",
      "10-20",
      "rollback",
      "menu and prices",
      "rights-cleared real ygf food photo",
      "external account",
    ]) {
      expect(corpus).toContain(requiredPhrase);
    }
  });
});
