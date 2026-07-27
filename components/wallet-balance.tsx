import { WalletCards } from "lucide-react";

import type { CreditWallet } from "@/lib/campaign/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function WalletBalance({ wallet }: { wallet: CreditWallet }) {
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

  return (
    <section
      aria-label="Your AI balance"
      className="wallet-balance"
    >
      <div className="wallet-balance__summary">
        <span aria-hidden="true" className="wallet-balance__icon">
          <WalletCards />
        </span>
        <div>
          <strong>{wallet.remainingBalance.toLocaleString("en-US")}</strong>
          <span>Build Credits remaining</span>
          <small>Expires {formatDate(wallet.expiresAt)}</small>
        </div>
      </div>
      <div
        aria-label={`${usedPercent}% of ${wallet.initialBalance.toLocaleString("en-US")} credits used`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={usedPercent}
        className="wallet-balance__progress"
        role="progressbar"
      >
        <span style={{ width: `${usedPercent}%` }} />
      </div>
      <p>
        {usedPercent}% of{" "}
        {wallet.initialBalance.toLocaleString("en-US")} credits used
        {wallet.reservedBalance > 0
          ? ` · ${wallet.reservedBalance} reserved`
          : ""}
      </p>
    </section>
  );
}
