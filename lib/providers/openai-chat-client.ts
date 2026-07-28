import { createHmac } from "node:crypto";

import type { ModelCatalogEntry } from "@/lib/providers/model-catalog";

export const OPENAI_CHAT_COMPLETIONS_ENDPOINT =
  "https://api.openai.com/v1/chat/completions";

const MAX_PROVIDER_RESPONSE_BYTES = 128 * 1_024;
const MAX_CONTENT_CHARACTERS = 64_000;

export type OpenAIChatMessageRole =
  | "assistant"
  | "developer"
  | "system"
  | "user";

export interface OpenAIChatMessage {
  content: string;
  role: OpenAIChatMessageRole;
}

export interface OpenAIResponseFormat {
  json_schema: {
    name: string;
    schema: Readonly<Record<string, unknown>>;
    strict: true;
  };
  type: "json_schema";
}

interface OpenAIChatClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface OpenAIChatCompletionInput {
  maxCompletionTokens: number;
  messages: readonly OpenAIChatMessage[];
  model: ModelCatalogEntry;
  requestTraceId?: string;
  responseFormat?: OpenAIResponseFormat;
  safetyIdentifier: string;
  temperature?: number;
}

export interface OpenAIChatCompletionResult {
  content: string;
  inputUnits: number;
  model: string;
  outputUnits: number;
  providerCostMicroUsd: number;
  requestId: string;
}

export class OpenAIChatClientError extends Error {
  constructor() {
    super("PROVIDER_UNAVAILABLE");
    this.name = "OpenAIChatClientError";
  }
}

function plainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
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

function safeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function validRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    /^[A-Za-z0-9._:-]+$/u.test(value)
  );
}

function validTraceId(value: string | undefined) {
  return (
    value === undefined ||
    (value.length >= 1 &&
      value.length <= 128 &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value))
  );
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/u.test(declaredLength) ||
      Number(declaredLength) > MAX_PROVIDER_RESPONSE_BYTES)
  ) {
    throw new OpenAIChatClientError();
  }
  if (!response.body) {
    throw new OpenAIChatClientError();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new OpenAIChatClientError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof OpenAIChatClientError) {
      throw error;
    }
    throw new OpenAIChatClientError();
  } finally {
    reader.releaseLock();
  }
}

function validateModel(model: ModelCatalogEntry) {
  const prices = model.pricingMicroUsdPerMillion;
  if (
    typeof model.providerId !== "string" ||
    model.providerId.length < 1 ||
    model.providerId.length > 128 ||
    !Number.isSafeInteger(model.maxCostMicroUsd) ||
    model.maxCostMicroUsd < 1 ||
    ![prices.input, prices.cachedInput, prices.output].every(
      (price) =>
        Number.isSafeInteger(price) && price >= 0,
    )
  ) {
    throw new OpenAIChatClientError();
  }
}

function calculateCostMicroUsd({
  cachedInputUnits,
  inputUnits,
  model,
  outputUnits,
}: {
  cachedInputUnits: number;
  inputUnits: number;
  model: ModelCatalogEntry;
  outputUnits: number;
}) {
  const uncachedInputUnits = inputUnits - cachedInputUnits;
  const prices = model.pricingMicroUsdPerMillion;
  const numerator =
    BigInt(uncachedInputUnits) * BigInt(prices.input) +
    BigInt(cachedInputUnits) * BigInt(prices.cachedInput) +
    BigInt(outputUnits) * BigInt(prices.output);
  const cost =
    (numerator + BigInt(999_999)) / BigInt(1_000_000);
  if (
    cost > BigInt(Number.MAX_SAFE_INTEGER) ||
    cost > BigInt(model.maxCostMicroUsd)
  ) {
    throw new OpenAIChatClientError();
  }
  return Number(cost);
}

export function deriveSafetyIdentifier(
  secret: string,
  trustedUserId: string,
) {
  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < 32 ||
    typeof trustedUserId !== "string" ||
    trustedUserId.length < 1 ||
    trustedUserId.length > 256
  ) {
    throw new Error("SAFETY_IDENTIFIER_CONFIGURATION_INVALID");
  }
  return createHmac("sha256", secret)
    .update("ygf-openai-safety-identifier:v1:", "utf8")
    .update(trustedUserId, "utf8")
    .digest("hex");
}

