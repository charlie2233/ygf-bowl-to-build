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
    heading: "Unlock 3,000 AI Credits",
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

const REAL_PHOTO_ROUTES = ["/", "/offer"] as const;
const REAL_PHOTO_ALT =
  "Assorted YGF ingredients ready to choose at the counter";

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

for (const path of REAL_PHOTO_ROUTES) {
  test(`${path} loads and decodes the real YGF supporting photo`, async ({
    page,
  }) => {
    const failedMediaRequests: string[] = [];
    const failedMediaResponses: string[] = [];
    const isMediaRequest = (url: string) =>
      url.includes("/_next/image") || url.includes("/media/");

    page.on("requestfailed", (request) => {
      if (isMediaRequest(request.url())) {
        failedMediaRequests.push(request.url());
      }
    });
    page.on("response", (response) => {
      if (isMediaRequest(response.url()) && response.status() >= 400) {
        failedMediaResponses.push(
          `${response.status()} ${response.url()}`,
        );
      }
    });

    await page.goto(path);
    const image = page.getByRole("img", { name: REAL_PHOTO_ALT });
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const photo = element as HTMLImageElement;
          return {
            complete: photo.complete,
            decoded: photo.naturalHeight > 0 && photo.naturalWidth > 0,
          };
        }),
      )
      .toEqual({
        complete: true,
        decoded: true,
      });

    expect(failedMediaRequests).toEqual([]);
    expect(failedMediaResponses).toEqual([]);
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
