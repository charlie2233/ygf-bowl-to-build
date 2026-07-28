import type { ModelCatalogEntry } from "@/lib/providers/model-catalog";
import {
  MODEL_CATALOG,
} from "@/lib/providers/model-catalog";
import { PROVIDER_COST_CAP_MICRO_USD } from "@/lib/campaign/credits";

export const AGENT_MODEL_ALLOWLIST = MODEL_CATALOG;

export const DEFAULT_MICRO_USD_PER_CREDIT = 1_000;
export const AGENT_WALLET_COST_CAP_MICRO_USD =
  PROVIDER_COST_CAP_MICRO_USD;

export const AGENT_KEY_MAX_AGE_DAYS = 14;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

export const MINIMUM_ACTIVE_KEYS_PER_WALLET = 1;
export const DEFAULT_MAXIMUM_ACTIVE_KEYS_PER_WALLET = 3;
export const MAXIMUM_ACTIVE_KEYS_PER_WALLET = 4;

export const AGENT_REQUEST_LIMITS = Object.freeze({
  defaultOutputTokens: 800,
  maximumBodyBytes: 64 * 1_024,
  maximumCharactersPerMessage: 8_000,
  maximumConcurrentRequestsPerKey: 2,
  maximumConcurrentRequestsPerWallet: 3,
  maximumMessages: 24,
  maximumOutputTokens: 1_800,
  maximumRequestsPerMinute: 12,
  maximumTotalMessageCharacters: 32_000,
  minimumMessages: 1,
  minimumOutputTokens: 1,
});

interface ResolveAgentApiKeyExpiryInput {
  readonly createdAt: string | Date;
  readonly walletExpiresAt: string | Date;
}

interface AgentCapacityInput {
  readonly activeKeyRequests: number;
  readonly activeWalletRequests: number;
  readonly requestsInCurrentMinute: number;
}

interface AgentRequestBoundsInput {
  readonly bodyBytes: number;
  readonly messageCharacterCounts: readonly number[];
  readonly requestedOutputTokens: number;
}

function safeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validDate(value: string | Date): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("AGENT_KEY_LIFECYCLE_INVALID");
  }
  return date;
}

export function resolveAgentModel(
  selected: unknown,
): ModelCatalogEntry {
  if (
    typeof selected !== "string" ||
    selected.length === 0 ||
    selected.length > 32
  ) {
    throw new Error("AGENT_MODEL_NOT_ALLOWED");
  }

  const model = AGENT_MODEL_ALLOWLIST.find(
    (candidate) => candidate.id === selected,
  );
  if (!model) {
    throw new Error("AGENT_MODEL_NOT_ALLOWED");
  }
  return model;
}

export function costMicroUsdToCredits(
  costMicroUsd: number,
  microUsdPerCredit = DEFAULT_MICRO_USD_PER_CREDIT,
): number {
  if (
    !safeNonNegativeInteger(costMicroUsd) ||
    !Number.isSafeInteger(microUsdPerCredit) ||
    microUsdPerCredit <= 0
  ) {
    throw new Error("AGENT_COST_POLICY_INVALID");
  }

  return Math.ceil(costMicroUsd / microUsdPerCredit);
}

export function resolveAgentApiKeyExpiry({
  createdAt,
  walletExpiresAt,
}: ResolveAgentApiKeyExpiryInput): string {
  const created = validDate(createdAt);
  const walletExpiry = validDate(walletExpiresAt);
  if (walletExpiry.getTime() <= created.getTime()) {
    throw new Error("AGENT_WALLET_EXPIRED");
  }

  const maximumKeyExpiry =
    created.getTime() +
    AGENT_KEY_MAX_AGE_DAYS * DAY_MILLISECONDS;
  if (!Number.isSafeInteger(maximumKeyExpiry)) {
    throw new Error("AGENT_KEY_LIFECYCLE_INVALID");
  }

  return new Date(
    Math.min(maximumKeyExpiry, walletExpiry.getTime()),
  ).toISOString();
}

export function resolveMaximumActiveKeysPerWallet(
  configured = DEFAULT_MAXIMUM_ACTIVE_KEYS_PER_WALLET,
): number {
  if (
    !Number.isSafeInteger(configured) ||
    configured < MINIMUM_ACTIVE_KEYS_PER_WALLET ||
    configured > MAXIMUM_ACTIVE_KEYS_PER_WALLET
  ) {
    throw new Error("AGENT_KEY_LIMIT_INVALID");
  }
  return configured;
}

export function assertAgentCapacity({
  activeKeyRequests,
  activeWalletRequests,
  requestsInCurrentMinute,
}: AgentCapacityInput): void {
  if (
    !safeNonNegativeInteger(activeKeyRequests) ||
    !safeNonNegativeInteger(activeWalletRequests) ||
    !safeNonNegativeInteger(requestsInCurrentMinute)
  ) {
    throw new Error("AGENT_CAPACITY_INVALID");
  }
  if (
    requestsInCurrentMinute >=
    AGENT_REQUEST_LIMITS.maximumRequestsPerMinute
  ) {
    throw new Error("AGENT_RATE_LIMIT_EXCEEDED");
  }
  if (
    activeKeyRequests >=
    AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerKey
  ) {
    throw new Error("AGENT_KEY_CONCURRENCY_EXCEEDED");
  }
  if (
    activeWalletRequests >=
    AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerWallet
  ) {
    throw new Error("AGENT_WALLET_CONCURRENCY_EXCEEDED");
  }
}

export function assertAgentRequestBounds({
  bodyBytes,
  messageCharacterCounts,
  requestedOutputTokens,
}: AgentRequestBoundsInput): void {
  if (
    !Number.isSafeInteger(bodyBytes) ||
    bodyBytes < 1 ||
    bodyBytes > AGENT_REQUEST_LIMITS.maximumBodyBytes
  ) {
    throw new Error("AGENT_BODY_TOO_LARGE");
  }

  if (
    !Array.isArray(messageCharacterCounts) ||
    messageCharacterCounts.length <
      AGENT_REQUEST_LIMITS.minimumMessages ||
    messageCharacterCounts.length >
      AGENT_REQUEST_LIMITS.maximumMessages
  ) {
    throw new Error("AGENT_MESSAGES_INVALID");
  }

  let totalCharacters = 0;
  for (const characterCount of messageCharacterCounts) {
    if (
      !Number.isSafeInteger(characterCount) ||
      characterCount < 1 ||
      characterCount >
        AGENT_REQUEST_LIMITS.maximumCharactersPerMessage
    ) {
      throw new Error("AGENT_MESSAGES_INVALID");
    }
    totalCharacters += characterCount;
    if (
      !Number.isSafeInteger(totalCharacters) ||
      totalCharacters >
        AGENT_REQUEST_LIMITS.maximumTotalMessageCharacters
    ) {
      throw new Error("AGENT_MESSAGES_INVALID");
    }
  }

  if (
    !Number.isSafeInteger(requestedOutputTokens) ||
    requestedOutputTokens <
      AGENT_REQUEST_LIMITS.minimumOutputTokens ||
    requestedOutputTokens >
      AGENT_REQUEST_LIMITS.maximumOutputTokens
  ) {
    throw new Error("AGENT_TOKEN_LIMIT_EXCEEDED");
  }
}
