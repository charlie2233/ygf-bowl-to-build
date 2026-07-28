import { describe, expect, it } from "vitest";

import {
  isSiteLocale,
  resolveSiteLocale,
  siteLanguageOptions,
  siteLocales,
  siteNavigationCopy,
} from "@/lib/i18n/site";
import {
  campaignLanguageOptions,
  campaignLocales,
} from "@/lib/i18n/campaign";

describe("site localization contract", () => {
  it("ships complete navigation copy for all five customer languages", () => {
    expect(siteLocales).toBe(campaignLocales);
    expect(siteLanguageOptions).toBe(campaignLanguageOptions);
    expect(siteLocales).toEqual(["en", "zh", "es", "fr", "ru"]);
    expect(siteLanguageOptions.map(({ locale }) => locale)).toEqual(
      siteLocales,
    );

    for (const locale of siteLocales) {
      const copy = siteNavigationCopy[locale];

      expect(copy.documentLanguage).toBeTruthy();
      expect(copy.skipLink).toBeTruthy();
      expect(Object.values(copy.public).every(Boolean)).toBe(true);
      expect(Object.values(copy.workspace).every(Boolean)).toBe(true);
    }
  });

  it("accepts only supported locale values and falls back to English", () => {
    expect(isSiteLocale("zh")).toBe(true);
    expect(isSiteLocale("de")).toBe(false);
    expect(resolveSiteLocale("fr")).toBe("fr");
    expect(resolveSiteLocale("invalid")).toBe("en");
    expect(resolveSiteLocale(undefined)).toBe("en");
  });
});
