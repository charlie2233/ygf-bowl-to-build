import { describe, expect, it, vi } from "vitest";

import { createChatCompletionsHandler } from "@/app/v1/chat/completions/route";
import { createModelsHandler } from "@/app/v1/models/route";
import { authenticateAgentRequest } from "@/lib/agent/authenticate";
import { runAgentChat } from "@/lib/agent/gateway";
import { createPersonalAgentKey } from "@/lib/agent/key-service";
import { DemoAgentChatProvider } from "@/lib/agent/provider";
import {
  AgentGatewayError,
  MemoryAgentGatewayRepository,
} from "@/lib/repositories/agent-gateway-repository";
import { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";

const ENVIRONMENT = {
  NEXT_PUBLIC_APP_URL: "https://build.ygf.test",
  YGF_AGENT_API_KEY_DIGEST_SECRET:
    "agent-http-test-digest-secret-at-least-32-bytes",
  YGF_AGENT_MICRO_USD_PER_CREDIT: "84",
  YGF_AGENT_REQUEST_FINGERPRINT_SECRET:
    "agent-http-test-fingerprint-secret-at-least-32-bytes",
  YGF_DEMO_MODE: "true",
};

async function setup() {
  const now = () => new Date("2026-07-27T20:00:00.000Z");
  const campaign = new MemoryCampaignRepository({
    demoMode: true,
    now,
  });
  await campaign.redeemCode({
    code: "BOWL7K2A",
    idempotencyKey: "agent-http-wallet",
    userId: "demo-user",
  });
  const repository = new MemoryAgentGatewayRepository({
    campaign,
    now,
  });
  const created = await createPersonalAgentKey("demo-user", {
    campaign,
    environment: ENVIRONMENT,
    now,
    recordEvent: async () => undefined,
    repository,
  });
  const authenticate = (request: Request) =>
    authenticateAgentRequest(request, {
      environment: ENVIRONMENT,
      repository,
    });
  return {
    chat: createChatCompletionsHandler({
      admit: (keyDigest) => repository.admitRequest(keyDigest),
      authenticate,
      environment: ENVIRONMENT,
      run: (input) =>
        runAgentChat(input, {
          environment: ENVIRONMENT,
          now,
          provider: new DemoAgentChatProvider(),
          recordEvent: async () => undefined,
          repository,
        }),
    }),
    created,
    models: createModelsHandler({
      admit: (keyDigest) => repository.admitRequest(keyDigest),
      authenticate,
      environment: ENVIRONMENT,
    }),
    repository,
  };
}

function request(
  apiKey: string,
  body: unknown,
  options: {
    idempotencyKey?: string;
    path?: string;
  } = {},
) {
  return new Request(
    `https://build.ygf.test${options.path ?? "/v1/chat/completions"}`,
    {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(options.idempotencyKey
          ? { "idempotency-key": options.idempotencyKey }
          : {}),
      },
      method: "POST",
    },
  );
}

