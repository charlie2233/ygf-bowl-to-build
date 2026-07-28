import {
  AGENT_MODEL_ALLOWLIST,
  AGENT_REQUEST_LIMITS,
  assertAgentRequestBounds,
  resolveAgentModel,
} from "@/lib/agent/policy";
import type { ModelCatalogEntry } from "@/lib/providers/model-catalog";

export type AgentChatRole = "assistant" | "system" | "user";

export interface AgentChatMessage {
  content: string;
  role: AgentChatRole;
}

export interface ParsedAgentChatRequest {
  maxTokens: number;
  messages: readonly AgentChatMessage[];
  model: ModelCatalogEntry;
  temperature: number;
}

const BODY_KEYS = new Set([
  "max_tokens",
  "messages",
  "model",
  "n",
  "stream",
  "temperature",
  "user",
]);
const MESSAGE_KEYS = new Set(["content", "role"]);
const ROLES = new Set<AgentChatRole>([
  "assistant",
  "system",
  "user",
]);

function plainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 1 &&
    value.length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  );
}

export function parseAgentChatRequest(
  value: unknown,
  bodyBytes: number,
): ParsedAgentChatRequest {
  if (
    !plainRecord(value) ||
    Object.keys(value).some((key) => !BODY_KEYS.has(key)) ||
    value.stream === true ||
    (value.stream !== undefined && value.stream !== false) ||
    (value.n !== undefined && value.n !== 1) ||
    (value.user !== undefined && !safeText(value.user, 128)) ||
    !Array.isArray(value.messages)
  ) {
    throw new Error("OPENAI_REQUEST_INVALID");
  }

  const messages = value.messages.map((item) => {
    if (
      !plainRecord(item) ||
      Object.keys(item).some((key) => !MESSAGE_KEYS.has(key)) ||
      !ROLES.has(item.role as AgentChatRole) ||
      !safeText(
        item.content,
        AGENT_REQUEST_LIMITS.maximumCharactersPerMessage,
      )
    ) {
      throw new Error("OPENAI_REQUEST_INVALID");
    }
    return {
      content: (item.content as string).trim(),
      role: item.role as AgentChatRole,
    };
  });
  if (!messages.some((message) => message.role === "user")) {
    throw new Error("OPENAI_REQUEST_INVALID");
  }

  const maxTokens =
    value.max_tokens === undefined
      ? AGENT_REQUEST_LIMITS.defaultOutputTokens
      : value.max_tokens;
  if (
    typeof maxTokens !== "number" ||
    !Number.isFinite(maxTokens) ||
    !Number.isSafeInteger(maxTokens)
  ) {
    throw new Error("OPENAI_REQUEST_INVALID");
  }
  assertAgentRequestBounds({
    bodyBytes,
    messageCharacterCounts: messages.map(
      (message) => message.content.length,
    ),
    requestedOutputTokens: maxTokens,
  });

  const temperature =
    value.temperature === undefined ? 0.25 : value.temperature;
  if (
    typeof temperature !== "number" ||
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 1
  ) {
    throw new Error("OPENAI_REQUEST_INVALID");
  }

  return {
    maxTokens,
    messages,
    model: resolveAgentModel(value.model),
    temperature,
  };
}

export function openAiModelList() {
  return {
    data: AGENT_MODEL_ALLOWLIST.map((model) => ({
      created: 1_785_107_200,
      id: model.id,
      object: "model" as const,
      owned_by: "ygf",
    })),
    object: "list" as const,
  };
}