export class OpenAIChatClient {
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor({
    apiKey,
    fetch: fetchImplementation = fetch,
    timeoutMs = 25_000,
  }: OpenAIChatClientOptions) {
    if (
      typeof apiKey !== "string" ||
      apiKey.trim().length < 8 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 60_000
    ) {
      throw new OpenAIChatClientError();
    }
    this.#apiKey = apiKey.trim();
    this.#fetch = fetchImplementation;
    this.#timeoutMs = timeoutMs;
  }

  async complete(
    input: OpenAIChatCompletionInput,
  ): Promise<OpenAIChatCompletionResult> {
    validateModel(input.model);
    if (
      !Number.isSafeInteger(input.maxCompletionTokens) ||
      input.maxCompletionTokens < 1 ||
      input.maxCompletionTokens > 32_768 ||
      !/^[0-9a-f]{64}$/u.test(input.safetyIdentifier) ||
      !validTraceId(input.requestTraceId) ||
      !Array.isArray(input.messages) ||
      input.messages.length < 1 ||
      input.messages.length > 64 ||
      !input.messages.every(
        (message) =>
          ["assistant", "developer", "system", "user"].includes(
            message.role,
          ) &&
          typeof message.content === "string" &&
          message.content.trim().length >= 1 &&
          message.content.length <= 20_000,
      )
    ) {
      throw new OpenAIChatClientError();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      };
      if (input.requestTraceId) {
        headers["X-Client-Request-Id"] =
          input.requestTraceId;
      }
      const requestBody: Record<string, unknown> = {
        max_completion_tokens: input.maxCompletionTokens,
        messages: input.messages,
        model: input.model.providerId,
        n: 1,
        safety_identifier: input.safetyIdentifier,
        store: false,
        stream: false,
      };
      if (input.responseFormat) {
        requestBody.response_format = input.responseFormat;
      }
      if (
        input.model.providerId.startsWith("gpt-4.1-") &&
        typeof input.temperature === "number" &&
        Number.isFinite(input.temperature) &&
        input.temperature >= 0 &&
        input.temperature <= 1
      ) {
        requestBody.temperature = input.temperature;
      }

      const response = await this.#fetch(
        OPENAI_CHAT_COMPLETIONS_ENDPOINT,
        {
          body: JSON.stringify(requestBody),
          headers,
          method: "POST",
          redirect: "error",
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new OpenAIChatClientError();
      }
      const body = await readBoundedJson(response);
      if (!plainRecord(body)) {
        throw new OpenAIChatClientError();
      }
      const choices = body.choices;
      const usage = body.usage;
      if (
        !Array.isArray(choices) ||
        choices.length < 1 ||
        !plainRecord(choices[0]) ||
        !plainRecord(choices[0].message) ||
        typeof choices[0].message.content !== "string" ||
        choices[0].message.content.trim().length < 1 ||
        choices[0].message.content.length >
          MAX_CONTENT_CHARACTERS ||
        body.model !== input.model.providerId ||
        !validRequestId(body.id) ||
        !plainRecord(usage) ||
        !safeInteger(usage.prompt_tokens) ||
        !safeInteger(usage.completion_tokens)
      ) {
        throw new OpenAIChatClientError();
      }
      let cachedInputUnits = 0;
      if (usage.prompt_tokens_details !== undefined) {
        if (!plainRecord(usage.prompt_tokens_details)) {
          throw new OpenAIChatClientError();
        }
        const cached = usage.prompt_tokens_details.cached_tokens;
        if (cached !== undefined && !safeInteger(cached)) {
          throw new OpenAIChatClientError();
        }
        cachedInputUnits =
          typeof cached === "number" ? cached : 0;
      }
      if (cachedInputUnits > usage.prompt_tokens) {
        throw new OpenAIChatClientError();
      }
      const providerCostMicroUsd = calculateCostMicroUsd({
        cachedInputUnits,
        inputUnits: usage.prompt_tokens,
        model: input.model,
        outputUnits: usage.completion_tokens,
      });
      return {
        content: choices[0].message.content,
        inputUnits: usage.prompt_tokens,
        model: input.model.providerId,
        outputUnits: usage.completion_tokens,
        providerCostMicroUsd,
        requestId: body.id,
      };
    } catch (error) {
      if (error instanceof OpenAIChatClientError) {
        throw error;
      }
      throw new OpenAIChatClientError();
    } finally {
      clearTimeout(timeout);
    }
  }
}
