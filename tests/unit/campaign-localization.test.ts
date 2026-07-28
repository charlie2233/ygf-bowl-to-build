import { describe, expect, it } from "vitest";

import {
  campaignHomeCopy,
  campaignLanguageOptions,
  campaignLocales,
} from "@/lib/i18n/campaign";

describe("campaign localization contract", () => {
  it("ships the five requested languages", () => {
    expect(campaignLocales).toEqual(["en", "zh", "es", "fr", "ru"]);
    expect(campaignLanguageOptions.map(({ locale }) => locale)).toEqual(
      campaignLocales,
    );
  });

  it.each(campaignLocales)(
    "keeps the complete public-home contract in %s",
    (locale) => {
      const copy = campaignHomeCopy[locale];

      expect(copy.documentLanguage).toBeTruthy();
      expect(copy.header.languageLabel).toBeTruthy();
      expect(copy.hero.titleLineOne).toBeTruthy();
      expect(copy.hero.titleLineTwo).toBeTruthy();
      expect(copy.hero.claimCredits).toBeTruthy();
      expect(copy.hero.connectAgent).toBeTruthy();
      expect(copy.hero.connectAgent).not.toBe(copy.hero.claimCredits);
      expect(copy.hero.disclaimer).toMatch(/USC/i);
      expect(copy.useCases.items).toHaveLength(4);
      expect(copy.howItWorks.steps).toHaveLength(3);
      expect(copy.faq.items).toHaveLength(4);
      expect(copy.footer.disclaimer).toMatch(/USC/i);
    },
  );

  it("uses standards-compatible document language tags", () => {
    expect(
      campaignLocales.map(
        (locale) => campaignHomeCopy[locale].documentLanguage,
      ),
    ).toEqual(["en", "zh-CN", "es", "fr", "ru"]);
  });
});
