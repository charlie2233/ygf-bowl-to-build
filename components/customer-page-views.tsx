"use client";

import { Bot } from "lucide-react";
import Link from "next/link";

import { useCampaignLanguage } from "@/components/campaign-language";
import { RedemptionState } from "@/components/redemption-state";
import { ShareCardBuilder } from "@/components/share/share-card-builder";
import {
  customerPageIntlLocales,
  customerPagesCopy,
  type RedemptionStateKey,
} from "@/lib/i18n/customer-pages";
import type { TaskOutput } from "@/lib/providers/provider";
import type { FriendlyModelKey } from "@/lib/providers/model-catalog";
import type { ShareCardTaskType } from "@/lib/share/card";

export interface HistoryDisplaySession {
  createdAt: string;
  modelLabelKey: FriendlyModelKey;
  savedOutput?: TaskOutput;
  status: "completed" | "failed";
  title: string;
}

export function LocalizedRedemptionState({
  state,
}: Readonly<{ state: RedemptionStateKey }>) {
  const { locale } = useCampaignLanguage();
  const copy = customerPagesCopy[locale].terminal[state];

  return (
    <RedemptionState
      action={state === "alreadyUsed" ? "/wallet" : "/redeem"}
      actionLabel={copy.actionLabel}
      title={copy.title}
    >
      {copy.description}
    </RedemptionState>
  );
}

export function HistoryPageView({
  agentEligible,
  sessions,
}: Readonly<{
  agentEligible: boolean;
  sessions: readonly HistoryDisplaySession[];
}>) {
  const { locale } = useCampaignLanguage();
  const copy = customerPagesCopy[locale].history;
  const formatter = new Intl.DateTimeFormat(
    customerPageIntlLocales[locale],
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Los_Angeles",
    },
  );

  return (
    <section className="history-page container">
      <header>
        <div>
          <Link href="/wallet">{copy.backToWallet}</Link>
          <h1>{copy.title}</h1>
          <p>{copy.privacyDescription}</p>
        </div>
      </header>

      {sessions.length === 0 ? (
        <div className="history-empty">
          <h2>{copy.emptyTitle}</h2>
          <p>{copy.emptyDescription}</p>
          <Link className="button button--primary" href="/wallet">
            {copy.emptyAction}
          </Link>
        </div>
      ) : (
        <ol className="history-list">
          {sessions.map((session, sessionIndex) => (
            <li key={`${session.createdAt}-${sessionIndex}`}>
              <header>
                <div>
                  <h2>{session.title}</h2>
                  <p>
                    <time
                      dateTime={session.createdAt}
                      suppressHydrationWarning
                    >
                      {formatter.format(new Date(session.createdAt))}
                    </time>{" "}
                    ·{" "}
                    {copy.models[session.modelLabelKey]}
                  </p>
                </div>
                <span data-status={session.status}>
                  {copy.statuses[session.status]}
                </span>
              </header>
              {session.savedOutput ? (
                <div className="history-list__saved">
                  {session.savedOutput.sections.map(
                    (section, sectionIndex) => (
                      <section
                        key={`${section.heading}-${sectionIndex}`}
                      >
                        <h3>{section.heading}</h3>
                        <ul>
                          {section.items.map((item, itemIndex) => (
                            <li key={`${item}-${itemIndex}`}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ),
                  )}
                </div>
              ) : (
                <p className="history-list__privacy">
                  {copy.resultNotSaved}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {agentEligible ? (
        <aside className="partner-cta">
          <Bot aria-hidden="true" />
          <div>
            <strong>{copy.agent.title}</strong>
            <span>{copy.agent.description}</span>
          </div>
          <Link href="/connect/agent">{copy.agent.action}</Link>
        </aside>
      ) : null}
    </section>
  );
}

export function SharePageView({
  firstTaskType,
}: Readonly<{ firstTaskType?: ShareCardTaskType }>) {
  const { locale } = useCampaignLanguage();
  const copy = customerPagesCopy[locale].share.page;

  return (
    <section className="share-page">
      <div className="container">
        <header className="share-page__intro">
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </header>
        <ShareCardBuilder firstTaskType={firstTaskType} />
      </div>
    </section>
  );
}
