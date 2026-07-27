import { expect, test } from "@playwright/test";

import {
  expectNoAccessibilityViolations,
  expectNoHorizontalOverflow,
} from "./a11y";

const TERMINAL_STATES = [
  {
    path: "/already-used",
    title: "This code was already used",
  },
  {
    path: "/expired",
    title: "This claim has expired",
  },
  {
    path: "/revoked",
    title: "This code is unavailable",
  },
  {
    path: "/blocked",
    title: "Please wait before trying again",
  },
] as const;

test("invalid receipt QR is removed from the URL and offers printed-code recovery", async ({
  page,
}) => {
  await page.goto("/redeem#code=BOWL7K2A&next=/wallet");

  await expect
    .poll(() => new URL(page.url()).hash)
    .toBe("");
  await expect(page.getByLabel("Receipt code")).toHaveValue("");
  await expect(
    page.getByText(
      "That receipt QR is not valid. Enter the printed code instead.",
    ),
  ).toBeVisible();
});

test("claim form explains missing consent, missing code, and an unavailable code", async ({
  page,
}) => {
  await page.goto("/redeem");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText(
      "Agree to the promotional terms and privacy notice.",
      { exact: true },
    ),
  ).toBeVisible();

  await page
    .getByRole("checkbox", { name: /promotional terms/i })
    .check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Enter the 8-character receipt code."),
  ).toBeVisible();

  await page.getByLabel("Receipt code").fill("NOPE1234");
  const validationResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/code/validate" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue" }).click();
  const validationResponse = await validationResponsePromise;
  expect(validationResponse.status()).toBe(200);
  await expect(
    page.getByText(
      "That code is invalid or unavailable. Check it and try again.",
    ),
  ).toBeVisible();
});

test("redemption terminal states remain actionable and privacy safe", async ({
  page,
}) => {
  for (const state of TERMINAL_STATES) {
    await page.goto(state.path);
    await expect(
      page.getByRole("heading", { level: 1, name: state.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name:
          state.path === "/already-used"
            ? "Open my wallet"
            : "Try another code",
      }),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText("BOWL7K2A");
    await expectNoHorizontalOverflow(page, state.path);
    await expectNoAccessibilityViolations(page, state.path);
  }
});
