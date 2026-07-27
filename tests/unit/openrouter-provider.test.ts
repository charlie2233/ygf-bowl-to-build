import { afterEach, describe, expect, it, vi } from "vitest";

import { getTaskDefinition } from "@/lib/content/tasks";
import { resolveModel } from "@/lib/providers/model-catalog";
import {
  OpenRouterProvider,
  ProviderError,
} from "@/lib/providers/openrouter-provider";
import {
  DEFAULT_PROVIDER_ENDPOINT,
  resolveProviderEndpoint,
} from "@/lib/providers";

describe("OpenRouterProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses server credentials, attribution, an allowlisted model, and no debug echo", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer server-secret",
        "HTTP-Referer": "https://build.ygf.example",
        "Idempotency-Key": "execution-1",
        "X-Title": "YGF Bowl-to-Build",
      });
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>;
        model: string;
      };
      expect(body.model).toBe("openai/gpt-4.1-mini");
      expect(body.messages.at(-1)?.content).toContain(
        "Explain active recall",
      );
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sections: [
                  {
                    heading: "Key ideas",
                    items: ["Retrieve information from memory."],
                  },
                ],
                title: "Your study guide",
              }),
            },
          },
        ],
        id: "or-request-1",
        model: "openai/gpt-4.1-mini",
        usage: {
          completion_tokens: 44,
          cost: 0.0024,
          prompt_tokens: 22,
        },
      });
    });
    const provider = new OpenRouterProvider({
      apiKey: "server-secret",
      fetch: fetchMock,
      referer: "https://build.ygf.example",
      timeoutMs: 5_000,
    });

    const result = await provider.run({
      input: "Explain active recall",
      model: resolveModel("study", "balanced"),
      requestIdempotencyKey: "execution-1",
      task: getTaskDefinition("study"),
    });

    expect(result).toMatchObject({
      inputUnits: 22,
      model: "openai/gpt-4.1-mini",
      outputUnits: 44,
      providerCostMicroUsd: 2_400,
      requestId: "or-request-1",
    });
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });

  it("normalizes an HTTPS OpenAI-compatible gateway and rejects unsafe bases", () => {
    expect(resolveProviderEndpoint(undefined)).toBe(
      DEFAULT_PROVIDER_ENDPOINT,
    );
    expect(
      resolveProviderEndpoint(
        "https://gateway.example/v1/account/campaign/openai",
      ),
    ).toBe(
      "https://gateway.example/v1/account/campaign/openai/chat/completions",
    );
    expect(
      resolveProviderEndpoint(
        "https://gateway.example/v1/chat/completions/",
      ),
    ).toBe(
      "https://gateway.example/v1/chat/completions",
    );

    for (const unsafe of [
      "http://gateway.example/v1",
      "https://user:secret@gateway.example/v1",
      "https://gateway.example/v1?token=secret",
      "not a url",
    ]) {
      expect(() => resolveProviderEndpoint(unsafe)).toThrow(
        "YGF_PROVIDER_BASE_URL_INVALID",
      );
    }
  });

  it("maps upstream payloads and HTTP failures to one safe error", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "server-secret",
      fetch: vi.fn(async () =>
        Response.json(
          {
            error: {
              message:
                "provider debug: authorization=server-secret prompt=private",
            },
          },
          { status: 500 },
        ),
      ),
    });

    await expect(
      provider.run({
        input: "private",
        model: resolveModel("study", "balanced"),
        task: getTaskDefinition("study"),
      }),
    ).rejects.toEqual(new ProviderError("PROVIDER_UNAVAILABLE"));
  });

  it("rejects redirects and maps the fetch failure to one safe error", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed because redirects are rejected");
    });
    const provider = new OpenRouterProvider({
      apiKey: "server-secret",
      fetch: fetchMock,
    });

    await expect(
      provider.run({
        input: "private",
        model: resolveModel("study", "balanced"),
        task: getTaskDefinition("study"),
      }),
    ).rejects.toEqual(new ProviderError("PROVIDER_UNAVAILABLE"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("aborts at the configured timeout and maps it safely", async () => {
    vi.useFakeTimers();
    const provider = new OpenRouterProvider({
      apiKey: "server-secret",
      fetch: vi.fn((_url, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
      timeoutMs: 100,
    });
    const pending = provider.run({
      input: "Explain active recall",
      model: resolveModel("study", "balanced"),
      task: getTaskDefinition("study"),
    });
    const rejection = expect(pending).rejects.toEqual(
      new ProviderError("PROVIDER_UNAVAILABLE"),
    );
    await vi.advanceTimersByTimeAsync(101);

    await rejection;
  });

  it("rejects malformed or over-budget success payloads without leaking them", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "server-secret",
      fetch: vi.fn(async () =>
        Response.json({
          choices: [
            {
              message: {
                content:
                  '{"title":"x","sections":[{"heading":"x","items":[]}]}',
              },
            },
          ],
          id: "or-request-2",
          model: "unlisted/provider-model",
          usage: {
            completion_tokens: 10,
            cost: 9,
            prompt_tokens: 10,
          },
        }),
      ),
    });

    await expect(
      provider.run({
        input: "private",
        model: resolveModel("study", "balanced"),
        task: getTaskDefinition("study"),
      }),
    ).rejects.toEqual(new ProviderError("PROVIDER_UNAVAILABLE"));
  });

  it("rejects an oversized provider body before JSON parsing", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "server-secret",
      fetch: vi.fn(async () =>
        new Response(
          JSON.stringify({ padding: "x".repeat(140_000) }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      ),
    });

    await expect(
      provider.run({
        input: "private",
        model: resolveModel("study", "balanced"),
        task: getTaskDefinition("study"),
      }),
    ).rejects.toEqual(new ProviderError("PROVIDER_UNAVAILABLE"));
  });
});
