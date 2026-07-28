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

test("invalid private QR is removed from the URL and offers printed-code recovery", async ({
  page,
}) => {
  await page.goto("/redeem#code=BOWL7K2A&next=/wallet");

  await expect
    .poll(() => new URL(page.url()).hash)
    .toBe("");
  await expect(page.getByLabel("8-character card code")).toHaveValue("");
  await expect(
    page.getByText(
      "That private QR is not valid. Enter the code printed on your card.",
    ),
  ).toBeVisible();
});

test("legacy query claims are scrubbed without trusting query consent", async ({
  page,
}) => {
  await page.goto(
    "/redeem?code=BOWL7K2A&termsAccepted=on&source=legacy",
  );

  await expect(
    page.getByLabel("8-character card code"),
  ).toHaveValue("BOWL7K2A");
  await expect(
    page.getByRole("checkbox", { name: /promotional terms/i }),
  ).not.toBeChecked();
  await expect
    .poll(() => new URL(page.url()).search)
    .toBe("?source=legacy");
  expect(page.url()).not.toContain("BOWL7K2A");
  expect(page.url()).not.toContain("termsAccepted");
});

test("reviewing legal terms keeps a scanned private code on the redeem page", async ({
  page,
}) => {
  await page.goto("/redeem#code=BOWL7K2A");
  const codeInput = page.getByLabel("8-character card code");
  await expect(codeInput).toHaveValue("BOWL7K2A");
  await expect
    .poll(() => new URL(page.url()).hash)
    .toBe("");

  const termsLink = page.getByRole("link", {
    name: "promotional terms",
  });
  await expect(termsLink).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await termsLink.click();
  const legalPage = await popupPromise;
  await expect(legalPage).toHaveURL(/\/terms$/);
  await legalPage.close();

  await expect(page).toHaveURL(/\/redeem$/);
  await expect(codeInput).toHaveValue("BOWL7K2A");
});

test("claim form explains missing consent, missing code, and an unavailable code", async ({
  page,
}) => {
  await page.goto("/redeem");

  const codeInput = page.getByLabel("8-character card code");
  const submit = page.getByRole("button", {
    name: "Unlock 3,000 credits",
  });

  await submit.click();
  await expect(
    page.getByText("Enter the 8-character card code.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(codeInput).toBeFocused();
  await expect(codeInput).toHaveAttribute("aria-invalid", "true");

  await codeInput.fill("NOPE1234");
  await submit.click();
  await expect(
    page.getByText(
      "Agree to the promotional terms and privacy notice to continue.",
      { exact: true },
    ),
  ).toBeVisible();
  const consentError = page.getByTestId("terms-consent-error");
  await expect(consentError).toBeVisible();
  await expect(consentError).toBeInViewport();
  await expect(consentError).toHaveCSS("position", "fixed");
  await expect(page).toHaveURL(/\/redeem$/);
  await expect(
    page.getByRole("checkbox", { name: /promotional terms/i }),
  ).toBeFocused();

  await page
    .getByRole("checkbox", { name: /promotional terms/i })
    .check();
  await expect(consentError).toHaveCount(0);
  const validationResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/code/validate" &&
      response.request().method() === "POST",
  );
  await submit.click();
  const validationResponse = await validationResponsePromise;
  expect(validationResponse.status()).toBe(200);
  await expect(
    page.getByText(
      "That code is invalid or unavailable. Check the card and try again.",
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
    const action = page.getByRole("link", {
      name:
        state.path === "/already-used"
          ? "Open my wallet"
          : "Try another code",
    });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute(
      "href",
      state.path === "/already-used" ? "/wallet" : "/redeem",
    );
    await expect(page.locator("main")).not.toContainText("BOWL7K2A");
    await expectNoHorizontalOverflow(page, state.path);
    await expectNoAccessibilityViolations(page, state.path);
  }
});
