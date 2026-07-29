"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { AgentSetup } from "@/components/agent/agent-setup";
import { useCampaignLanguage } from "@/components/campaign-language";
import { ClaudeGiftSuccessCallout } from "@/components/reward/claude-gift";
import { TaskLauncher } from "@/components/task-launcher";
import { WalletBalance } from "@/components/wallet-balance";
import type { BrowserWallet } from "@/lib/http/campaign-dto";
import { workspaceCopy } from "@/lib/i18n/workspace";
import type { PartnerRewardSummary } from "@/lib/rewards/types";

export function RedeemSuccessView({
  reward,
}: Readonly<{ reward?: PartnerRewardSummary | null }> = {}) {
  const { locale } = useCampaignLanguage();
  const copy = workspaceCopy[locale].redeemSuccess;

  return (
    <section className="redemption-state redemption-state--success">
      <div>
        <CheckCircle2 aria-hidden="true" />
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        <div className="redemption-state__actions">
          <Link className="button button--primary button--medium" href="/wallet">
            {copy.useAi}
          </Link>
          <Link
            className="button button--secondary button--medium"
            href="/connect/agent"
          >
            {copy.connectAgent}
          </Link>
        </div>
        <Link
          className="redemption-state__advanced"
          href="/connect/agent#developer-api-key"
        >
          {copy.developerApiKey}
        </Link>
        <Link className="redemption-state__share" href="/share">
          {copy.share}
        </Link>
        {reward ? <ClaudeGiftSuccessCallout reward={reward} /> : null}
      </div>
    </section>
  );
}

export function WalletWorkspaceView({
  wallet,
}: Readonly<{ wallet: BrowserWallet }>) {
  const { locale } = useCampaignLanguage();
  const copy = workspaceCopy[locale].wallet;

  return (
    <div className="wallet-page__inner container">
      <h1>{copy.heading}</h1>
      <WalletBalance wallet={wallet} />
      <TaskLauncher />
      <section
        aria-labelledby="wallet-next-steps-title"
        className="wallet-next-steps"
      >
        <div>
          <p>{copy.nextSteps.eyebrow}</p>
          <h2 id="wallet-next-steps-title">{copy.nextSteps.title}</h2>
        </div>
        <div>
          <Link className="button button--secondary" href="/connect/agent">
            {copy.nextSteps.connectAgent}
          </Link>
          <Link className="button button--quiet" href="/share">
            {copy.nextSteps.share}
          </Link>
        </div>
      </section>
    </div>
  );
}

export function AgentConnectView({
  configuredOrigin,
  gatewayEnabled,
}: Readonly<{
  configuredOrigin: string;
  gatewayEnabled: boolean;
}>) {
  const { locale } = useCampaignLanguage();
  const copy = workspaceCopy[locale].agent;

  return (
    <section className="agent-page">
      <div className="agent-page__inner container">
        <header className="agent-page__header">
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
          <Link className="button button--secondary" href="/wallet">
            {copy.useYgfAi}
          </Link>
        </header>
        {locale === "en" ? null : (
          <p className="agent-setup__status" role="note">
            {copy.controlsLanguageNotice}
          </p>
        )}
        <div lang="en">
          <AgentSetup
            configuredOrigin={configuredOrigin}
            gatewayEnabled={gatewayEnabled}
          />
        </div>
      </div>
    </section>
  );
}
