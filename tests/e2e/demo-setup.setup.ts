import { expect, test } from "@playwright/test";

import {
  expectNoAccessibilityViolations,
  expectNoHorizontalOverflow,
} from "./a11y";
import { gotoApp } from "./navigation";

test("establishes the single demo claim and first useful result", async ({
  page,
}) => {
  // This one-time setup compiles and traverses four routes serially in dev.
  // Keep the default 30-second budget for the independent read-only specs.
  test.setTimeout(120_000);

  await gotoApp(page, "/redeem#code=BOWL7K2A");

  await expect(page.getByLabel("8-character card code")).toHaveValue(
    "BOWL7K2A",
  );
  await expect
    .poll(() => new URL(page.url()).hash)
    .toBe("");
  expect(new URL(page.url()).pathname).toBe("/redeem");
  await expect(
    page.getByText(/no login screen/i),
  ).toBeVisible();
  await expect(page.getByText(/API key|OpenAI-compatible/i)).toHaveCount(0);

  await page
    .getByRole("checkbox", { name: /promotional terms/i })
    .check();
  await page
    .getByRole("button", { name: "Unlock 3,000 credits" })
    .click();
  await expect(page).toHaveURL(/\/redeem\/success$/);
  await expect(
    page.getByRole("heading", {
      name: "Your Build Credits are ready",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Use AI now" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect my Agent" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Developer API key" }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Use AI now" })
    .click();
  await expect(page).toHaveURL(/\/wallet$/);
  await expect(
    page.getByText("3,000", { exact: true }),
  ).toBeVisible();

  await gotoApp(page, "/task/study");
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
    page.getByText("Connect my Agent"),
  ).toBeVisible();

  await gotoApp(page, "/connect/agent");
  await expect(
    page.getByRole("heading", { name: "Connect your own Agent" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your key list is up to date."),
  ).toBeVisible();

  const createKeyResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/keys" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create personal key" })
    .click();
  expect((await createKeyResponse).status()).toBe(201);
  await expect(
    page
      .getByRole("region", { name: "New API key" })
      .locator("code"),
  ).toHaveText(/^ygf_[A-Za-z0-9_-]{43}$/u);
  await expect(
    page.getByText(
      "Key created. Copy it now—the full secret appears only this time.",
    ),
  ).toBeVisible();

  const connectionResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        "/v1/chat/completions" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Test connection" })
    .click();
  expect((await connectionResponse).status()).toBe(200);
  await expect(
    page.getByText(
      "Connection successful. 2,879 credits remain.",
    ),
  ).toBeVisible();

  await gotoApp(page, "/share");
  await expect(page.getByText("First build: Study")).toBeVisible();
  await expect(page.locator(".share-builder select")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  const shareSignalPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/share-card" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Download SVG card" })
    .click();
  const [download, shareSignal] = await Promise.all([
    downloadPromise,
    shareSignalPromise,
  ]);
  expect(download.suggestedFilename()).toBe(
    "ygf-bowl-to-build-check-in.svg",
  );
  expect(shareSignal.status()).toBe(204);
  await expect(
    page.getByText("Your SVG card downloaded."),
  ).toBeVisible();
});
