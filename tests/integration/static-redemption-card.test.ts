// @vitest-environment node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import {
  decodeAgentPassPngRgb,
  // @ts-expect-error -- Vitest resolves the executable .mts module.
} from "@/scripts/render-agent-pass-assets.mts";

const repositoryRoot = process.cwd();
const outputRoot = path.join(repositoryRoot, "output/redemption-card");
const pdfRoot = path.join(repositoryRoot, "output/pdf");

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function customerTextSizes(svg: string): readonly number[] {
  const textTags = [...svg.matchAll(/<text\b[^>]*>/g)].map(
    (match) => match[0],
  );
  const customerTags = textTags.filter((tag) =>
    tag.includes('data-customer-copy="true"'),
  );
  expect(customerTags).toHaveLength(textTags.length);
  return customerTags.map((tag) =>
    Number(tag.match(/font-size="([\d.]+)"/)?.[1]),
  );
}

function decodeQr(png: Buffer): string | undefined {
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
  return jsQR(rgba, decoded.width, decoded.height)?.data;
}

describe("static redemption card print contract", () => {
  it("binds every public output to a manifest with exact trim and safe layout", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(outputRoot, "manifest.json"), "utf8"),
    ) as {
      controls: {
        concealmentLayer: boolean;
        liveCodesCommitted: boolean;
      };
      design: {
        bleedInches: readonly number[];
        minimumActionTextPoints: number;
        minimumCustomerTextPoints: number;
        safeInsetInches: number;
        staticQr: string;
        trimInches: readonly number[];
        label: {
          sizeInches: readonly number[];
          trimClearanceInches: Record<string, number>;
        };
        qr: {
          quietZoneModules: number;
        };
      };
      files: Record<string, string>;
    };

    expect(manifest.design).toMatchObject({
      bleedInches: [3.75, 2.25],
      minimumActionTextPoints: 7,
      minimumCustomerTextPoints: 6,
      safeInsetInches: 0.125,
      staticQr: "https://malatangai.com/redeem",
      trimInches: [3.5, 2],
    });
    expect(manifest.design.label.sizeInches).toEqual([2.625, 1]);
    expect(manifest.design.qr.quietZoneModules).toBe(4);
    for (const clearance of Object.values(
      manifest.design.label.trimClearanceInches,
    )) {
      expect(clearance).toBeGreaterThanOrEqual(0.125);
    }
    expect(manifest.controls).toMatchObject({
      concealmentLayer: false,
      liveCodesCommitted: false,
    });
    for (const [relativePath, expectedHash] of Object.entries(
      manifest.files,
    )) {
      expect(
        sha256(await readFile(path.join(repositoryRoot, relativePath))),
      ).toBe(expectedHash);
    }
  });

  it("keeps every visible card and sample-label text at six physical points or larger", async () => {
    const [front, back, label] = await Promise.all([
      readFile(path.join(outputRoot, "ygf-redemption-card-front.svg"), "utf8"),
      readFile(path.join(outputRoot, "ygf-redemption-card-back.svg"), "utf8"),
      readFile(path.join(outputRoot, "ygf-redemption-code-label-sample.svg"), "utf8"),
    ]);
    const all = `${front}\n${back}\n${label}`;
    const sizes = [
      ...customerTextSizes(front),
      ...customerTextSizes(back),
      ...customerTextSizes(label),
    ];

    expect(Math.min(...sizes) * 72 / 300).toBeGreaterThanOrEqual(6);
    const actionSizes = [...all.matchAll(/<text\b[^>]*data-action-copy="true"[^>]*>/g)]
      .map((match) => Number(match[0].match(/font-size="([\d.]+)"/)?.[1]));
    expect(actionSizes).not.toHaveLength(0);
    expect(Math.min(...actionSizes) * 72 / 300).toBeGreaterThanOrEqual(7);
    expect(front).toContain("ygf-authentic-hero-mobile-card.png");
    expect(front).toContain("ygf-official-logo.png");
    expect(front).toContain("吃一碗。");
    expect(front).toContain("BUY A BOWL. BUILD WITH AI.");
    expect(back).toContain('data-static-redeem-url="https://malatangai.com/redeem"');
    expect(back).toContain('data-qr-quiet-zone="4"');
    expect(back).toContain('data-label-width-in="2.625"');
    expect(back).toContain('data-label-height-in="1"');
    expect(back).toContain('data-label-y-px="300"');
    expect(back).toContain('width="787.5" height="300"');
    expect(label).toContain('data-borderless="true"');
    expect(label).toContain('data-content-inset-in="0.0625"');
    expect(label).not.toContain("stroke-width");
    expect(all).not.toMatch(/scratch|刮开|刮刮/i);
  });

  it("writes full-bleed PDF pages with a centered trim box and a decodable static QR", async () => {
    const [front, back, duplex, backPng] = await Promise.all([
      readFile(path.join(pdfRoot, "ygf-redemption-card-front.pdf")),
      readFile(path.join(pdfRoot, "ygf-redemption-card-back.pdf")),
      readFile(path.join(pdfRoot, "ygf-redemption-card-duplex.pdf")),
      readFile(path.join(outputRoot, "ygf-redemption-card-back.png")),
    ]);
    for (const [pdf, expectedPages] of [
      [front, 1],
      [back, 1],
      [duplex, 2],
    ] as const) {
      const searchable = pdf.toString("latin1");
      expect(searchable.match(/\/Type \/Page\b/g)).toHaveLength(expectedPages);
      expect(searchable.match(/\/MediaBox \[0 0 270 162\]/g)).toHaveLength(expectedPages);
      expect(searchable.match(/\/BleedBox \[0 0 270 162\]/g)).toHaveLength(expectedPages);
      expect(searchable.match(/\/TrimBox \[9 9 261 153\]/g)).toHaveLength(expectedPages);
    }
    expect(decodeQr(backPng)).toBe("https://malatangai.com/redeem");
  });
});
