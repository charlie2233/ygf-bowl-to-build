import { describe, expect, it, vi } from "vitest";

import {
  getAgentChatProvider,
  OpenAIAgentProvider,
} from "@/lib/agent/provider";
import { getTaskDefinition } from "@/lib/content/tasks";
import { resolveModel } from "@/lib/providers/model-catalog";
import { getTaskProvider } from "@/lib/providers";
import {
  OpenAITaskProvider,
  ProviderError,
} from "@/lib/providers/openai-provider";

const safetyIdentifier = "a".repeat(64);

describe("OpenAI provider adapters", () => {
  it("uses a strict JSON schema and developer message for preset tasks", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string }>;
        response_format?: {
          json_schema?: { strict?: boolean };
          type?: string;
        };
      };
      expect(body.messages[0]?.role).toBe("developer");
      expect(body.response_format).toMatchObject({
        json_schema: { strict: true },
        type: "json_schema",
      });
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sections: [
                  { heading: "Recall", items: ["Test yourself."] },
                ],
                title: "Study plan",
              }),
            },
          },
        ],
        id: "chatcmpl-task-1",
        model: "gpt-5.4-mini-2026-03-17",
        usage: {
          completion_tokens: 10,
          prompt_tokens: 20,
          prompt_tokens_details: { cached_tokens: 4 },
        },
      });
    });
    const provider = new OpenAITaskProvider({
      apiKey: "server-secret",
      fetch: fetchMock,
    });

    const result = await provider.run({
      input: "Explain active recall",
      model: resolveModel("study", "balanced"),
      requestTraceId: "execution-1",
      safetyIdentifier,
      task: getTaskDefinition("study"),
    });

    expect(result.model).toBe("gpt-5.4-mini-2026-03-17");
    expect(result.output.title).toBe("Study plan");
  });

  it("maps task client errors to the existing safe provider error", async () => {
    const provider = new OpenAITaskProvider({
      apiKey: "server-secret",
      fetch: vi.fn(async () => Response.json({}, { status: 500 })),
    });
    await expect(
      provider.run({
        input: "Private prompt",
        model: resolveModel("study", "balanced"),
        safetyIdentifier,
        task: getTaskDefinition("study"),
      }),
    ).rejects.toEqual(new ProviderError("PROVIDER_UNAVAILABLE"));
  });

  it("supports the Agent path without forwarding the client's user field", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<
        string,
        unknown
      >;
      expect(body.safety_identifier).toBe(safetyIdentifier);
      expect(body).not.toHaveProperty("user");
      return Response.json({
        choices: [{ message: { content: "Agent connected." } }],
        id: "chatcmpl-agent-1",
        model: "gpt-5.4-nano-2026-03-17",
        usage: {
          completion_tokens: 4,
          prompt_tokens: 6,
        },
      });
    });
    const provider = new OpenAIAgentProvider({
      apiKey: "server-secret",
      fetch: fetchMock,
    });
    const result = await provider.run({
      maxTokens: 100,
      messages: [{ content: "Ping", role: "user" }],
      model: resolveModel("pick-my-bowl", "fast"),
      requestTraceId: "execution-2",
      safetyIdentifier,
      temperature: 0.5,
    });

    expect(result).toMatchObject({
      content: "Agent connected.",
      model: "gpt-5.4-nano-2026-03-17",
      requestId: "chatcmpl-agent-1",
    });
    expect(JSON.stringify(provider)).not.toContain("server-secret");
  });
});

describe("OpenAI-only production provider selection", () => {
  const productionEnvironment = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    OPENAI_API_KEY: "server-openai-secret",
    OPENROUTER_API_KEY: "must-be-ignored",
    SUPABASE_SECRET_KEY: "supabase-secret",
    YGF_AGENT_GATEWAY_ENABLED: "true",
    YGF_PROVIDER_API_KEY: "must-also-be-ignored",
    YGF_PROVIDER_BASE_URL: "https://attacker.example/v1",
  };

  it("constructs only OpenAI providers and does not serialize credentials", () => {
    const task = getTaskProvider(productionEnvironment);
    const agent = getAgentChatProvider(productionEnvironment);

    expect(task.name).toBe("openai");
    expect(agent.name).toBe("openai");
    expect(JSON.stringify({ agent, task })).not.toContain(
      "server-openai-secret",
    );
    expect(JSON.stringify({ agent, task })).not.toContain(
      "attacker.example",
    );
  });

  it("fails closed without OPENAI_API_KEY even when legacy keys exist", () => {
    const withoutOpenAI: Record<string, string | undefined> = {
      ...productionEnvironment,
    };
    delete withoutOpenAI.OPENAI_API_KEY;

    expect(() => getTaskProvider(withoutOpenAI)).toThrow(
      "OPENAI_API_KEY",
    );
    expect(() => getAgentChatProvider(withoutOpenAI)).toThrow(
      "YGF Agent provider is not configured",
    );
  });
});
