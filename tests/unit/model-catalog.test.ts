import { describe, expect, it } from "vitest";

import {
  MODEL_CATALOG,
  modelChoicesForTask,
  recommendedModel,
  resolveModel,
} from "@/lib/providers/model-catalog";

describe("server-owned model catalog", () => {
  it("uses a small, exact allowlist with friendly capability labels", () => {
    expect(MODEL_CATALOG).toHaveLength(4);
    expect(
      MODEL_CATALOG.every(
        (model) =>
          model.id.length > 0 &&
          model.friendlyLabel.length > 0 &&
          /^gpt-[a-z0-9.-]+-\d{4}-\d{2}-\d{2}$/u.test(
            model.providerId,
          ) &&
          Number.isSafeInteger(model.maxCostMicroUsd) &&
          model.maxCostMicroUsd > 0 &&
          Object.values(model.pricingMicroUsdPerMillion).every(
            (price) =>
              Number.isSafeInteger(price) && price >= 0,
          ),
      ),
    ).toBe(true);
    expect(
      MODEL_CATALOG.map((model) => ({
        id: model.id,
        maxCostMicroUsd: model.maxCostMicroUsd,
        pricingMicroUsdPerMillion:
          model.pricingMicroUsdPerMillion,
        providerId: model.providerId,
      })),
    ).toEqual([
      {
        id: "balanced",
        maxCostMicroUsd: 70_000,
        pricingMicroUsdPerMillion: {
          cachedInput: 75_000,
          input: 750_000,
          output: 4_500_000,
        },
        providerId: "gpt-5.4-mini-2026-03-17",
      },
      {
        id: "fast",
        maxCostMicroUsd: 25_000,
        pricingMicroUsdPerMillion: {
          cachedInput: 20_000,
          input: 200_000,
          output: 1_250_000,
        },
        providerId: "gpt-5.4-nano-2026-03-17",
      },
      {
        id: "coding",
        maxCostMicroUsd: 35_000,
        pricingMicroUsdPerMillion: {
          cachedInput: 100_000,
          input: 400_000,
          output: 1_600_000,
        },
        providerId: "gpt-4.1-mini-2025-04-14",
      },
      {
        id: "reasoning",
        maxCostMicroUsd: 25_000,
        pricingMicroUsdPerMillion: {
          cachedInput: 25_000,
          input: 250_000,
          output: 2_000_000,
        },
        providerId: "gpt-5-mini-2025-08-07",
      },
    ]);
  });

  it("defaults each task to a recommended allowlisted model", () => {
    expect(recommendedModel("study").id).toBe("balanced");
    expect(recommendedModel("coding").id).toBe("coding");
    expect(recommendedModel("career").id).toBe("balanced");
    expect(recommendedModel("pick-my-bowl").id).toBe("fast");
  });

  it("resolves only friendly selection ids, never arbitrary provider ids", () => {
    expect(resolveModel("study", undefined)).toBe(
      recommendedModel("study"),
    );
    expect(resolveModel("study", "best")).toBe(
      recommendedModel("study"),
    );
    expect(resolveModel("study", "fast").id).toBe("fast");
    expect(() =>
      resolveModel("study", "unlisted/provider-model"),
    ).toThrow("MODEL_NOT_ALLOWED");
    expect(() =>
      resolveModel("study", "gpt-4.1-mini-2025-04-14"),
    ).toThrow("MODEL_NOT_ALLOWED");
  });

  it("provides a bounded, friendly selector without provider ids", () => {
    const choices = modelChoicesForTask("coding");
    expect(choices[0]).toMatchObject({
      id: "best",
      label: "Best for this task",
    });
    expect(JSON.stringify(choices)).not.toContain("gpt-");
  });
});
