import { domainError } from "@/lib/campaign/types";

export const BUILD_CREDIT_GRANT = 3_000;
export const BUILD_CREDIT_LIFETIME_DAYS = 14;
export const TASK_CREDIT_COST = 120;
export const PROVIDER_COST_CAP_MICRO_USD = 250_000;

const DAY_MS = 24 * 60 * 60 * 1_000;

interface CreditWalletSeed {
  initial: number;
  remaining: number;
  createdAt: string;
  expiresAt: string;
}

interface ReserveCreditsInput {
  remaining: number;
  amount: number;
  expiresAt: string | Date;
  now?: string | Date;
}

interface RefundCreditsInput {
  remaining: number;
  amount: number;
  maximum: number;
}

interface ReserveProviderCostInput {
  committedMicroUsd: number;
  reservedMicroUsd: number;
  amountMicroUsd: number;
}

function validNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function toValidDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return domainError("CREDIT_BALANCE_INVALID");
  }

  return date;
}

function assertTaskAmount(amount: number): void {
  if (amount !== TASK_CREDIT_COST) {
    domainError("INVALID_CREDIT_AMOUNT");
  }
}

export function createCreditWallet(
  redeemedAt: string | Date,
): CreditWalletSeed {
  const createdAt = toValidDate(redeemedAt);

  return {
    initial: BUILD_CREDIT_GRANT,
    remaining: BUILD_CREDIT_GRANT,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + BUILD_CREDIT_LIFETIME_DAYS * DAY_MS,
    ).toISOString(),
  };
}

export function isWalletExpired(
  expiresAt: string | Date,
  now: string | Date = new Date(),
) {
  return toValidDate(expiresAt).getTime() <= toValidDate(now).getTime();
}

export function reserveCredits({
  remaining,
  amount,
  expiresAt,
  now = new Date(),
}: ReserveCreditsInput): { remaining: number; reserved: number } {
  assertTaskAmount(amount);

  if (!validNonNegativeInteger(remaining)) {
    return domainError("CREDIT_BALANCE_INVALID");
  }

  if (toValidDate(now).getTime() >= toValidDate(expiresAt).getTime()) {
    return domainError("WALLET_EXPIRED");
  }

  if (remaining < amount) {
    return domainError("INSUFFICIENT_CREDITS");
  }

  return {
    remaining: remaining - amount,
    reserved: amount,
  };
}

export function refundCredits({
  remaining,
  amount,
  maximum,
}: RefundCreditsInput): { remaining: number; refunded: number } {
  assertTaskAmount(amount);

  if (
    !validNonNegativeInteger(remaining) ||
    !validNonNegativeInteger(maximum) ||
    remaining > maximum ||
    remaining + amount > maximum
  ) {
    return domainError("CREDIT_BALANCE_INVALID");
  }

  return {
    remaining: remaining + amount,
    refunded: amount,
  };
}

export function reserveProviderCost({
  committedMicroUsd,
  reservedMicroUsd,
  amountMicroUsd,
}: ReserveProviderCostInput): {
  committedMicroUsd: number;
  reservedMicroUsd: number;
  remainingCapMicroUsd: number;
} {
  if (
    !validNonNegativeInteger(committedMicroUsd) ||
    !validNonNegativeInteger(reservedMicroUsd) ||
    !validNonNegativeInteger(amountMicroUsd)
  ) {
    return domainError("PROVIDER_COST_INVALID");
  }

  const total =
    committedMicroUsd + reservedMicroUsd + amountMicroUsd;
  if (!Number.isSafeInteger(total)) {
    return domainError("PROVIDER_COST_INVALID");
  }
  if (total > PROVIDER_COST_CAP_MICRO_USD) {
    return domainError("PROVIDER_COST_LIMIT_EXCEEDED");
  }

  return {
    committedMicroUsd,
    reservedMicroUsd: reservedMicroUsd + amountMicroUsd,
    remainingCapMicroUsd: PROVIDER_COST_CAP_MICRO_USD - total,
  };
}
