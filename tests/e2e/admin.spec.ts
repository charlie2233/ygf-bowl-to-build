import { expect, test } from "@playwright/test";

import {
  expectNoAccessibilityViolations,
  expectNoHorizontalOverflow,
} from "./a11y";
import { gotoApp } from "./navigation";

test("demo administrator can inspect campaign metrics and code operations", async ({
  page,
}) => {
  await gotoApp(page, "/admin/dashboard");
  await expect(
    page.getByRole("heading", { level: 1, name: "Beta funnel" }),
  ).toBeVisible();
  await expect(
    page.getByText("Build Credits remaining", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("API key creators · rate", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Agent first success · rate", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Check-in creators · rate", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Agent model usage" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: "gpt-5.6-terra 1" }),
  ).toBeVisible();
  await expect(
    page.locator('meta[name="robots"]'),
  ).toHaveAttribute("content", /noindex/);
  await expectNoHorizontalOverflow(page, "/admin/dashboard");
  await expectNoAccessibilityViolations(page, "/admin/dashboard");

  await page
    .getByRole("link", { name: "Code operations" })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Private code batches",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Private means private."),
  ).toBeVisible();
  await expect(page.getByLabel("Batch name")).toBeVisible();
  await expect(
    page.getByLabel("Gift assignment row reference"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Gift row reference"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Code row reference"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, "/admin/codes");
  await expectNoAccessibilityViolations(page, "/admin/codes");
});

test("cross-origin admin mutation is rejected before batch creation", async ({
  request,
}) => {
  const response = await request.post("/api/admin/codes", {
    data: {
      count: 1,
      name: "Must not be created",
      source: "soft-test",
    },
    headers: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "ORIGIN_FORBIDDEN",
  });
});
