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
          model.providerId.includes("/") &&
          Number.isSafeInteger(model.maxCostMicroUsd) &&
          model.maxCostMicroUsd > 0,
      ),
    ).toBe(true);
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
      resolveModel("study", "openai/gpt-4.1-mini"),
    ).toThrow("MODEL_NOT_ALLOWED");
  });

  it("provides a bounded, friendly selector without provider ids", () => {
    const choices = modelChoicesForTask("coding");
    expect(choices[0]).toMatchObject({
      id: "best",
      label: "Best for this task",
    });
    expect(JSON.stringify(choices)).not.toContain("openai/");
    expect(JSON.stringify(choices)).not.toContain("google/");
    expect(JSON.stringify(choices)).not.toContain("qwen/");
    expect(JSON.stringify(choices)).not.toContain("deepseek/");
  });
});
