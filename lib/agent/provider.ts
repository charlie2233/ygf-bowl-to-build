import { resolveAuthRuntime } from "@/lib/auth/runtime";
import type { AgentChatMessage } from "@/lib/agent/openai-contract";
import { resolveProviderEndpoint } from "@/lib/providers";
import type { ModelCatalogEntry } from "@/lib/providers/model-catalog";

export interface AgentProviderInput {
  maxTokens: number;
  messages: readonly AgentChatMessage[];
  model: ModelCatalogEntry;
  requestIdempotencyKey: string;
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

const MAX_PROVIDER_RESPONSE_BYTES = 128 * 1_024;

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/u.test(declared) ||
      Number(declared) > MAX_PROVIDER_RESPONSE_BYTES)
  ) {
    throw new AgentProviderError();
  }
  if (!response.body) {
    throw new AgentProviderError();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new AgentProviderError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AgentProviderError) {
      throw error;
    }
    throw new AgentProviderError();
  } finally {
    reader.releaseLock();
  }
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function providerCost(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AgentProviderError();
  }
  const converted = Math.ceil(value * 1_000_000);
  if (!Number.isSafeInteger(converted)) {
    throw new AgentProviderError();
  }
  return converted;
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
      requestId: `demo-${input.requestIdempotencyKey}`,
    };
  }
}

interface OpenRouterAgentProviderOptions {
  apiKey: string;
  endpoint: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class OpenRouterAgentProvider implements AgentChatProvider {
  readonly name = "openrouter";
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor({
    apiKey,
    endpoint,
    fetch: fetchImplementation = fetch,
    timeoutMs = 25_000,
  }: OpenRouterAgentProviderOptions) {
    if (
      apiKey.trim().length < 8 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 60_000
    ) {
      throw new AgentProviderError();
    }
    this.#apiKey = apiKey;
    this.#endpoint = endpoint;
    this.#fetch = fetchImplementation;
    this.#timeoutMs = timeoutMs;
  }

  async run(input: AgentProviderInput): Promise<AgentProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(this.#endpoint, {
        body: JSON.stringify({
          max_tokens: input.maxTokens,
          messages: input.messages,
          model: input.model.providerId,
          stream: false,
          temperature: input.temperature,
        }),
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.requestIdempotencyKey,
          "X-Title": "YGF Bowl-to-Build Agent Gateway",
        },
        method: "POST",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AgentProviderError();
      }
      const body = (await readBoundedJson(response)) as {
        choices?: Array<{
          message?: { content?: unknown };
        }>;
        id?: unknown;
        model?: unknown;
        usage?: {
          completion_tokens?: unknown;
          cost?: unknown;
          prompt_tokens?: unknown;
        };
      };
      const content = body.choices?.[0]?.message?.content;
      if (
        typeof content !== "string" ||
        content.trim().length < 1 ||
        content.length > 32_000 ||
        body.model !== input.model.providerId ||
        typeof body.id !== "string" ||
        body.id.length < 1 ||
        body.id.length > 200 ||
        !/^[A-Za-z0-9._:-]+$/u.test(body.id) ||
        !safeInteger(body.usage?.prompt_tokens) ||
        !safeInteger(body.usage?.completion_tokens)
      ) {
        throw new AgentProviderError();
      }
      return {
        content: content.trim(),
        inputUnits: body.usage.prompt_tokens,
        model: body.model,
        outputUnits: body.usage.completion_tokens,
        ...(body.usage.cost === undefined
          ? {}
          : { providerCostMicroUsd: providerCost(body.usage.cost) }),
        requestId: body.id,
      };
    } catch (error) {
      if (error instanceof AgentProviderError) {
        throw error;
      }
      throw new AgentProviderError();
    } finally {
      clearTimeout(timeout);
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
  const apiKey =
    environment.YGF_PROVIDER_API_KEY?.trim() ||
    environment.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YGF Agent provider is not configured");
  }
  return new OpenRouterAgentProvider({
    apiKey,
    endpoint: resolveProviderEndpoint(
      environment.YGF_PROVIDER_BASE_URL,
    ),
  });
}
