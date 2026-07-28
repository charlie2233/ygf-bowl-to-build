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
import { MODEL_CATALOG } from "@/lib/providers/model-catalog";

describe("Agent server policy", () => {
  it("derives its exact model allowlist from the server catalog", () => {
    expect(AGENT_MODEL_ALLOWLIST).toBe(MODEL_CATALOG);
    expect(resolveAgentModel("balanced")).toBe(MODEL_CATALOG[0]);
    expect(() =>
      resolveAgentModel("openai/gpt-4.1-mini"),
    ).toThrow("AGENT_MODEL_NOT_ALLOWED");
    expect(() => resolveAgentModel("unknown")).toThrow(
      "AGENT_MODEL_NOT_ALLOWED",
    );
  });

  it("converts integer micro-USD cost to credits by rounding up", () => {
    expect(DEFAULT_MICRO_USD_PER_CREDIT).toBe(84);
    expect(costMicroUsdToCredits(0)).toBe(0);
    expect(costMicroUsdToCredits(1)).toBe(1);
    expect(costMicroUsdToCredits(84)).toBe(1);
    expect(costMicroUsdToCredits(85)).toBe(2);
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

  it("shares the existing hard $0.25 wallet-wide provider cap", () => {
    expect(AGENT_WALLET_COST_CAP_MICRO_USD).toBe(250_000);
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
