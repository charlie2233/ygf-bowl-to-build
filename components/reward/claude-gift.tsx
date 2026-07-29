"use client";

import {
  CheckCircle2,
  CircleSlash2,
  Clock3,
  ExternalLink,
  Gift,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";

import { useCampaignLanguage } from "@/components/campaign-language";
import {
  rewardCopy,
  rewardIntlLocales,
} from "@/lib/i18n/reward";
import type { PartnerRewardSummary } from "@/lib/rewards/types";

function formatExpiry(value: string, locale: keyof typeof rewardCopy) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return `${new Intl.DateTimeFormat(rewardIntlLocales[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

export function ClaudeGiftSuccessCallout({
  reward,
}: Readonly<{ reward: PartnerRewardSummary }>) {
  const { locale } = useCampaignLanguage();
  const copy = rewardCopy[locale].callout;

  if (
    reward.kind !== "claude-pro-gift" ||
    (reward.state !== "assigned" &&
      reward.state !== "revealed")
  ) {
    return null;
  }

  return (
    <section
      aria-labelledby="claude-gift-callout-title"
      className="claude-gift-callout"
    >
      <Gift aria-hidden="true" />
      <div>
        <h2 id="claude-gift-callout-title">{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <Link
        className="button button--secondary button--small"
        href="/reward/claude-pro"
      >
        {copy.action}
      </Link>
    </section>
  );
}

function RewardState({
  reward,
}: Readonly<{ reward: PartnerRewardSummary }>) {
  const { locale } = useCampaignLanguage();
  const copy = rewardCopy[locale].page;

  if (reward.state === "expired") {
    return (
      <div className="claude-gift-card__terminal" role="status">
        <Clock3 aria-hidden="true" />
        <div>
          <h1 id="claude-gift-title">{copy.expiredTitle}</h1>
          <p>{copy.expiredDescription}</p>
        </div>
      </div>
    );
  }

  if (reward.state === "revoked") {
    return (
      <div className="claude-gift-card__terminal" role="status">
        <CircleSlash2 aria-hidden="true" />
        <div>
          <h1 id="claude-gift-title">{copy.revokedTitle}</h1>
          <p>{copy.revokedDescription}</p>
        </div>
      </div>
    );
  }

  const wasRevealed = reward.state === "revealed";

  return (
    <>
      {wasRevealed ? (
        <div className="claude-gift-card__terminal" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h1 id="claude-gift-title">{copy.revealedTitle}</h1>
            <p>{copy.revealedDescription}</p>
          </div>
        </div>
      ) : (
        <header className="claude-gift-card__header">
          <Gift aria-hidden="true" />
          <div>
            <h1 id="claude-gift-title">{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
        </header>
      )}
      <div className="claude-gift-card__availability">
        <strong>{wasRevealed ? copy.opened : copy.ready}</strong>
        <time dateTime={reward.expiresAt}>
          {copy.expires(formatExpiry(reward.expiresAt, locale))}
        </time>
      </div>
      <form
        action="/api/rewards/claude-pro/open"
        className="claude-gift-card__open"
        method="post"
      >
        <button className="button button--primary button--medium" type="submit">
          {wasRevealed ? copy.reopenAction : copy.action}
          <ExternalLink aria-hidden="true" />
        </button>
        <p>{copy.actionHint}</p>
      </form>
      <aside className="claude-gift-card__privacy" role="note">
        <LockKeyhole aria-hidden="true" />
        <div>
          <h2>{copy.confidentialityTitle}</h2>
          <p>{copy.confidentialityNote}</p>
        </div>
      </aside>
    </>
  );
}

export function ClaudeGiftRewardCard({
  reward,
}: Readonly<{ reward: PartnerRewardSummary }>) {
  const { locale } = useCampaignLanguage();
  const copy = rewardCopy[locale].page;

  return (
    <section
      aria-labelledby="claude-gift-title"
      className="claude-gift-page"
    >
      <div className="claude-gift-card">
        <RewardState reward={reward} />
        <p className="claude-gift-card__disclaimer">{copy.disclaimer}</p>
        <Link className="claude-gift-card__back" href="/wallet">
          {copy.backToWallet}
        </Link>
      </div>
    </section>
  );
}
