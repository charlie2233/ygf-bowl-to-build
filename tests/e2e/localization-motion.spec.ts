import { expect, test } from "@playwright/test";

import { campaignHomeCopy } from "@/lib/i18n/campaign";
import { redeemCopy } from "@/lib/i18n/redeem";

import { expectNoHorizontalOverflow } from "./a11y";

const translatedHeadings = {
  en: "Buy a bowl. Build with AI.",
  es: "Compra un bowl. Crea con IA.",
  fr: "Prenez un bowl. Créez avec l’IA.",
  ru: "Купите боул. Создавайте с ИИ.",
  zh: "吃一碗。 用 AI 开始创造。",
} as const;

const documentLanguages = {
  en: "en",
  es: "es",
  fr: "fr",
  ru: "ru",
  zh: "zh-CN",
} as const;

test("campaign home switches all requested languages and remembers the choice", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  const selector = page.locator(".language-selector select");
  await expect(selector).toHaveValue("en");

  for (const locale of ["zh", "es", "fr", "ru", "en"] as const) {
    await selector.selectOption(locale);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: translatedHeadings[locale],
      }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "lang",
      documentLanguages[locale],
    );
    await expect(page.locator(".campaign-home")).toHaveAttribute(
      "data-language",
      locale,
    );
    await expect(page.locator(".campaign-home")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    await expect(
      page.locator('a[data-step="02"][href="/connect/agent"]'),
    ).toBeVisible();
    await expect(
      page.getByText(campaignHomeCopy[locale].hero.guidance, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".marketing-hero__subhead")).toContainText(
      "3,000",
    );
    await expect(page.locator(".marketing-hero__image")).toHaveAttribute(
      "alt",
      campaignHomeCopy[locale].hero.imageAlt,
    );
    await expectNoHorizontalOverflow(page, `home-${locale}`);
  }

  await selector.selectOption("zh");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: translatedHeadings.zh,
    }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(selector).toHaveValue("zh");
  expect(pageErrors).toEqual([]);
});

test("language follows the user from the home page into redemption", async ({
  page,
}) => {
  await page.goto("/");
  const homeSelector = page.locator(
    ".site-header .language-selector select",
  );

  await homeSelector.selectOption("zh");
  await page.locator('a[data-step="01"][href="/redeem"]').click();

  await expect(page).toHaveURL(/\/redeem$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: redeemCopy.zh.title,
    }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.locator(".site-header .language-selector select"),
  ).toHaveValue("zh");

  await page
    .locator(".site-header .language-selector select")
    .selectOption("fr");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: redeemCopy.fr.title,
    }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.reload();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: redeemCopy.fr.title,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".site-header .language-selector select"),
  ).toHaveValue("fr");
});

test("English-only admin pages preserve the customer language preference", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Language" })
    .selectOption("zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

  await page.goto("/admin/dashboard");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("combobox")).toHaveCount(0);

  await page.locator('a.site-brand[href="/"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.getByRole("combobox", { name: "语言" }),
  ).toHaveValue("zh");

  await page
    .getByRole("combobox", { name: "语言" })
    .selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByRole("combobox", { name: "Langue" }),
  ).toHaveValue("fr");
});

test("long public navigation stays inside a tablet viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 700 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Language" })
    .selectOption("ru");

  await expect(
    page.getByRole("combobox", { name: "Язык" }),
  ).toHaveValue("ru");
  await expect(
    page.locator(".site-nav__link--how"),
  ).not.toBeVisible();
  await expectNoHorizontalOverflow(page, "public-header-ru-700");
});

test("campaign motion honors reduced-motion preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute(
    "data-campaign-motion",
    "reduced",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-campaign-motion-engine",
    "gsap",
  );
  await expect(page.locator(".campaign-home")).toHaveAttribute(
    "data-motion-engine",
    "gsap",
  );
  await expect(page.locator(".campaign-home")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );

  const motionTargets = page.locator(
    ".marketing-hero__image, [data-motion-phone], [data-motion-reveal]",
  );
  await expect(motionTargets).toHaveCount(7);

  for (const target of await motionTargets.all()) {
    await expect(target).toHaveCSS("transform", "none");
    await expect(target).toBeVisible();
  }
});

test("campaign motion initializes the bundled GSAP experience", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute(
    "data-campaign-motion",
    "enhanced",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-campaign-motion-engine",
    "gsap",
  );
  await expect(page.locator(".campaign-home")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await expect(
    page.locator('a[data-step="01"][href="/redeem"]'),
  ).toBeVisible();
  await expect(
    page.locator('a[data-step="02"][href="/connect/agent"]'),
  ).toBeVisible();
  await page
    .locator('a[data-step="01"][href="/redeem"]')
    .click({ trial: true });
  await page
    .locator('a[data-step="02"][href="/connect/agent"]')
    .click({ trial: true });
  await expect(page.locator('[class*="gsap-marker"]')).toHaveCount(0);

  for (const reveal of await page.locator("[data-motion-reveal]").all()) {
    await reveal.scrollIntoViewIfNeeded();
    await expect(reveal).toBeVisible();
  }
});

test("translated reveal targets are rebuilt and preseeded before scroll", async ({
  page,
}) => {
  await page.setViewportSize({ height: 700, width: 1_200 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".campaign-home")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );

  await page.locator(".language-selector select").selectOption("zh");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: translatedHeadings.zh,
    }),
  ).toBeVisible();
  await expect(page.locator(".campaign-home")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );

  const readTranslateY = (selector: string) =>
    page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => {
        const transform = window.getComputedStyle(element).transform;
        return transform === "none"
          ? 0
          : Math.round(new DOMMatrix(transform).m42);
      }),
    );

  await expect
    .poll(() => readTranslateY(".use-case"))
    .toEqual([18, 18, 18, 18]);
  await expect
    .poll(() => readTranslateY(".campaign-step"))
    .toEqual([18, 18, 18]);

  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 260);
  });

  await expect
    .poll(() => readTranslateY(".use-case"))
    .toEqual([0, 0, 0, 0]);
});

test("mobile motion releases temporary compositor hints", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".campaign-home")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );

  await expect
    .poll(() =>
      page.locator(".marketing-hero__image").evaluate((element) => {
        return window.getComputedStyle(element).willChange;
      }),
    )
    .toBe("auto");
  await expect(page.locator("[data-motion-phone]")).toHaveCSS(
    "will-change",
    "auto",
  );
});

test("long translations stay inside a narrow mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 360 });
  await page.goto("/");
  const selector = page.locator(".language-selector select");

  for (const locale of ["fr", "ru"] as const) {
    await selector.selectOption(locale);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: translatedHeadings[locale],
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, `home-narrow-${locale}`);
  }
});

test("workspace navigation avoids translated-label collisions at tablet width", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 700 });
  await page.goto("/wallet");

  const mobileSelector = page.locator(
    ".workspace-menu > .language-selector select",
  );
  await mobileSelector.selectOption("ru");

  await expect(page.locator(".site-nav--workspace")).toBeHidden();
  await expect(mobileSelector).toHaveValue("ru");
  await expect(page.locator("details.workspace-menu")).toBeVisible();

  const brandBox = await page.locator(".site-brand").boundingBox();
  const languageBox = await page
    .locator(".workspace-menu > .language-selector")
    .boundingBox();

  expect(brandBox).not.toBeNull();
  expect(languageBox).not.toBeNull();
  expect((brandBox?.x ?? 0) + (brandBox?.width ?? 0)).toBeLessThanOrEqual(
    languageBox?.x ?? 0,
  );
  await expectNoHorizontalOverflow(page, "wallet-russian-tablet");
});
