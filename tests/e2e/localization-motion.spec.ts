import { expect, test } from "@playwright/test";

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
