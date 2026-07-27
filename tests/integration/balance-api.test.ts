import { describe, expect, it } from "vitest";

import { domainError } from "@/lib/campaign/types";
import { createBalanceHandler } from "@/lib/http/balance-route";
import type { CampaignRepository } from "@/lib/repositories/campaign-repository";

const wallet = {
  createdAt: "2026-07-27T12:00:00.000Z",
  expiresAt: "2026-08-10T12:00:00.000Z",
  id: "wallet-internal",
  initialBalance: 3000,
  providerCommittedMicroUsd: 1234,
  providerReservedMicroUsd: 567,
  remainingBalance: 2880,
  reservedBalance: 120,
  userId: "user-internal",
};

function handler({
  getUser = async () => ({ id: "verified-user" }),
  getWallet = async () => wallet,
}: {
  getUser?: () => Promise<{ id: string } | null>;
  getWallet?: CampaignRepository["getWallet"];
} = {}) {
  return createBalanceHandler({
    getUser,
    repository: { getWallet },
  });
}

describe("balance API boundary", () => {
  it("returns only browser-safe wallet display fields", async () => {
    const response = await handler()();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(body).toEqual({
      wallet: {
        createdAt: wallet.createdAt,
        expiresAt: wallet.expiresAt,
        initialBalance: 3000,
        remainingBalance: 2880,
        reservedBalance: 120,
      },
    });
    expect(JSON.stringify(body)).not.toContain("wallet-internal");
    expect(JSON.stringify(body)).not.toContain("user-internal");
    expect(JSON.stringify(body)).not.toContain("1234");
  });

  it("uses typed, no-store absence and outage responses", async () => {
    const unauthenticated = await handler({
      getUser: async () => null,
    })();
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("cache-control")).toBe(
      "private, no-store",
    );

    const missing = await handler({
      getWallet: async () => domainError("WALLET_NOT_FOUND"),
    })();
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe(
      "private, no-store",
    );

    const outage = await handler({
      getWallet: async () => {
        throw new Error("database unavailable");
      },
    })();
    expect(outage.status).toBe(503);
    expect(await outage.json()).toEqual({
      error: "BALANCE_UNAVAILABLE",
    });
  });
});
