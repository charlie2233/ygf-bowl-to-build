import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deriveSafetyIdentifier,
  OPENAI_CHAT_COMPLETIONS_ENDPOINT,
  OpenAIChatClient,
  OpenAIChatClientError,
} from "@/lib/providers/openai-chat-client";
import { resolveAgentModel } from "@/lib/agent/policy";
import { resolveModel } from "@/lib/providers/model-catalog";

const model = resolveModel("study", "balanced");

function successResponse(overrides: Record<string, unknown> = {}) {
  return Response.json({
    choices: [{ message: { content: "Useful response" } }],
    id: "chatcmpl-test_1",
    model: model.providerId,
    usage: {
      completion_tokens: 7,
      prompt_tokens: 11,
      prompt_tokens_details: { cached_tokens: 3 },
    },
    ...overrides,
  });
}

describe("OpenAIChatClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("uses the fixed official endpoint and privacy-safe request fields", async () => {
    const agentModel = resolveAgentModel("gpt-5.6-terra");
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe(OPENAI_CHAT_COMPLETIONS_ENDPOINT);
      expect(init).toMatchObject({
        method: "POST",
        redirect: "error",
      });
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer server-secret",
        "X-Client-Request-Id": "execution-1",
      });
      const body = JSON.parse(String(init?.body)) as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({
        max_completion_tokens: 100,
        model: agentModel.providerId,
        n: 1,
        prompt_cache_options: { mode: "explicit" },
        reasoning_effort: "medium",
        safety_identifier: "a".repeat(64),
        store: false,
        stream: false,
      });
      expect(body).not.toHaveProperty("max_tokens");
      expect(body).not.toHaveProperty("user");
      expect(body).not.toHaveProperty("temperature");
      return successResponse({ model: agentModel.providerId });
    });
    const client = new OpenAIChatClient({
      apiKey: "server-secret",
      fetch: fetchMock,
    });

    const result = await client.complete({
      maxCompletionTokens: 100,
      messages: [{ content: "Hello", role: "user" }],
      model: agentModel,
      requestTraceId: "execution-1",
      safetyIdentifier: "a".repeat(64),
      temperature: 0.25,
    });

    expect(result).toMatchObject({
      content: "Useful response",
      inputUnits: 11,
      model: agentModel.providerId,
      outputUnits: 7,
      requestId: "chatcmpl-test_1",
    });
    expect(JSON.stringify(client)).not.toContain("server-secret");
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });

  it("prices cached and uncached tokens with exact ceiling arithmetic", async () => {
    const tinyModel = {
      ...model,
      maxCostMicroUsd: 100,
      pricingMicroUsdPerMillion: {
        cacheWrite: 7_000_000,
        cachedInput: 2_000_000,
        input: 3_000_000,
        output: 5_000_000,
      },
    };
    const client = new OpenAIChatClient({
      apiKey: "server-secret",
      fetch: vi.fn(async () =>
        successResponse({
          model: tinyModel.providerId,
          usage: {
            completion_tokens: 1,
            prompt_tokens: 3,
            prompt_tokens_details: {
              cache_write_tokens: 1,
              cached_tokens: 1,
            },
          },
        }),
      ),
    });

    const result = await client.complete({
      maxCompletionTokens: 2,
      messages: [{ content: "Hello", role: "user" }],
      model: tinyModel,
      safetyIdentifier: "a".repeat(64),
    });

    expect(result.providerCostMicroUsd).toBe(17);
  });

  it("requires the exact fixed model and rejects invalid usage or over-budget cost", async () => {
    for (const response of [
      successResponse({ model: "gpt-5.4-mini" }),
      successResponse({
        usage: {
          completion_tokens: 1,
          prompt_tokens: 1,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      }),
      successResponse({
        usage: {
          completion_tokens: Number.MAX_SAFE_INTEGER,
          prompt_tokens: Number.MAX_SAFE_INTEGER,
        },
      }),
      successResponse({
        usage: {
          completion_tokens: 1,
          prompt_tokens: 2,
          prompt_tokens_details: {
            cache_write_tokens: 1,
            cached_tokens: 2,
          },
        },
      }),
      successResponse({
        usage: {
          completion_tokens: 1,
          prompt_tokens: 2,
          prompt_tokens_details: { cache_write_tokens: -1 },
        },
      }),
    ]) {
      const client = new OpenAIChatClient({
        apiKey: "server-secret",
        fetch: vi.fn(async () => response),
      });
      await expect(
        client.complete({
          maxCompletionTokens: 100,
          messages: [{ content: "Hello", role: "user" }],
          model,
          safetyIdentifier: "a".repeat(64),
        }),
      ).rejects.toEqual(new OpenAIChatClientError());
    }
  });

  it("maps malformed, oversized, HTTP, redirect, and timeout failures safely", async () => {
    const failures: Array<() => Promise<Response>> = [
      async () => new Response("{", { status: 200 }),
      async () =>
        new Response(JSON.stringify({ padding: "x".repeat(140_000) })),
      async () =>
        Response.json(
          { error: { message: "secret prompt and key" } },
          { status: 500 },
        ),
      async () => {
        throw new TypeError("redirect rejected with secret details");
      },
    ];
    for (const failure of failures) {
      const client = new OpenAIChatClient({
        apiKey: "server-secret",
        fetch: vi.fn(failure),
      });
      await expect(
        client.complete({
          maxCompletionTokens: 100,
          messages: [{ content: "Private", role: "user" }],
          model,
          safetyIdentifier: "a".repeat(64),
        }),
      ).rejects.toEqual(new OpenAIChatClientError());
    }

    vi.useFakeTimers();
    const timeoutClient = new OpenAIChatClient({
      apiKey: "server-secret",
      fetch: vi.fn((_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
      ),
      timeoutMs: 100,
    });
    const pending = expect(
      timeoutClient.complete({
        maxCompletionTokens: 100,
        messages: [{ content: "Private", role: "user" }],
        model,
        safetyIdentifier: "a".repeat(64),
      }),
    ).rejects.toEqual(new OpenAIChatClientError());
    await vi.advanceTimersByTimeAsync(101);
    await pending;
  });

  it("derives a stable, non-PII safety identifier from a trusted id", () => {
    const identifier = deriveSafetyIdentifier(
      "s".repeat(32),
      "user@example.com",
    );
    expect(identifier).toMatch(/^[0-9a-f]{64}$/u);
    expect(identifier).not.toContain("user");
    expect(identifier).toBe(
      deriveSafetyIdentifier("s".repeat(32), "user@example.com"),
    );
    expect(() =>
      deriveSafetyIdentifier("weak", "user@example.com"),
    ).toThrow("SAFETY_IDENTIFIER_CONFIGURATION_INVALID");
  });
});
