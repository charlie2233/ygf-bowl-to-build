import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const languageState = vi.hoisted(() => ({
  locale: "en" as "en" | "zh" | "es" | "fr" | "ru",
}));

vi.mock("@/components/campaign-language", () => ({
  useCampaignLanguage: () => ({
    locale: languageState.locale,
    setLocale: vi.fn(),
  }),
}));

import {
  ClaudeGiftRewardCard,
  ClaudeGiftSuccessCallout,
} from "@/components/reward/claude-gift";
import { RedeemSuccessView } from "@/components/workspace-views";
import { supportedLocales } from "@/lib/i18n/locales";
import { rewardCopy } from "@/lib/i18n/reward";
import type {
  PartnerRewardState,
  PartnerRewardSummary,
} from "@/lib/rewards/types";

function reward(state: PartnerRewardState): PartnerRewardSummary {
  return {
    expiresAt: "2099-08-11T12:00:00.000Z",
    id: "reward-private-identifier",
    kind: "claude-pro-gift",
    revealedAt:
      state === "revealed" ? "2099-07-28T12:00:00.000Z" : undefined,
    state,
  };
}

describe("Claude Pro gift presentation", () => {
  beforeEach(() => {
    languageState.locale = "en";
  });

  it.each(supportedLocales)(
    "localizes the success callout and secure reward card in %s",
    (locale) => {
      languageState.locale = locale;
      const copy = rewardCopy[locale];
      const calloutHtml = renderToStaticMarkup(
        <ClaudeGiftSuccessCallout reward={reward("assigned")} />,
      );
      const cardHtml = renderToStaticMarkup(
        <ClaudeGiftRewardCard reward={reward("assigned")} />,
      );

      expect(calloutHtml).toContain(copy.callout.title);
      expect(calloutHtml).toContain('href="/reward/claude-pro"');
      expect(cardHtml).toContain(copy.page.title);
      expect(cardHtml).toContain(copy.page.confidentialityTitle);
      expect(cardHtml).toContain(copy.page.disclaimer);
      expect(cardHtml).toContain(
        'action="/api/rewards/claude-pro/open"',
      );
      expect(cardHtml).toContain('method="post"');
      expect(cardHtml).not.toContain("reward-private-identifier");
      expect(rewardCopy[locale].callout.description).toMatch(
        /3[ ,.\u00a0]000/,
      );
    },
  );

  it("uses 杨国福 throughout the Chinese Claude gift context", () => {
    const chinese = rewardCopy.zh;

    expect(JSON.stringify(chinese)).toContain("杨国福");
    expect(JSON.stringify(chinese)).not.toContain("YGF");
  });

  it("adds the gift callout only when a reward is supplied to redemption success", () => {
    const ordinaryHtml = renderToStaticMarkup(<RedeemSuccessView />);
    const giftHtml = renderToStaticMarkup(
      <RedeemSuccessView reward={reward("assigned")} />,
    );

    expect(ordinaryHtml).not.toContain('href="/reward/claude-pro"');
    expect(giftHtml).toContain(rewardCopy.en.callout.title);
    expect(giftHtml).toContain('href="/reward/claude-pro"');
  });

  it("allows a safe retry after reveal but blocks expired and revoked gifts", () => {
    const revealedHtml = renderToStaticMarkup(
      <ClaudeGiftRewardCard reward={reward("revealed")} />,
    );
    const expiredHtml = renderToStaticMarkup(
      <ClaudeGiftRewardCard reward={reward("expired")} />,
    );
    const revokedHtml = renderToStaticMarkup(
      <ClaudeGiftRewardCard reward={reward("revoked")} />,
    );

    expect(revealedHtml).toContain(rewardCopy.en.page.reopenAction);
    expect(revealedHtml).toContain(
      'action="/api/rewards/claude-pro/open"',
    );
    expect(expiredHtml).toContain(rewardCopy.en.page.expiredTitle);
    expect(expiredHtml).not.toContain("<form");
    expect(revokedHtml).toContain(rewardCopy.en.page.revokedTitle);
    expect(revokedHtml).not.toContain("<form");
  });
});
