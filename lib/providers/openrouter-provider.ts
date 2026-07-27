import { menuContextForProvider } from "@/lib/content/menu";
import {
  parseTaskOutput,
  type TaskProvider,
  type TaskProviderInput,
} from "@/lib/providers/provider";

export type ProviderErrorCode =
  | "PROVIDER_CONFIGURATION_INVALID"
  | "PROVIDER_UNAVAILABLE";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode) {
    super(code);
    this.name = "ProviderError";
    this.code = code;
  }
}

interface OpenRouterProviderOptions {
  apiKey: string;
  endpoint?: string;
  fetch?: typeof fetch;
  referer?: string;
  timeoutMs?: number;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  id?: unknown;
  model?: unknown;
  usage?: {
    completion_tokens?: unknown;
    cost?: unknown;
    prompt_tokens?: unknown;
  };
}

const MAX_PROVIDER_RESPONSE_BYTES = 128 * 1_024;

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

async function readBoundedJsonResponse(
  response: Response,
  maximumBytes = MAX_PROVIDER_RESPONSE_BYTES,
): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/u.test(declaredLength) ||
      Number(declaredLength) > maximumBytes)
  ) {
    throw new ProviderError("PROVIDER_UNAVAILABLE");
  }
  if (!response.body) {
    throw new ProviderError("PROVIDER_UNAVAILABLE");
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
      if (size > maximumBytes) {
        await reader.cancel();
        throw new ProviderError("PROVIDER_UNAVAILABLE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    throw new ProviderError("PROVIDER_UNAVAILABLE");
  } finally {
    reader.releaseLock();
  }
}

function costToMicroUsd(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ProviderError("PROVIDER_UNAVAILABLE");
  }
  const microUsd = Math.ceil(value * 1_000_000);
  if (!Number.isSafeInteger(microUsd)) {
    throw new ProviderError("PROVIDER_UNAVAILABLE");
  }
  return microUsd;
}

function validRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    /^[A-Za-z0-9._:-]+$/u.test(value)
  );
}

function providerSystemPrompt(input: TaskProviderInput) {
  const lines = [
    "You are the YGF Bowl-to-Build beta assistant.",
    input.task.providerInstruction,
    input.task.reviewNote,
    "Return JSON only with this shape: {\"title\":\"...\",\"sections\":[{\"heading\":\"...\",\"items\":[\"...\"]}]}",
    "Use 1 to 4 sections and concise, directly useful items. Do not include HTML or markdown fences.",
  ];
  if (input.task.type === "pick-my-bowl") {
    lines.push(menuContextForProvider());
  }
  return lines.join("\n");
}

export class OpenRouterProvider implements TaskProvider {
  readonly name = "openrouter";
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;
  readonly #referer?: string;
  readonly #timeoutMs: number;

  constructor({
    apiKey,
    endpoint = "https://openrouter.ai/api/v1/chat/completions",
    fetch: fetchImplementation = fetch,
    referer,
    timeoutMs = 25_000,
  }: OpenRouterProviderOptions) {
    if (
      typeof apiKey !== "string" ||
      apiKey.trim().length < 8 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 60_000
    ) {
      throw new ProviderError("PROVIDER_CONFIGURATION_INVALID");
    }
    this.#apiKey = apiKey;
    this.#endpoint = endpoint;
    this.#fetch = fetchImplementation;
    this.#referer = referer;
    this.#timeoutMs = timeoutMs;
  }

  async run(input: TaskProviderInput) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "YGF Bowl-to-Build",
      };
      if (this.#referer) {
        headers["HTTP-Referer"] = this.#referer;
      }
      if (input.requestIdempotencyKey) {
        headers["Idempotency-Key"] = input.requestIdempotencyKey;
      }

      const response = await this.#fetch(this.#endpoint, {
        body: JSON.stringify({
          max_tokens: 1_800,
          messages: [
            {
              content: providerSystemPrompt(input),
              role: "system",
            },
            {
              content: input.input,
              role: "user",
            },
          ],
          model: input.model.providerId,
          temperature: 0.25,
        }),
        headers,
        method: "POST",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ProviderError("PROVIDER_UNAVAILABLE");
      }

      const body = (await readBoundedJsonResponse(
        response,
      )) as OpenRouterResponse;
      const content = body.choices?.[0]?.message?.content;
      if (
        typeof content !== "string" ||
        body.model !== input.model.providerId ||
        !validRequestId(body.id) ||
        !safeInteger(body.usage?.prompt_tokens) ||
        !safeInteger(body.usage?.completion_tokens)
      ) {
        throw new ProviderError("PROVIDER_UNAVAILABLE");
      }

      let decoded: unknown;
      try {
        decoded = JSON.parse(content);
      } catch {
        throw new ProviderError("PROVIDER_UNAVAILABLE");
      }
      const output = parseTaskOutput(decoded);
      const providerCostMicroUsd = costToMicroUsd(body.usage.cost);
      if (
        providerCostMicroUsd !== undefined &&
        providerCostMicroUsd > input.model.maxCostMicroUsd
      ) {
        throw new ProviderError("PROVIDER_UNAVAILABLE");
      }

      return {
        inputUnits: body.usage.prompt_tokens,
        model: body.model,
        output,
        outputUnits: body.usage.completion_tokens,
        ...(providerCostMicroUsd === undefined
          ? {}
          : { providerCostMicroUsd }),
        requestId: body.id,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError("PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}
