import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("campaign motion contract", () => {
  it("uses the locally bundled GSAP React and ScrollTrigger implementation", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
    };
    const source = readFileSync(
      resolve(
        repositoryRoot,
        "components/marketing/campaign-motion-experience.tsx",
      ),
      "utf8",
    );

    expect(packageJson.dependencies?.gsap).toBe("^3.15.0");
    expect(packageJson.dependencies?.["@gsap/react"]).toBe("^2.1.2");
    expect(source).toContain('from "@gsap/react"');
    expect(source).toContain('from "gsap/ScrollTrigger"');
    expect(source).toContain("gsap.quickTo");
    expect(source).toContain("gsap.matchMedia");
    expect(source).toContain("gsap.set(heroHeadlineLines");
    expect(source).toContain("gsap.set(children");
    expect(source).not.toContain(".fromTo(");
    expect(source).not.toContain("IntersectionObserver");
    expect(source).not.toContain(".animate(");
    expect(source).not.toMatch(/https?:\/\/.*gsap/i);
  });

  it("keeps reduced motion and responsive pointer behavior explicit", () => {
    const source = readFileSync(
      resolve(
        repositoryRoot,
        "components/marketing/campaign-motion-experience.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("(prefers-reduced-motion: reduce)");
    expect(source).toContain("(hover: hover) and (pointer: fine)");
    expect(source).toContain("matchMedia.revert()");
    expect(source).toContain("removeEventListener");

    const refreshIndex = source.indexOf("ScrollTrigger.refresh()");
    const readyIndex = source.indexOf(
      'scope.dataset.motionReady = "true"',
      refreshIndex,
    );

    expect(refreshIndex).toBeGreaterThan(-1);
    expect(readyIndex).toBeGreaterThan(refreshIndex);
  });
});
