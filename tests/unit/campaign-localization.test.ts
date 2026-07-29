import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Hero } from "@/components/marketing/hero";
import {
  campaignHomeCopy,
  campaignLanguageOptions,
  campaignLocales,
} from "@/lib/i18n/campaign";
import { redeemCopy } from "@/lib/i18n/redeem";

const rewardContextExpectations = {
  en: {
    credits: "Every valid code",
    selectedGift: "Selected special codes may also",
  },
  zh: {
    credits: "每个有效兑换码",
    selectedGift: "部分特别兑换码还可能",
  },
  es: {
    credits: "Cada código válido",
    selectedGift: "Algunos códigos especiales seleccionados también pueden",
  },
  fr: {
    credits: "Chaque code valide",
    selectedGift: "Certains codes spéciaux sélectionnés peuvent aussi",
  },
  ru: {
    credits: "Каждый действительный код",
    selectedGift: "Некоторые специальные коды также могут",
  },
} as const;

const stepLabelExpectations = {
  en: ["Step 1", "Step 2"],
  zh: ["步骤 1", "步骤 2"],
  es: ["Paso 1", "Paso 2"],
  fr: ["Étape 1", "Étape 2"],
  ru: ["Шаг 1", "Шаг 2"],
} as const;

const guidanceExpectations = {
  en: "Start with Step 1. Agent setup is optional.",
  zh: "请从步骤 1 开始；Agent 连接为可选功能。",
  es: "Empieza por el Paso 1. Conectar un Agent es opcional.",
  fr: "Commencez par l’Étape 1. La connexion Agent est facultative.",
  ru: "Начните с шага 1. Подключение Agent необязательно.",
} as const;

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
      expect(copy.hero.subhead).toContain("25");
      expect(copy.hero.subhead).toContain("3,000");
      expect(copy.hero.subhead).toContain("14");
      expect(copy.hero.rewardContext).toMatch(/Claude Pro/i);
      expect(copy.howItWorks.description).toContain("25");
      expect(copy.hero.guidance).toContain("1");
      expect(copy.hero.guidance).toBe(guidanceExpectations[locale]);
      expect([copy.hero.stepOne, copy.hero.stepTwo]).toEqual(
        stepLabelExpectations[locale],
      );
      expect(copy.hero.stepOne).not.toMatch(/^0/);
      expect(copy.hero.stepTwo).not.toMatch(/^0/);
      expect(copy.hero.imageAlt).toBeTruthy();
      expect(copy.hero.disclaimer).toMatch(/USC/i);
      expect(copy.useCases.items).toHaveLength(4);
      expect(copy.howItWorks.steps).toHaveLength(3);
      expect(copy.faq.items).toHaveLength(4);
      expect(copy.faq.items[0]?.answer).toContain("25");
      expect(copy.footer.disclaimer).toMatch(/USC/i);
      expect(JSON.stringify(copy)).not.toMatch(/(?:\$16|16 \$)/);
    },
  );

  it.each(campaignLocales)(
    "keeps credits guaranteed and Claude Pro limited to selected codes in %s",
    (locale) => {
      const expectation = rewardContextExpectations[locale];
      const offerContext = campaignHomeCopy[locale].hero.rewardContext;
      const redeemContext = redeemCopy[locale].next.description;
      const hero = document.createElement("div");

      hero.innerHTML = renderToStaticMarkup(
        Hero({
          copy: campaignHomeCopy[locale].hero,
        }),
      );

      const actions = hero.querySelector(".marketing-hero__actions");
      const rewardNote = hero.querySelector(
        ".marketing-hero__reward-note",
      );

      expect(actions).toBeTruthy();
      expect(rewardNote).toBeTruthy();
      expect(actions?.querySelectorAll("a[data-step]")).toHaveLength(2);
      expect(
        actions?.compareDocumentPosition(rewardNote as Node) ??
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(rewardNote?.textContent).toBe(offerContext);

      for (const context of [offerContext, redeemContext]) {
        expect(context).toContain(expectation.credits);
        expect(context).toContain(expectation.selectedGift);
        expect(context).toMatch(/3[ ,]000/);
        expect(context).toMatch(/Claude Pro/i);
        expect(context).not.toMatch(/or\s+(?:a\s+)?Claude Pro/i);
      }
    },
  );

  it("uses 杨国福 in the Chinese customer-facing offer context", () => {
    const chinese = campaignHomeCopy.zh;

    expect(chinese.hero.subhead).toContain("杨国福");
    expect(chinese.hero.rewardContext).toContain("杨国福");
    expect(chinese.hero.rewardContext).not.toContain("YGF");
  });

  it("uses standards-compatible document language tags", () => {
    expect(
      campaignLocales.map(
        (locale) => campaignHomeCopy[locale].documentLanguage,
      ),
    ).toEqual(["en", "zh-CN", "es", "fr", "ru"]);
  });
});
