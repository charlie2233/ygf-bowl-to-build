import { expect, test } from "@playwright/test";

import {
  expectNoAccessibilityViolations,
  expectNoHorizontalOverflow,
} from "./a11y";

const PUBLIC_ROUTES = [
  {
    heading: "Buy a bowl. Build with AI.",
    path: "/",
  },
  {
    heading: "Buy a bowl. Build with AI.",
    path: "/offer",
  },
  {
    heading: "Claim your Build Credits",
    path: "/redeem",
  },
  {
    heading: "Frequently asked questions",
    path: "/faq",
  },
  {
    heading: "Privacy notice",
    path: "/privacy",
  },
  {
    heading: "Promotional terms",
    path: "/terms",
  },
  {
    heading: "Staff help",
    path: "/staff",
  },
] as const;

for (const route of PUBLIC_ROUTES) {
  test(`${route.path} is accessible and does not overflow`, async ({
    page,
  }) => {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: route.heading,
      }),
    ).toBeVisible();

    await expectNoHorizontalOverflow(page, route.path);
    await expectNoAccessibilityViolations(page, route.path);
  });
}

test("keyboard users can bypass navigation and reach main content", async ({
  browserName,
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press(
    browserName === "webkit" ? "Alt+Tab" : "Tab",
  );
  const skipLink = page.getByRole("link", {
    name: "Skip to content",
  });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
