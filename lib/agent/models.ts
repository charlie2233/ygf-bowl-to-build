export const AGENT_MODEL_CHOICES = [
  {
    description: "Fast and affordable for everyday, high-volume work.",
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
  },
  {
    description: "Balanced intelligence and cost for most Agent tasks.",
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
  },
  {
    description: "Frontier capability for complex reasoning and coding.",
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
  },
] as const;

export type AgentModelId =
  (typeof AGENT_MODEL_CHOICES)[number]["id"];

export const DEFAULT_AGENT_MODEL_ID: AgentModelId =
  "gpt-5.6-terra";

const AGENT_MODEL_IDS = new Set<string>(
  AGENT_MODEL_CHOICES.map((model) => model.id),
);

export function isAgentModelId(value: unknown): value is AgentModelId {
  return typeof value === "string" && AGENT_MODEL_IDS.has(value);
}
