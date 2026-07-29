import type { Page } from "@playwright/test";

/**
 * Next development mode can keep nonessential image/HMR requests open after
 * the application is interactive. Assertions wait on the actual UI, so stop
 * navigation at DOM readiness instead of the broader load event.
 */
export async function gotoApp(page: Page, path: string) {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator('html[data-campaign-language-ready="true"]')
    .waitFor({ state: "attached" });
  return response;
}
