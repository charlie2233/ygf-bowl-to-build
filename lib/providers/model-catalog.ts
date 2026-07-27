import type { TaskType } from "@/lib/campaign/types";

export interface ModelCatalogEntry {
  capability: string;
  friendlyLabel: string;
  id: string;
  maxCostMicroUsd: number;
  providerId: string;
}

export interface FriendlyModelChoice {
  description: string;
  id: string;
  label: string;
}

/**
 * Deliberately small and server owned. Provider ids never come from a remote
 * catalog and browser callers select only these friendly ids.
 */
export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    capability: "Balanced writing and everyday reasoning",
    friendlyLabel: "Balanced guide",
    id: "balanced",
    maxCostMicroUsd: 12_000,
    providerId: "openai/gpt-4.1-mini",
  },
  {
    capability: "Fast drafts and lightweight tasks",
    friendlyLabel: "Fast and focused",
    id: "fast",
    maxCostMicroUsd: 8_000,
    providerId: "google/gemini-2.5-flash-lite",
  },
  {
    capability: "Code explanation and refactoring",
    friendlyLabel: "Coding specialist",
    id: "coding",
    maxCostMicroUsd: 18_000,
    providerId: "qwen/qwen3-coder",
  },
  {
    capability: "Harder multi-step reasoning",
    friendlyLabel: "Deeper reasoning",
    id: "reasoning",
    maxCostMicroUsd: 20_000,
    providerId: "deepseek/deepseek-r1-0528",
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
