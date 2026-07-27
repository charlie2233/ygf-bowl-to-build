import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
] as const;

export async function expectNoAccessibilityViolations(
  page: Page,
  label: string,
) {
  const result = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .analyze();
  const violations = result.violations.map((violation) => ({
    help: violation.help,
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target),
  }));

  expect(violations, `Accessibility violations on ${label}`).toEqual([]);
}

export async function expectNoHorizontalOverflow(
  page: Page,
  label: string,
) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(
    dimensions.scrollWidth,
    `Horizontal overflow on ${label}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}
