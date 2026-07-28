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
});

test("campaign motion honors reduced-motion preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute(
    "data-campaign-motion",
    "reduced",
  );
  await expect(
    page.locator('[data-motion-reveal][data-motion-state="visible"]'),
  ).toHaveCount(5);
});
