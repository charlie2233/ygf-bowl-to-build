import type { TaskType } from "@/lib/campaign/types";

export interface ModelCatalogEntry {
  capability: string;
  friendlyLabel: string;
  id: string;
  maxCostMicroUsd: number;
  pricingMicroUsdPerMillion: {
    cachedInput: number;
    input: number;
    output: number;
  };
  providerId: string;
}

export interface FriendlyModelChoice {
  description: string;
  id: string;
  label: string;
}

export type FriendlyModelKey =
  | "balanced"
  | "fast"
  | "coding"
  | "reasoning"
  | "campaign";

/**
 * Deliberately small and server owned. Provider ids never come from a remote
 * catalog and browser callers select only these friendly ids.
 */
export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    capability: "Balanced writing and everyday reasoning",
    friendlyLabel: "Balanced guide",
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
    capability: "Fast drafts and lightweight tasks",
    friendlyLabel: "Fast and focused",
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
    capability: "Code explanation and refactoring",
    friendlyLabel: "Coding specialist",
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
    capability: "Harder multi-step reasoning",
    friendlyLabel: "Deeper reasoning",
    id: "reasoning",
    maxCostMicroUsd: 25_000,
    pricingMicroUsdPerMillion: {
      cachedInput: 25_000,
      input: 250_000,
      output: 2_000_000,
    },
    providerId: "gpt-5-mini-2025-08-07",
  },
] as const;

const CATALOG_BY_ID = new Map(
  MODEL_CATALOG.map((model) => [model.id, model]),
);

const DEFAULT_MODEL_IDS: Readonly<Record<TaskType, string>> = {
  career: "balanced",
  coding: "coding",
  "pick-my-bowl": "fast",
  study: "balanced",
};

export function recommendedModel(taskType: TaskType) {
  const model = CATALOG_BY_ID.get(DEFAULT_MODEL_IDS[taskType]);
  if (!model) {
    throw new Error("MODEL_CATALOG_INVALID");
  }
  return model;
}

export function resolveModel(
  taskType: TaskType,
  selected: unknown,
) {
  if (selected === undefined || selected === "best") {
    return recommendedModel(taskType);
  }
  if (typeof selected !== "string" || selected.length > 32) {
    throw new Error("MODEL_NOT_ALLOWED");
  }
  const model = CATALOG_BY_ID.get(selected);
  if (!model) {
    throw new Error("MODEL_NOT_ALLOWED");
  }
  return model;
}

export function friendlyModelName(providerId: string) {
  return (
    MODEL_CATALOG.find((model) => model.providerId === providerId)
      ?.friendlyLabel ?? "Campaign model"
  );
}

export function friendlyModelKey(providerId: string): FriendlyModelKey {
  const model = MODEL_CATALOG.find(
    (catalogEntry) => catalogEntry.providerId === providerId,
  );
  switch (model?.id) {
    case "balanced":
    case "fast":
    case "coding":
    case "reasoning":
      return model.id;
    default:
      return "campaign";
  }
}

export function modelChoicesForTask(
  taskType: TaskType,
): readonly FriendlyModelChoice[] {
  const recommended = recommendedModel(taskType);
  const alternatives = MODEL_CATALOG.filter(
    (model) => model.id !== recommended.id,
  );
  return [
    {
      description: recommended.capability,
      id: "best",
      label: "Best for this task",
    },
    ...alternatives.map((model) => ({
      description: model.capability,
      id: model.id,
      label: model.friendlyLabel,
    })),
  ];
}
