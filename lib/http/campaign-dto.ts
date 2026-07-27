import type { CreditWallet } from "@/lib/campaign/types";

export interface BrowserWallet {
  createdAt: string;
  expiresAt: string;
  initialBalance: number;
  remainingBalance: number;
  reservedBalance: number;
}

export function toBrowserWallet(wallet: CreditWallet): BrowserWallet {
  return {
    createdAt: wallet.createdAt,
    expiresAt: wallet.expiresAt,
    initialBalance: wallet.initialBalance,
    remainingBalance: wallet.remainingBalance,
    reservedBalance: wallet.reservedBalance,
  };
}
