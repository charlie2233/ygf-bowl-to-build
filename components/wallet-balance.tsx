"use client";

import { WalletCards } from "lucide-react";

import { useCampaignLanguage } from "@/components/campaign-language";
import type { BrowserWallet } from "@/lib/http/campaign-dto";
import {
  workspaceCopy,
  workspaceIntlLocales,
} from "@/lib/i18n/workspace";

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function WalletBalance({ wallet }: { wallet: BrowserWallet }) {
  const { locale } = useCampaignLanguage();
  const copy = workspaceCopy[locale].wallet.balance;
  const intlLocale = workspaceIntlLocales[locale];
  const usedCredits = Math.max(
    0,
    wallet.initialBalance -
      wallet.remainingBalance -
      wallet.reservedBalance,
  );
  const usedPercent =
    wallet.initialBalance === 0
      ? 0
      : Math.round((usedCredits / wallet.initialBalance) * 100);
  const formattedInitialBalance = wallet.initialBalance.toLocaleString(
    intlLocale,
  );
  const usedLabel = copy.used(usedPercent, formattedInitialBalance);

  return (
    <section
      aria-label={copy.ariaLabel}
      className="wallet-balance"
    >
      <div className="wallet-balance__summary">
        <span aria-hidden="true" className="wallet-balance__icon">
          <WalletCards />
        </span>
        <div>
          <strong>{wallet.remainingBalance.toLocaleString(intlLocale)}</strong>
          <span>{copy.remaining}</span>
          <small>{copy.expires(formatDate(wallet.expiresAt, intlLocale))}</small>
        </div>
      </div>
      <div
        aria-label={usedLabel}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={usedPercent}
        className="wallet-balance__progress"
        role="progressbar"
      >
        <span style={{ width: `${usedPercent}%` }} />
      </div>
      <p>
        {usedLabel}
        {wallet.reservedBalance > 0
          ? ` · ${copy.reserved(
              wallet.reservedBalance.toLocaleString(intlLocale),
            )}`
          : ""}
      </p>
    </section>
  );
}
