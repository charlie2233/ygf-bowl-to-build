import { resolveAuthRuntime } from "@/lib/auth/runtime";
import type { AgentChatMessage } from "@/lib/agent/openai-contract";
import type { ModelCatalogEntry } from "@/lib/providers/model-catalog";
import { OpenAIChatClient } from "@/lib/providers/openai-chat-client";

export interface AgentProviderInput {
  maxTokens: number;
  messages: readonly AgentChatMessage[];
  model: ModelCatalogEntry;
  requestTraceId: string;
  safetyIdentifier: string;
  temperature: number;
}

export interface AgentProviderResult {
  content: string;
  inputUnits: number;
  model: string;
  outputUnits: number;
  providerCostMicroUsd?: number;
  requestId: string;
}

export interface AgentChatProvider {
  readonly name: string;
  run(input: AgentProviderInput): Promise<AgentProviderResult>;
}

export class AgentProviderError extends Error {
  constructor() {
    super("PROVIDER_UNAVAILABLE");
    this.name = "AgentProviderError";
  }
}

export class DemoAgentChatProvider implements AgentChatProvider {
  readonly name = "demo";

  async run(input: AgentProviderInput): Promise<AgentProviderResult> {
    const latest = [...input.messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!latest) {
      throw new AgentProviderError();
    }
    const words = latest.content.trim().split(/\s+/u).length;
    return {
      content:
        "Demo connection successful. Your YGF Agent key is active, " +
        "the model is allowlisted, and this request used variable-cost credits.",
      inputUnits: Math.max(1, words),
      model: input.model.providerId,
      outputUnits: 20,
      providerCostMicroUsd: 840,
      requestId: `demo-${input.requestTraceId}`,
    };
  }
}

interface OpenAIAgentProviderOptions {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class OpenAIAgentProvider implements AgentChatProvider {
  readonly name = "openai";
  readonly #client: OpenAIChatClient;

  constructor({
    apiKey,
    fetch,
    timeoutMs,
  }: OpenAIAgentProviderOptions) {
    try {
      this.#client = new OpenAIChatClient({
        apiKey,
        fetch,
        timeoutMs,
      });
    } catch {
      throw new AgentProviderError();
    }
  }

  async run(input: AgentProviderInput): Promise<AgentProviderResult> {
    try {
      const response = await this.#client.complete({
        maxCompletionTokens: input.maxTokens,
        messages: input.messages,
        model: input.model,
        requestTraceId: input.requestTraceId,
        safetyIdentifier: input.safetyIdentifier,
        temperature: input.temperature,
      });
      if (
        response.content.trim().length < 1 ||
        response.content.length > 32_000
      ) {
        throw new AgentProviderError();
      }
      return {
        content: response.content.trim(),
        inputUnits: response.inputUnits,
        model: input.model.providerId,
        outputUnits: response.outputUnits,
        providerCostMicroUsd: response.providerCostMicroUsd,
        requestId: response.requestId,
      };
    } catch (error) {
      if (error instanceof AgentProviderError) {
        throw error;
      }
      throw new AgentProviderError();
    }
  }
}

export function getAgentChatProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AgentChatProvider {
  if (resolveAuthRuntime(environment).mode === "demo") {
    return new DemoAgentChatProvider();
  }
  if (environment.YGF_AGENT_GATEWAY_ENABLED !== "true") {
    throw new Error("YGF Agent gateway is disabled");
  }
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YGF Agent provider is not configured");
  }
  return new OpenAIAgentProvider({
    apiKey,
  });
}
