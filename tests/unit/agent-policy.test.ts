import { describe, expect, it } from "vitest";

import {
  AGENT_KEY_MAX_AGE_DAYS,
  AGENT_MODEL_ALLOWLIST,
  AGENT_REQUEST_LIMITS,
  AGENT_WALLET_COST_CAP_MICRO_USD,
  DEFAULT_MAXIMUM_ACTIVE_KEYS_PER_WALLET,
  DEFAULT_MICRO_USD_PER_CREDIT,
  MAXIMUM_ACTIVE_KEYS_PER_WALLET,
  MINIMUM_ACTIVE_KEYS_PER_WALLET,
  assertAgentCapacity,
  assertAgentRequestBounds,
  costMicroUsdToCredits,
  resolveAgentApiKeyExpiry,
  resolveMaximumActiveKeysPerWallet,
  resolveAgentModel,
} from "@/lib/agent/policy";
import { PROVIDER_COST_CAP_MICRO_USD } from "@/lib/campaign/credits";
import { AGENT_MODEL_CATALOG } from "@/lib/agent/model-catalog";
import {
  AGENT_MODEL_CHOICES,
  DEFAULT_AGENT_MODEL_ID,
} from "@/lib/agent/models";

describe("Agent server policy", () => {
  it("uses a separate canonical GPT-5.6 allowlist with safe legacy aliases", () => {
    expect(AGENT_MODEL_ALLOWLIST).toBe(AGENT_MODEL_CATALOG);
    expect(AGENT_MODEL_ALLOWLIST.map((model) => model.id)).toEqual([
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
    ]);
    expect(AGENT_MODEL_CHOICES.map((model) => model.id)).toEqual(
      AGENT_MODEL_ALLOWLIST.map((model) => model.id),
    );
    expect(DEFAULT_AGENT_MODEL_ID).toBe("gpt-5.6-terra");
    expect(
      AGENT_MODEL_ALLOWLIST.map((model) => ({
        ceiling: model.maxCostMicroUsd,
        effort: model.reasoningEffort,
        id: model.id,
        pricing: model.pricingMicroUsdPerMillion,
      })),
    ).toEqual([
      {
        ceiling: 25_000,
        effort: "medium",
        id: "gpt-5.6-luna",
        pricing: {
          cacheWrite: 250_000,
          cachedInput: 20_000,
          input: 200_000,
          output: 1_200_000,
        },
      },
      {
        ceiling: 250_000,
        effort: "medium",
        id: "gpt-5.6-terra",
        pricing: {
          cacheWrite: 2_500_000,
          cachedInput: 200_000,
          input: 2_000_000,
          output: 12_000_000,
        },
      },
      {
        ceiling: 500_000,
        effort: "medium",
        id: "gpt-5.6-sol",
        pricing: {
          cacheWrite: 6_250_000,
          cachedInput: 500_000,
          input: 5_000_000,
          output: 30_000_000,
        },
      },
    ]);
    expect(resolveAgentModel("fast").id).toBe("gpt-5.6-luna");
    expect(resolveAgentModel("balanced").id).toBe("gpt-5.6-terra");
    expect(resolveAgentModel("coding").id).toBe("gpt-5.6-terra");
    expect(resolveAgentModel("reasoning").id).toBe("gpt-5.6-sol");
    expect(resolveAgentModel("gpt-5.6-sol").id).toBe("gpt-5.6-sol");
    expect(() =>
      resolveAgentModel("gpt-4.1-mini-2025-04-14"),
    ).toThrow("AGENT_MODEL_NOT_ALLOWED");
    expect(() => resolveAgentModel("unknown")).toThrow(
      "AGENT_MODEL_NOT_ALLOWED",
    );
  });

  it("converts integer micro-USD cost to credits by rounding up", () => {
    expect(DEFAULT_MICRO_USD_PER_CREDIT).toBe(1_000);
    expect(costMicroUsdToCredits(0)).toBe(0);
    expect(costMicroUsdToCredits(1)).toBe(1);
    expect(costMicroUsdToCredits(1_000)).toBe(1);
    expect(costMicroUsdToCredits(1_001)).toBe(2);
    expect(costMicroUsdToCredits(199, 100)).toBe(2);
    expect(() => costMicroUsdToCredits(-1)).toThrow(
      "AGENT_COST_POLICY_INVALID",
    );
    expect(() => costMicroUsdToCredits(1, 0)).toThrow(
      "AGENT_COST_POLICY_INVALID",
    );
    expect(() =>
      costMicroUsdToCredits(1, Number.MAX_SAFE_INTEGER + 1),
    ).toThrow("AGENT_COST_POLICY_INVALID");
  });

  it("caps key lifetime at the earlier of fourteen days and wallet expiry", () => {
    const createdAt = new Date("2026-07-27T12:00:00.000Z");

    expect(AGENT_KEY_MAX_AGE_DAYS).toBe(14);
    expect(
      resolveAgentApiKeyExpiry({
        createdAt,
        walletExpiresAt: "2026-08-30T12:00:00.000Z",
      }),
    ).toBe("2026-08-10T12:00:00.000Z");
    expect(
      resolveAgentApiKeyExpiry({
        createdAt,
        walletExpiresAt: "2026-08-02T12:00:00.000Z",
      }),
    ).toBe("2026-08-02T12:00:00.000Z");
    expect(() =>
      resolveAgentApiKeyExpiry({
        createdAt,
        walletExpiresAt: createdAt,
      }),
    ).toThrow("AGENT_WALLET_EXPIRED");
  });

  it("shares the hard $3 wallet-wide provider cap", () => {
    expect(AGENT_WALLET_COST_CAP_MICRO_USD).toBe(3_000_000);
    expect(AGENT_WALLET_COST_CAP_MICRO_USD).toBe(
      PROVIDER_COST_CAP_MICRO_USD,
    );
  });

  it("uses conservative fixed request bounds and bounded key configuration", () => {
    expect(AGENT_REQUEST_LIMITS).toEqual({
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
    expect(MINIMUM_ACTIVE_KEYS_PER_WALLET).toBe(1);
    expect(DEFAULT_MAXIMUM_ACTIVE_KEYS_PER_WALLET).toBe(3);
    expect(MAXIMUM_ACTIVE_KEYS_PER_WALLET).toBe(4);
    expect(resolveMaximumActiveKeysPerWallet()).toBe(3);
    expect(resolveMaximumActiveKeysPerWallet(1)).toBe(1);
    expect(resolveMaximumActiveKeysPerWallet(4)).toBe(4);
    expect(() => resolveMaximumActiveKeysPerWallet(0)).toThrow(
      "AGENT_KEY_LIMIT_INVALID",
    );
    expect(() => resolveMaximumActiveKeysPerWallet(5)).toThrow(
      "AGENT_KEY_LIMIT_INVALID",
    );
  });

  it("enforces strict rolling-rate and concurrent request capacity", () => {
    expect(() =>
      assertAgentCapacity({
        activeKeyRequests:
          AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerKey - 1,
        activeWalletRequests:
          AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerWallet - 1,
        requestsInCurrentMinute:
          AGENT_REQUEST_LIMITS.maximumRequestsPerMinute - 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertAgentCapacity({
        activeKeyRequests: 0,
        activeWalletRequests: 0,
        requestsInCurrentMinute:
          AGENT_REQUEST_LIMITS.maximumRequestsPerMinute,
      }),
    ).toThrow("AGENT_RATE_LIMIT_EXCEEDED");
    expect(() =>
      assertAgentCapacity({
        activeKeyRequests:
          AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerKey,
        activeWalletRequests: 0,
        requestsInCurrentMinute: 0,
      }),
    ).toThrow("AGENT_KEY_CONCURRENCY_EXCEEDED");
    expect(() =>
      assertAgentCapacity({
        activeKeyRequests: 0,
        activeWalletRequests:
          AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerWallet,
        requestsInCurrentMinute: 0,
      }),
    ).toThrow("AGENT_WALLET_CONCURRENCY_EXCEEDED");
  });

  it("bounds body, message, and token input at exact safe-integer edges", () => {
    expect(() =>
      assertAgentRequestBounds({
        bodyBytes: AGENT_REQUEST_LIMITS.maximumBodyBytes,
        messageCharacterCounts: Array.from(
          { length: AGENT_REQUEST_LIMITS.maximumMessages },
          () => 1,
        ),
        requestedOutputTokens:
          AGENT_REQUEST_LIMITS.maximumOutputTokens,
      }),
    ).not.toThrow();
    expect(() =>
      assertAgentRequestBounds({
        bodyBytes: AGENT_REQUEST_LIMITS.maximumBodyBytes + 1,
        messageCharacterCounts: [1],
        requestedOutputTokens: 1,
      }),
    ).toThrow("AGENT_BODY_TOO_LARGE");
    expect(() =>
      assertAgentRequestBounds({
        bodyBytes: 1,
        messageCharacterCounts: Array.from(
          { length: AGENT_REQUEST_LIMITS.maximumMessages + 1 },
          () => 1,
        ),
        requestedOutputTokens: 1,
      }),
    ).toThrow("AGENT_MESSAGES_INVALID");
    expect(() =>
      assertAgentRequestBounds({
        bodyBytes: 1,
        messageCharacterCounts: [
          AGENT_REQUEST_LIMITS.maximumCharactersPerMessage,
          AGENT_REQUEST_LIMITS.maximumCharactersPerMessage,
          AGENT_REQUEST_LIMITS.maximumCharactersPerMessage,
          AGENT_REQUEST_LIMITS.maximumCharactersPerMessage,
          1,
        ],
        requestedOutputTokens: 1,
      }),
    ).toThrow("AGENT_MESSAGES_INVALID");
    expect(() =>
      assertAgentRequestBounds({
        bodyBytes: 1,
        messageCharacterCounts: [
          AGENT_REQUEST_LIMITS.maximumCharactersPerMessage + 1,
        ],
        requestedOutputTokens: 1,
      }),
    ).toThrow("AGENT_MESSAGES_INVALID");
    expect(() =>
      assertAgentRequestBounds({
        bodyBytes: 1,
        messageCharacterCounts: [1],
        requestedOutputTokens:
          AGENT_REQUEST_LIMITS.maximumOutputTokens + 1,
      }),
    ).toThrow("AGENT_TOKEN_LIMIT_EXCEEDED");
  });
});
