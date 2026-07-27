import { describe, expect, it } from "vitest";
import {
  BUILD_CREDIT_GRANT,
  BUILD_CREDIT_LIFETIME_DAYS,
  PROVIDER_COST_CAP_MICRO_USD,
  TASK_CREDIT_COST,
  createCreditWallet,
  refundCredits,
  reserveCredits,
  reserveProviderCost,
} from "@/lib/campaign/credits";

describe("Build Credits", () => {
  const redeemedAt = new Date("2026-07-26T12:00:00.000Z");

  it("grants exactly 3,000 credits for exactly 14 days", () => {
    const wallet = createCreditWallet(redeemedAt);

    expect(BUILD_CREDIT_GRANT).toBe(3_000);
    expect(BUILD_CREDIT_LIFETIME_DAYS).toBe(14);
    expect(wallet).toEqual({
      initial: 3_000,
      remaining: 3_000,
      createdAt: "2026-07-26T12:00:00.000Z",
      expiresAt: "2026-08-09T12:00:00.000Z",
    });
  });

  it("reserves exactly 120 credits and refuses an overdraw", () => {
    expect(TASK_CREDIT_COST).toBe(120);
    expect(
      reserveCredits({
        remaining: 3_000,
        amount: 120,
        expiresAt: "2026-08-09T12:00:00.000Z",
        now: redeemedAt,
      }),
    ).toEqual({ remaining: 2_880, reserved: 120 });
    expect(() =>
      reserveCredits({
        remaining: 100,
        amount: 120,
        expiresAt: "2026-08-09T12:00:00.000Z",
        now: redeemedAt,
      }),
    ).toThrow("INSUFFICIENT_CREDITS");
    expect(() =>
      reserveCredits({
        remaining: 3_000,
        amount: 119,
        expiresAt: "2026-08-09T12:00:00.000Z",
        now: redeemedAt,
      }),
    ).toThrow("INVALID_CREDIT_AMOUNT");
  });

  it("refuses an expired wallet at the exact expiry boundary", () => {
    expect(() =>
      reserveCredits({
        remaining: 3_000,
        amount: 120,
        expiresAt: "2026-08-09T12:00:00.000Z",
        now: new Date("2026-08-09T12:00:00.000Z"),
      }),
    ).toThrow("WALLET_EXPIRED");
  });

  it("refunds a reservation without minting credits", () => {
    expect(
      refundCredits({
        remaining: 2_880,
        amount: 120,
        maximum: 3_000,
      }),
    ).toEqual({ remaining: 3_000, refunded: 120 });
    expect(() =>
      refundCredits({
        remaining: 3_000,
        amount: 120,
        maximum: 3_000,
      }),
    ).toThrow("CREDIT_BALANCE_INVALID");
  });
});

describe("provider USD accounting", () => {
  it("uses integer micro-US dollars and enforces a $0.25 user ceiling", () => {
    expect(PROVIDER_COST_CAP_MICRO_USD).toBe(250_000);
    expect(
      reserveProviderCost({
        committedMicroUsd: 200_000,
        reservedMicroUsd: 20_000,
        amountMicroUsd: 30_000,
      }),
    ).toEqual({
      committedMicroUsd: 200_000,
      reservedMicroUsd: 50_000,
      remainingCapMicroUsd: 0,
    });
    expect(() =>
      reserveProviderCost({
        committedMicroUsd: 200_000,
        reservedMicroUsd: 20_000,
        amountMicroUsd: 30_001,
      }),
    ).toThrow("PROVIDER_COST_LIMIT_EXCEEDED");
    expect(() =>
      reserveProviderCost({
        committedMicroUsd: 0.1,
        reservedMicroUsd: 0,
        amountMicroUsd: 1,
      }),
    ).toThrow("PROVIDER_COST_INVALID");
  });
});
