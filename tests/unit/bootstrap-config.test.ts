import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { metadata } from "@/app/layout";
import { metadata as homeMetadata } from "@/app/(marketing)/page";
import nextConfig from "@/next.config";

const repositoryRoot = process.cwd();

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")) as {
    compilerOptions?: Record<string, unknown>;
    scripts?: Record<string, string>;
  };
}

function readCssToken(css: string, token: string) {
  const match = css.match(
    new RegExp(`--${token}:\\s*(#[0-9a-f]{6})\\s*;`, "i"),
  );

  if (!match?.[1]) {
    throw new Error(`Missing CSS token: ${token}`);
  }

  return match[1];
}

function readQuotedArray(source: string, property: string) {
  const match = source.match(
    new RegExp(`${property}:\\s*\\[([\\s\\S]*?)\\]`),
  );

  if (!match?.[1]) {
    return [];
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map(
    (value) => value[1],
  );
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );

  return (lighter + 0.05) / (darker + 0.05);
}

describe("bootstrap configuration", () => {
  it("keeps Vitest and Playwright discovery separate", () => {
    const config = readFileSync(
      resolve(repositoryRoot, "vitest.config.ts"),
      "utf8",
    );
    const packageJson = readJson("package.json");

    expect(readQuotedArray(config, "include")).toEqual([
      "tests/{unit,integration}/**/*.{test,spec}.{ts,tsx}",
    ]);
    expect(readQuotedArray(config, "exclude")).toContain("tests/e2e/**");
    expect(packageJson.scripts?.["test:e2e"]).toBe("playwright test");
  });

  it("uses the stable Next.js JSX configuration and generated declarations", () => {
    const tsconfig = readJson("tsconfig.json");
    const nextEnvPath = resolve(repositoryRoot, "next-env.d.ts");

    expect(tsconfig.compilerOptions?.jsx).toBe("react-jsx");
    expect(existsSync(nextEnvPath)).toBe(true);

    if (existsSync(nextEnvPath)) {
      const nextEnv = readFileSync(nextEnvPath, "utf8");
      expect(nextEnv).toContain('/// <reference types="next" />');
      expect(nextEnv).toContain(
        '/// <reference types="next/image-types/global" />',
      );
      expect(nextEnv).toContain('import "./.next/types/routes.d.ts";');
    }
  });

  it("keeps every public route on the apex production origin", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      destination: "https://malatangai.com/:path*",
      has: [{ type: "host", value: "www.malatangai.com" }],
      permanent: true,
      source: "/:path*",
    });
    expect(metadata.metadataBase?.toString()).toBe("https://malatangai.com/");
    expect(metadata.alternates).toBeUndefined();
    expect(homeMetadata.alternates?.canonical).toBe("/");
  });

  it("uses a focus token with at least 3:1 contrast on campaign surfaces", () => {
    const css = readFileSync(
      resolve(repositoryRoot, "app/globals.css"),
      "utf8",
    );
    const focusColor = readCssToken(css, "color-success");

    expect(css).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-success\)/,
    );
    expect(contrastRatio(focusColor, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(focusColor, "#fff8f1")).toBeGreaterThanOrEqual(3);
  });
});
