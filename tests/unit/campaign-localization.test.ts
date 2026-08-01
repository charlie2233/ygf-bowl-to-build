import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Hero } from "@/components/marketing/hero";
import {
  campaignHomeCopy,
  campaignLanguageOptions,
  campaignLocales,
} from "@/lib/i18n/campaign";
import { redeemCopy } from "@/lib/i18n/redeem";
import { workspaceCopy } from "@/lib/i18n/workspace";

const rewardContextExpectations = {
  en: {
    offerCredits: "Every valid code",
    redeemCredits: "Each distinct eligible card",
    sameCode: "The same code never grants again",
    selectedGift: "Selected special codes may also",
    walletDestination: "to this wallet",
    walletExpiry: "whole wallet",
  },
  zh: {
    offerCredits: "每个有效兑换码",
    redeemCredits: "每张不同且符合条件的卡片",
    sameCode: "同一兑换码不会重复发放",
    selectedGift: "部分特别兑换码还可能",
    walletDestination: "向此钱包",
    walletExpiry: "整个钱包",
  },
  es: {
    offerCredits: "Cada código válido",
    redeemCredits: "Cada tarjeta distinta",
    sameCode: "El mismo código nunca vuelve a conceder",
    selectedGift: "Algunos códigos especiales seleccionados también pueden",
    walletDestination: "a esta cartera",
    walletExpiry: "toda la cartera",
  },
  fr: {
    offerCredits: "Chaque code valide",
    redeemCredits: "Chaque carte distincte",
    sameCode: "Le même code n’en accorde jamais à nouveau",
    selectedGift: "Certains codes spéciaux sélectionnés peuvent aussi",
    walletDestination: "à ce portefeuille",
    walletExpiry: "l’ensemble du portefeuille",
  },
  ru: {
    offerCredits: "Каждый действительный код",
    redeemCredits: "Каждая отдельная подходящая карта",
    sameCode: "Тот же код никогда не начисляет",
    selectedGift: "Некоторые специальные коды также могут",
    walletDestination: "в этот кошелёк",
    walletExpiry: "всего кошелька",
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

const optionalLabelExpectations = {
  en: "optional",
  zh: "可选",
  es: "opcional",
  fr: "facultatif",
  ru: "необязательно",
} as const;

function normalizedText(element: Element | undefined) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("campaign localization contract", () => {
  it.each(campaignLocales)(
    "includes explicit operational-pause guidance in %s",
    (locale) => {
      expect(redeemCopy[locale].form.errors.redemptionPaused).toBeTruthy();
      expect(workspaceCopy[locale].task.errors.tasksPaused).toBeTruthy();
    },
  );

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

      const copyContainer = hero.querySelector(".marketing-hero__copy");
      const copyChildren = Array.from(copyContainer?.children ?? []);

      expect(copyChildren).toHaveLength(6);

      const [
        heading,
        subhead,
        guidance,
        actions,
        rewardNote,
        disclaimer,
      ] = copyChildren;

      expect(heading?.tagName).toBe("H1");
      expect(subhead?.matches(".marketing-hero__subhead")).toBe(true);
      expect(guidance?.matches(".marketing-hero__guidance")).toBe(true);
      expect(actions?.matches(".marketing-hero__actions")).toBe(true);
      expect(rewardNote?.matches(".marketing-hero__reward-note")).toBe(
        true,
      );
      expect(disclaimer?.matches(".marketing-hero__disclaimer")).toBe(
        true,
      );
      expect(normalizedText(subhead)).toBe(
        campaignHomeCopy[locale].hero.subhead,
      );
      expect(normalizedText(guidance)).toBe(
        campaignHomeCopy[locale].hero.guidance,
      );
      expect(normalizedText(rewardNote)).toBe(offerContext);
      expect(normalizedText(disclaimer)).toBe(
        campaignHomeCopy[locale].hero.disclaimer,
      );

      const actionLinks = Array.from(actions?.children ?? []);

      expect(actionLinks).toHaveLength(2);

      const [stepOne, stepTwo] = actionLinks;

      expect(stepOne?.tagName).toBe("A");
      expect(stepOne?.getAttribute("href")).toBe("/redeem");
      expect(stepOne?.getAttribute("data-step")).toBe("1");
      expect(stepOne?.classList.contains("button--primary")).toBe(true);
      expect(
        stepOne?.classList.contains("marketing-hero__cta--secondary"),
      ).toBe(false);
      expect(stepOne?.classList.contains("button--secondary")).toBe(
        false,
      );
      expect(normalizedText(stepOne)).toContain(
        campaignHomeCopy[locale].hero.stepOne,
      );
      expect(normalizedText(stepOne)).toContain(
        campaignHomeCopy[locale].hero.claimCredits,
      );

      expect(stepTwo?.tagName).toBe("A");
      expect(stepTwo?.getAttribute("href")).toBe("/connect/agent");
      expect(stepTwo?.getAttribute("data-step")).toBe("2");
      expect(stepTwo?.classList.contains("button--secondary")).toBe(
        true,
      );
      expect(
        stepTwo?.classList.contains("marketing-hero__cta--secondary"),
      ).toBe(true);
      expect(normalizedText(stepTwo)).toContain(
        campaignHomeCopy[locale].hero.stepTwo,
      );
      expect(normalizedText(stepTwo)).toContain(
        campaignHomeCopy[locale].hero.connectAgent,
      );
      expect(campaignHomeCopy[locale].hero.connectAgent).toContain(
        optionalLabelExpectations[locale],
      );

      for (const context of [offerContext, redeemContext]) {
        expect(context).toContain(expectation.selectedGift);
        expect(context).toMatch(/3[ ,]000/);
        expect(context).toMatch(/Claude Pro/i);
        expect(context).not.toMatch(/or\s+(?:a\s+)?Claude Pro/i);
      }
      expect(offerContext).toContain(expectation.offerCredits);
      expect(redeemContext).toContain(expectation.redeemCredits);
      expect(redeemContext).toContain(expectation.sameCode);
      expect(redeemContext).toContain(expectation.walletDestination);
      expect(redeemContext).toContain(expectation.walletExpiry);
      expect(redeemContext).toMatch(/14/);
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