describe("OpenAI-compatible HTTP routes", () => {
  it("lists allowlisted models and completes an idempotent demo request", async () => {
    const context = await setup();
    const modelResponse = await context.models(
      new Request("https://build.ygf.test/v1/models", {
        headers: {
          authorization: `Bearer ${context.created.apiKey}`,
        },
      }),
    );
    expect(modelResponse.status).toBe(200);
    const modelList = await modelResponse.json();
    expect(modelList).toMatchObject({
      object: "list",
    });
    expect(modelList.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "balanced",
          object: "model",
          owned_by: "ygf",
        }),
        expect.objectContaining({
          id: "fast",
          object: "model",
          owned_by: "ygf",
        }),
      ]),
    );

    const body = {
      max_tokens: 60,
      messages: [{ content: "Connection check.", role: "user" }],
      model: "fast",
      stream: false,
    };
    const first = await context.chat(
      request(context.created.apiKey, body, {
        idempotencyKey: "http-route-demo-1",
      }),
    );
    const replay = await context.chat(
      request(context.created.apiKey, body, {
        idempotencyKey: "http-route-demo-1",
      }),
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(first.headers.get("x-ygf-remaining-credits")).toBe("2990");
    expect(first.headers.get("x-ygf-idempotency-key")).toBeNull();
    expect(await first.json()).toMatchObject({
      choices: [
        {
          message: {
            content: expect.stringContaining(
              "Demo connection successful",
            ),
            role: "assistant",
          },
        },
      ],
      model: "fast",
      object: "chat.completion",
      ygf: {
        credits_used: 10,
        remaining_credits: 2990,
      },
    });
    expect(await replay.json()).toMatchObject({
      ygf: { remaining_credits: 2990 },
    });
  });

  it("rejects secrets in URLs, invalid keys, and non-allowlisted models", async () => {
    const context = await setup();
    const body = {
      messages: [{ content: "Connection check.", role: "user" }],
      model: "fast",
      stream: false,
    };
    const querySecret = await context.chat(
      request(context.created.apiKey, body, {
        path: `/v1/chat/completions?api_key=${encodeURIComponent(
          context.created.apiKey,
        )}`,
      }),
    );
    expect(querySecret.status).toBe(401);
    expect(JSON.stringify(await querySecret.json())).not.toContain(
      context.created.apiKey,
    );

    const invalid = await context.chat(
      request(`ygf_${"B".repeat(43)}`, body),
    );
    expect(invalid.status).toBe(401);

    const blockedModel = await context.chat(
      request(context.created.apiKey, {
        ...body,
        model: "provider/private-model",
      }, { idempotencyKey: "blocked-model-request" }),
    );
    expect(blockedModel.status).toBe(400);
    await expect(blockedModel.json()).resolves.toMatchObject({
      error: {
        code: "invalid_request",
        type: "invalid_request_error",
      },
    });
  });

  it("rejects non-number and non-integer max_tokens values", async () => {
    const context = await setup();
    for (const [index, maxTokens] of [
      true,
      "60",
      60.5,
    ].entries()) {
      const response = await context.chat(
        request(
          context.created.apiKey,
          {
            max_tokens: maxTokens,
            messages: [
              { content: "Connection check.", role: "user" },
            ],
            model: "fast",
            stream: false,
          },
          { idempotencyKey: `invalid-max-tokens-${index}` },
        ),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "invalid_request" },
      });
    }
  });

  it("requires a stable header, admits all valid-key request shapes, and keeps retry secrets out of execution", async () => {
    const context = await setup();
    const rawToken = context.created.apiKey;
    let seenIdempotencyKey = "";
    const chat = createChatCompletionsHandler({
      admit: (keyDigest) => context.repository.admitRequest(keyDigest),
      authenticate: (request) =>
        authenticateAgentRequest(request, {
          environment: ENVIRONMENT,
          repository: context.repository,
        }),
      environment: ENVIRONMENT,
      run: async (input) => {
        seenIdempotencyKey = input.idempotencyKey;
        return {
          choices: [],
          ygf: { remaining_credits: 3000 },
        };
      },
    });
    const body = {
      messages: [{ content: "Connection check.", role: "user" }],
      model: "fast",
      stream: false,
    };

    const credentialToken = await chat(
      request(context.created.apiKey, body, { idempotencyKey: rawToken }),
    );
    expect(credentialToken.status).toBe(400);
    expect(seenIdempotencyKey).toBe("");

    const missing = await chat(request(context.created.apiKey, body));
    expect(missing.status).toBe(400);

    const valid = await chat(
      request(context.created.apiKey, body, {
        idempotencyKey: "safe-transport-retry-1",
      }),
    );
    expect(valid.status).toBe(200);
    expect(seenIdempotencyKey).toMatch(/^idem_[0-9a-f]{64}$/u);
    expect(seenIdempotencyKey).not.toContain("safe-transport-retry-1");
    expect(seenIdempotencyKey).not.toContain(rawToken);
    expect(JSON.stringify(await valid.json())).not.toContain(
      "safe-transport-retry-1",
    );
  });

  it.each([
    [
      "missing",
      {
        ...ENVIRONMENT,
        YGF_AGENT_REQUEST_FINGERPRINT_SECRET: undefined,
        YGF_DEMO_MODE: "true",
      },
    ],
    [
      "weak",
      {
        ...ENVIRONMENT,
        YGF_AGENT_REQUEST_FINGERPRINT_SECRET: "too-short",
        YGF_DEMO_MODE: "true",
      },
    ],
  ])(
    "fails closed with 503 for %s Agent fingerprint configuration in demo mode",
    async (_label, environment) => {
      const context = await setup();
      const run = vi.fn();
      const chat = createChatCompletionsHandler({
        admit: (keyDigest) =>
          context.repository.admitRequest(keyDigest),
        authenticate: (request) =>
          authenticateAgentRequest(request, {
            environment: ENVIRONMENT,
            repository: context.repository,
          }),
        environment,
        run,
      });
      const response = await chat(
        request(
          context.created.apiKey,
          {
            messages: [
              { content: "Connection check.", role: "user" },
            ],
            model: "fast",
            stream: false,
          },
          { idempotencyKey: "agent-secret-config-check" },
        ),
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "service_unavailable" },
      });
      expect(run).not.toHaveBeenCalled();
    },
  );

  it("applies one RPM bucket before models and malformed chat bodies", async () => {
    const context = await setup();
    for (let index = 0; index < 10; index += 1) {
      const response = await context.models(
        new Request("https://build.ygf.test/v1/models", {
          headers: { authorization: `Bearer ${context.created.apiKey}` },
        }),
      );
      expect(response.status).toBe(200);
    }
    const malformed = await context.chat(
      new Request("https://build.ygf.test/v1/chat/completions", {
        body: "{",
        headers: {
          authorization: `Bearer ${context.created.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": "malformed-chat-request",
        },
        method: "POST",
      }),
    );
    expect(malformed.status).toBe(400);
    const finalAdmission = await context.chat(
      request(
        context.created.apiKey,
        { messages: [{ content: "one", role: "user" }], model: "fast", stream: false },
        { idempotencyKey: "final-admitted-request" },
      ),
    );
    expect(finalAdmission.status).toBe(200);
    const rejected = await context.models(
      new Request("https://build.ygf.test/v1/models", {
        headers: { authorization: `Bearer ${context.created.apiKey}` },
      }),
    );
    expect(rejected.status).toBe(429);
  });

  it("maps an admission-time revoke or expiry race to generic 401 on both routes", async () => {
    const context = await setup();
    const authenticate = (request: Request) =>
      authenticateAgentRequest(request, {
        environment: ENVIRONMENT,
        repository: context.repository,
      });
    const admit = async () => {
      throw new AgentGatewayError("AUTHENTICATION_FAILED");
    };
    const run = vi.fn();
    const chat = createChatCompletionsHandler({
      admit,
      authenticate,
      environment: ENVIRONMENT,
      run,
    });
    const models = createModelsHandler({
      admit,
      authenticate,
      environment: ENVIRONMENT,
    });

    const chatResponse = await chat(
      request(
        context.created.apiKey,
        {
          messages: [{ content: "one", role: "user" }],
          model: "fast",
          stream: false,
        },
        { idempotencyKey: "revoked-after-auth-chat" },
      ),
    );
    const modelsResponse = await models(
      new Request("https://build.ygf.test/v1/models", {
        headers: {
          authorization: `Bearer ${context.created.apiKey}`,
        },
      }),
    );

    for (const response of [chatResponse, modelsResponse]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "invalid_api_key",
          message: "Invalid or inactive API key.",
          type: "authentication_error",
        },
      });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a revoked key with the same generic authentication error", async () => {
    const context = await setup();
    await context.repository.revokeKey(
      "demo-user",
      context.created.key.id,
    );
    const response = await context.models(
      new Request("https://build.ygf.test/v1/models", {
        headers: {
          authorization: `Bearer ${context.created.apiKey}`,
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "invalid_api_key",
        message: "Invalid or inactive API key.",
      },
    });
  });
});
