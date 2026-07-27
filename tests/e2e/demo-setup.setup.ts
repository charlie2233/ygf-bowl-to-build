import { expect, test } from "@playwright/test";

import {
  expectNoAccessibilityViolations,
  expectNoHorizontalOverflow,
} from "./a11y";

test("establishes the single demo claim and first useful result", async ({
  page,
}) => {
  await page.goto("/redeem#code=BOWL7K2A");

  await expect(page.getByLabel("Receipt code")).toHaveValue("BOWL7K2A");
  await expect
    .poll(() => new URL(page.url()).hash)
    .toBe("");
  expect(new URL(page.url()).pathname).toBe("/redeem");

  await page
    .getByRole("checkbox", { name: /promotional terms/i })
    .check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/redeem\/success$/);
  await expect(
    page.getByRole("heading", {
      name: "Your Build Credits are ready",
    }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Choose your first task" })
    .click();
  await expect(page).toHaveURL(/\/wallet$/);
  await expect(
    page.getByText("3,000", { exact: true }),
  ).toBeVisible();

  // Partner promotion is gated until one task has completed.
  await page.goto("/connect/openrouter");
  await expect(page).toHaveURL(/\/wallet$/);

  await page.goto("/task/study");
  await page
    .getByLabel("What are you working on?")
    .fill("Explain active recall and create five flashcards.");

  const taskResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/tasks" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate" }).click();
  const taskResponse = await taskResponsePromise;
  expect(taskResponse.status()).toBe(200);
  await expect(taskResponse.json()).resolves.toMatchObject({
    remainingCredits: 2_880,
    status: "completed",
  });

  await expect(
    page.getByRole("heading", { name: "Your study guide" }),
  ).toBeVisible();
  await expect(page.getByText("2,880 credits")).toBeVisible();
  await expect(
    page.getByText(
      /Active recall strengthens memory by retrieving information/,
    ),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, "Study result");
  await expectNoAccessibilityViolations(page, "Study result");

  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await expect(
    page.getByRole("button", { name: "Saved to history" }),
  ).toBeVisible();
  await expect(
    page.getByText("Keep building with OpenRouter"),
  ).toBeVisible();
});
