import type { ModelCatalogEntry } from "@/lib/providers/model-catalog";

/**
 * Agent-only allowlist. Prices are standard OpenAI API prices expressed as
 * micro-USD per one million tokens. GPT-5.6 cache writes cost 1.25x input.
 */
export const AGENT_MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    capability: "Fast and affordable for everyday, high-volume work",
    friendlyLabel: "GPT-5.6 Luna",
    id: "gpt-5.6-luna",
    maxCostMicroUsd: 25_000,
    pricingMicroUsdPerMillion: {
      cacheWrite: 250_000,
      cachedInput: 20_000,
      input: 200_000,
      output: 1_200_000,
    },
    providerId: "gpt-5.6-luna",
    reasoningEffort: "medium",
  },
  {
    capability: "Balanced intelligence and cost for most Agent tasks",
    friendlyLabel: "GPT-5.6 Terra",
    id: "gpt-5.6-terra",
    maxCostMicroUsd: 250_000,
    pricingMicroUsdPerMillion: {
      cacheWrite: 2_500_000,
      cachedInput: 200_000,
      input: 2_000_000,
      output: 12_000_000,
    },
    providerId: "gpt-5.6-terra",
    reasoningEffort: "medium",
  },
  {
    capability: "Frontier capability for complex reasoning and coding",
    friendlyLabel: "GPT-5.6 Sol",
    id: "gpt-5.6-sol",
    maxCostMicroUsd: 500_000,
    pricingMicroUsdPerMillion: {
      cacheWrite: 6_250_000,
      cachedInput: 500_000,
      input: 5_000_000,
      output: 30_000_000,
    },
    providerId: "gpt-5.6-sol",
    reasoningEffort: "medium",
  },
] as const;

export const LEGACY_AGENT_MODEL_ALIASES = Object.freeze({
  balanced: "gpt-5.6-terra",
  coding: "gpt-5.6-terra",
  fast: "gpt-5.6-luna",
  reasoning: "gpt-5.6-sol",
} as const);
