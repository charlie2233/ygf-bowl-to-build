import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { generateAgentApiKey } from "@/lib/agent/api-key";
import {
  fingerprintAgentIdempotencyKey,
  runAgentChat,
} from "@/lib/agent/gateway";
import { parseAgentChatRequest } from "@/lib/agent/openai-contract";
import {
  AGENT_REQUEST_LIMITS,
  resolveAgentApiKeyExpiry,
} from "@/lib/agent/policy";
import type {
  AgentChatProvider,
  AgentProviderResult,
} from "@/lib/agent/provider";
import { AGENT_API_KEY_SCOPES } from "@/lib/agent/types";
import {
  type AgentGatewayRepository,
  MemoryAgentGatewayRepository,
  type TerminalizeAgentRequestResult,
} from "@/lib/repositories/agent-gateway-repository";
import { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";

const DIGEST_SECRET =
  "agent-gateway-test-digest-secret-at-least-32-bytes";
const FINGERPRINT_SECRET =
  "agent-gateway-test-fingerprint-secret-at-least-32-bytes";
const ENVIRONMENT = {
  YGF_AGENT_API_KEY_DIGEST_SECRET: DIGEST_SECRET,
  YGF_AGENT_MICRO_USD_PER_CREDIT: "84",
  YGF_AGENT_REQUEST_FINGERPRINT_SECRET: FINGERPRINT_SECRET,
  YGF_DEMO_MODE: "true",
};

function idem(value: string) {
  return fingerprintAgentIdempotencyKey(value, ENVIRONMENT);
}

async function setup() {
  let current = new Date("2026-07-27T20:00:00.000Z");
  const now = () => new Date(current);
  const campaign = new MemoryCampaignRepository({
    demoMode: true,
    now,
  });
  await campaign.redeemCode({
    code: "BOWL7K2A",
    idempotencyKey: "agent-wallet-redemption",
    userId: "demo-user",
  });
  const repository = new MemoryAgentGatewayRepository({
    campaign,
    now,
  });
  const wallet = await campaign.getWallet({
    userId: "demo-user",
  });

  async function createKey() {
    const generated = generateAgentApiKey({
      digestSecret: DIGEST_SECRET,
    });
    const descriptor = await repository.createKey({
      createdAt: current.toISOString(),
      expiresAt: resolveAgentApiKeyExpiry({
        createdAt: current,
        walletExpiresAt: wallet.expiresAt,
      }),
      limits: {
        maximumConcurrentRequests:
          AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerKey,
        maximumRequestsPerMinute:
          AGENT_REQUEST_LIMITS.maximumRequestsPerMinute,
      },
      persistence: generated.persistence,
      scopes: AGENT_API_KEY_SCOPES,
      userId: "demo-user",
      walletId: wallet.id,
    });
    return { descriptor, generated };
  }

  return {
    campaign,
    createKey,
    now,
    repository,
    setNow(value: string) {
      current = new Date(value);
    },
    wallet,
  };
}

function chatRequest(model = "fast") {
  const value = {
    max_tokens: 200,
    messages: [
      {
        content: "Return a concise connection check.",
        role: "user",
      },
    ],
    model,
    stream: false,
  };
  return parseAgentChatRequest(
    value,
    Buffer.byteLength(JSON.stringify(value)),
  );
}

function successfulProvider(
  override: Partial<AgentProviderResult> = {},
): AgentChatProvider {
  return {
    name: "test",
    run: vi.fn(async (input) => ({
      content: "Connection successful.",
      inputUnits: 12,
      model: input.model.providerId,
      outputUnits: 5,
      providerCostMicroUsd: 840,
      requestId: "provider-test-1",
      ...override,
    })),
  };
}

function transformTerminalResult(
  repository: AgentGatewayRepository,
  transform: (
    value: TerminalizeAgentRequestResult,
  ) => TerminalizeAgentRequestResult,
): AgentGatewayRepository {
  return new Proxy(repository, {
    get(target, property) {
      if (property === "terminalizeRequest") {
        return async (
          input: Parameters<
            AgentGatewayRepository["terminalizeRequest"]
          >[0],
        ) => transform(await target.terminalizeRequest(input));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function reverseJsonObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseJsonObjectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseJsonObjectKeys(item)]),
  );
}

describe("OpenAI-compatible Agent gateway", () => {
  it("bounds key creation and rotation churn to ten lifecycle slots per wallet", async () => {
    const context = await setup();
    for (let index = 0; index < 10; index += 1) {
      const { descriptor } = await context.createKey();
      await context.repository.revokeKey("demo-user", descriptor.id);
    }
    await expect(context.createKey()).rejects.toMatchObject({
      code: "KEY_LIMIT_REACHED",
    });
  });

  it("completes a valid demo request with variable credits and idempotent replay", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const principal = await context.repository.authenticateKey(
      generated.persistence.digest,
    );
    const provider = successfulProvider();
    const input = {
      idempotencyKey: idem("agent-request-1"),
      keyDigest: generated.persistence.digest,
      principal,
      request: chatRequest(),
    };

    const first = await runAgentChat(input, {
      environment: ENVIRONMENT,
      now: context.now,
      provider,
      repository: context.repository,
    });
    const replay = await runAgentChat(input, {
      environment: ENVIRONMENT,
      now: context.now,
      provider,
      repository: context.repository,
    });

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      choices: [
        {
          message: {
            content: "Connection successful.",
            role: "assistant",
          },
        },
      ],
      model: "fast",
      object: "chat.completion",
      ygf: {
        credits_used: 10,
        provider_cost_micro_usd: 840,
        remaining_credits: 2990,
      },
    });
    expect(provider.run).toHaveBeenCalledTimes(1);
    await expect(
      context.campaign.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({
      providerCommittedMicroUsd: 840,
      providerReservedMicroUsd: 0,
      remainingBalance: 2990,
      reservedBalance: 0,
    });
    const accounting = context.repository.inspectAccountingForTests();
    expect(accounting.requests).toEqual([
      expect.objectContaining({
        creditsCharged: 10,
        inputUnits: 12,
        outputUnits: 5,
        providerCostCeilingMicroUsd: 8_000,
        providerCostMicroUsd: 840,
        state: "completed",
      }),
    ]);
    expect(accounting.usageEntries).toHaveLength(2);
    expect(accounting.usageEntries).toEqual([
      expect.objectContaining({
        balanceAfter: 2_904,
        creditsDelta: -96,
        entryKind: "reserve",
        providerCostMicroUsd: 8_000,
        providerReservedAfterMicroUsd: 8_000,
        reservedAfter: 96,
      }),
      expect.objectContaining({
        balanceAfter: 2_990,
        creditsDelta: 86,
        entryKind: "commit",
        providerCommittedAfterMicroUsd: 840,
        providerCostMicroUsd: 840,
        providerReservedAfterMicroUsd: 0,
        reservedAfter: 0,
      }),
    ]);
  });

  it("accepts a semantically identical terminal response with recursively reordered object keys", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const principal = await context.repository.authenticateKey(
      generated.persistence.digest,
    );
    const recordEvent = vi.fn(async () => undefined);
    const repository = transformTerminalResult(
      context.repository,
      (terminal) => ({
        ...terminal,
        resultPayload: reverseJsonObjectKeys(
          terminal.resultPayload,
        ) as Readonly<Record<string, unknown>>,
      }),
    );

    await expect(
      runAgentChat(
        {
          idempotencyKey: idem("agent-reordered-terminal-json"),
          keyDigest: generated.persistence.digest,
          principal,
          request: chatRequest(),
        },
        {
          environment: ENVIRONMENT,
          now: context.now,
          provider: successfulProvider(),
          recordEvent,
          repository,
        },
      ),
    ).resolves.toMatchObject({
      choices: [
        {
          message: { content: "Connection successful." },
        },
      ],
      ygf: { remaining_credits: 2_990 },
    });
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "agent_call_completed" }),
    );
  });

  it("persists the authoritative wallet balance when another key reserves during provider work", async () => {
    const context = await setup();
    const first = await context.createKey();
    const second = await context.createKey();
    const principal = await context.repository.authenticateKey(
      first.generated.persistence.digest,
    );
    const provider: AgentChatProvider = {
      name: "concurrent-wallet-reservation",
      run: vi.fn(async (input) => {
        await context.repository.beginRequest({
          creditCeiling: 1,
          idempotencyKey: idem("other-key-concurrent-reservation"),
          keyDigest: second.generated.persistence.digest,
          leaseExpiresAt: "2026-07-27T20:01:30.000Z",
          modelId: "server-model",
          ownerToken: randomUUID(),
          providerCostCeilingMicroUsd: 84,
          requestFingerprint: "e".repeat(64),
        });
        return {
          content: "Connection successful.",
          inputUnits: 12,
          model: input.model.providerId,
          outputUnits: 5,
          providerCostMicroUsd: 840,
          requestId: "provider-concurrent-wallet",
        };
      }),
    };
    const input = {
      idempotencyKey: idem("agent-concurrent-wallet-balance"),
      keyDigest: first.generated.persistence.digest,
      principal,
      request: chatRequest(),
    };

    const original = await runAgentChat(input, {
      environment: ENVIRONMENT,
      now: context.now,
      provider,
      recordEvent: async () => undefined,
      repository: context.repository,
    });
    const replay = await runAgentChat(input, {
      environment: ENVIRONMENT,
      now: context.now,
      provider,
      recordEvent: async () => undefined,
      repository: context.repository,
    });

    expect(original).toEqual(replay);
    expect(original).toMatchObject({
      ygf: { remaining_credits: 2_989 },
    });
    expect(provider.run).toHaveBeenCalledTimes(1);
    await expect(
      context.campaign.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({
      providerCommittedMicroUsd: 840,
      providerReservedMicroUsd: 84,
      remainingBalance: 2_989,
      reservedBalance: 1,
    });
    const commit = context.repository
      .inspectAccountingForTests()
      .usageEntries.find((entry) => entry.entryKind === "commit");
    expect(commit).toMatchObject({
      balanceAfter: 2_989,
      providerCommittedAfterMicroUsd: 840,
      providerReservedAfterMicroUsd: 84,
      reservedAfter: 1,
    });
  });

  it.each([
    "content",
    "state",
    "requestId",
    "shape",
  ] as const)(
    "fails closed when the terminal response changes %s",
    async (change) => {
      const context = await setup();
      const { generated } = await context.createKey();
      const principal = await context.repository.authenticateKey(
        generated.persistence.digest,
      );
      const recordEvent = vi.fn(async () => undefined);
      const repository = transformTerminalResult(
        context.repository,
        (terminal) => {
          if (change === "state") {
            return { ...terminal, state: "failed" };
          }
          if (change === "requestId") {
            return {
              ...terminal,
              requestId: "different-terminal-request",
            };
          }
          if (change === "shape") {
            return {
              ...terminal,
              resultPayload: {
                response: { object: "chat.completion" },
              },
            };
          }
          const payload = JSON.parse(
            JSON.stringify(terminal.resultPayload),
          ) as {
            response: {
              choices: {
                message: { content: string };
              }[];
            };
          };
          payload.response.choices[0]!.message.content =
            "Changed terminal content.";
          return { ...terminal, resultPayload: payload };
        },
      );

      await expect(
        runAgentChat(
          {
            idempotencyKey: idem(`agent-terminal-drift-${change}`),
            keyDigest: generated.persistence.digest,
            principal,
            request: chatRequest(),
          },
          {
            environment: ENVIRONMENT,
            now: context.now,
            provider: successfulProvider(),
            recordEvent,
            repository,
          },
        ),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(recordEvent.mock.calls).not.toEqual(
        expect.arrayContaining([
          [expect.objectContaining({ name: "agent_call_completed" })],
        ]),
      );
    },
  );

  it("refunds the full reservation when the provider fails", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const principal = await context.repository.authenticateKey(
      generated.persistence.digest,
    );
    const provider: AgentChatProvider = {
      name: "failing",
      async run() {
        throw new Error("provider detail must not escape");
      },
    };

    await expect(
      runAgentChat(
        {
          idempotencyKey: idem("agent-provider-failure"),
          keyDigest: generated.persistence.digest,
          principal,
          request: chatRequest(),
        },
        {
          environment: ENVIRONMENT,
          now: context.now,
          provider,
          repository: context.repository,
        },
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(
      context.campaign.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({
      providerCommittedMicroUsd: 8_000,
      providerReservedMicroUsd: 0,
      remainingBalance: 3000,
      reservedBalance: 0,
    });
    const accounting = context.repository.inspectAccountingForTests();
    expect(accounting.requests).toEqual([
      expect.objectContaining({
        creditsCharged: 0,
        inputUnits: 0,
        outputUnits: 0,
        providerCostCeilingMicroUsd: 8_000,
        providerCostMicroUsd: 8_000,
        state: "failed",
      }),
    ]);
    expect(accounting.usageEntries).toHaveLength(2);
    expect(accounting.usageEntries[1]).toMatchObject({
      balanceAfter: 3_000,
      creditsDelta: 96,
      entryKind: "refund",
      providerCommittedAfterMicroUsd: 8_000,
      providerCostMicroUsd: 8_000,
      providerReservedAfterMicroUsd: 0,
      reservedAfter: 0,
    });
  });

  it("expires replay content without re-executing or charging again", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const principal = await context.repository.authenticateKey(
      generated.persistence.digest,
    );
    const provider = successfulProvider();
    const input = {
      idempotencyKey: idem("agent-expired-replay"),
      keyDigest: generated.persistence.digest,
      principal,
      request: chatRequest(),
    };

    await expect(
      runAgentChat(input, {
        environment: ENVIRONMENT,
        now: context.now,
        provider,
        recordEvent: async () => undefined,
        repository: context.repository,
      }),
    ).resolves.toMatchObject({
      ygf: { remaining_credits: 2990 },
    });
    context.setNow("2026-07-27T20:16:00.000Z");
    await expect(
      runAgentChat(input, {
        environment: ENVIRONMENT,
        now: context.now,
        provider,
        recordEvent: async () => undefined,
        repository: context.repository,
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(provider.run).toHaveBeenCalledTimes(1);
    await expect(
      context.campaign.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({
      providerCommittedMicroUsd: 840,
      remainingBalance: 2990,
    });
  });

  it("conservatively settles a stale lease once while refunding Credits", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const startedAt = context.now();
    const request = {
      creditCeiling: 96,
      idempotencyKey: idem("agent-stale-provider-attempt"),
      keyDigest: generated.persistence.digest,
      leaseExpiresAt: new Date(
        startedAt.getTime() + 1_000,
      ).toISOString(),
      modelId: chatRequest().model.providerId,
      ownerToken: randomUUID(),
      providerCostCeilingMicroUsd: 8_000,
      requestFingerprint: "a".repeat(64),
    };
    await expect(context.repository.beginRequest(request)).resolves.toMatchObject({
      state: "owner",
    });

    context.setNow("2026-07-27T20:00:02.000Z");
    await expect(context.repository.beginRequest(request)).resolves.toMatchObject({
      state: "failed",
    });
    await expect(context.repository.beginRequest(request)).resolves.toMatchObject({
      state: "failed",
    });
    await expect(
      context.campaign.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({
      providerCommittedMicroUsd: 8_000,
      providerReservedMicroUsd: 0,
      remainingBalance: 3_000,
      reservedBalance: 0,
    });
    await expect(context.repository.listKeys("demo-user")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerCommittedMicroUsd: 8_000 }),
      ]),
    );
    const accounting = context.repository.inspectAccountingForTests();
    expect(accounting.requests).toEqual([
      expect.objectContaining({
        creditsCharged: 0,
        inputUnits: 0,
        outputUnits: 0,
        providerCostCeilingMicroUsd: 8_000,
        providerCostMicroUsd: 8_000,
        state: "failed",
      }),
    ]);
    expect(accounting.usageEntries).toHaveLength(2);
    expect(accounting.usageEntries.map((entry) => entry.entryKind)).toEqual([
      "reserve",
      "refund",
    ]);
    expect(accounting.usageEntries[1]).toMatchObject({
      creditsDelta: 96,
      providerCostMicroUsd: 8_000,
    });
  });

  it("rejects failed terminal costs below the exact reserved ceiling", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const ownerToken = randomUUID();
    const begun = await context.repository.beginRequest({
      creditCeiling: 96,
      idempotencyKey: idem("agent-exact-failed-cost"),
      keyDigest: generated.persistence.digest,
      leaseExpiresAt: new Date(
        context.now().getTime() + 90_000,
      ).toISOString(),
      modelId: chatRequest().model.providerId,
      ownerToken,
      providerCostCeilingMicroUsd: 8_000,
      requestFingerprint: "c".repeat(64),
    });
    const failed = (providerCostMicroUsd: number) =>
      context.repository.terminalizeRequest({
        creditsCharged: 0,
        errorCode: "PROVIDER_UNAVAILABLE",
        inputUnits: 0,
        outputUnits: 0,
        ownerToken,
        providerCostMicroUsd,
        requestId: begun.requestId,
        resultPayload: { error: "AGENT_UNAVAILABLE" },
        state: "failed",
      });

    await expect(failed(0)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(failed(7_999)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(context.repository.inspectAccountingForTests()).toMatchObject({
      requests: [{ state: "running" }],
      usageEntries: [{ entryKind: "reserve" }],
    });
    const terminal = await failed(8_000);
    await expect(failed(8_000)).resolves.toEqual(terminal);
    const accounting = context.repository.inspectAccountingForTests();
    expect(accounting.requests).toEqual([
      expect.objectContaining({
        providerCostMicroUsd: 8_000,
        state: "failed",
      }),
    ]);
    expect(accounting.usageEntries).toHaveLength(2);
    expect(accounting.usageEntries[1]).toMatchObject({
      entryKind: "refund",
      providerCostMicroUsd: 8_000,
    });
  });

  it("rejects a malformed completed response before mutating reserved accounting", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const ownerToken = randomUUID();
    const begun = await context.repository.beginRequest({
      creditCeiling: 96,
      idempotencyKey: idem("agent-malformed-completed-payload"),
      keyDigest: generated.persistence.digest,
      leaseExpiresAt: new Date(
        context.now().getTime() + 90_000,
      ).toISOString(),
      modelId: chatRequest().model.providerId,
      ownerToken,
      providerCostCeilingMicroUsd: 8_000,
      requestFingerprint: "f".repeat(64),
    });

    await expect(
      context.repository.terminalizeRequest({
        creditsCharged: 10,
        inputUnits: 12,
        outputUnits: 5,
        ownerToken,
        providerCostMicroUsd: 840,
        requestId: begun.requestId,
        resultPayload: {
          response: { object: "chat.completion" },
        },
        state: "completed",
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(
      context.campaign.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({
      providerCommittedMicroUsd: 0,
      providerReservedMicroUsd: 8_000,
      remainingBalance: 2_904,
      reservedBalance: 96,
    });
    expect(context.repository.inspectAccountingForTests()).toMatchObject({
      requests: [{ state: "running" }],
      usageEntries: [{ entryKind: "reserve" }],
    });
  });

  it("fails closed when stale cleanup wins the provider-success race", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const principal = await context.repository.authenticateKey(
      generated.persistence.digest,
    );
    let release: ((value: AgentProviderResult) => void) | undefined;
    const provider: AgentChatProvider = {
      name: "deferred-success",
      run: vi.fn(
        () =>
          new Promise<AgentProviderResult>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const recordEvent = vi.fn(async () => undefined);
    const owner = runAgentChat(
      {
        idempotencyKey: idem("agent-stale-success-race"),
        keyDigest: generated.persistence.digest,
        principal,
        request: chatRequest(),
      },
      {
        environment: ENVIRONMENT,
        now: context.now,
        provider,
        recordEvent,
        repository: context.repository,
      },
    );
    await vi.waitFor(() => {
      expect(provider.run).toHaveBeenCalledTimes(1);
      expect(release).toBeTypeOf("function");
    });

    context.setNow("2026-07-27T20:01:31.000Z");
    await expect(
      context.repository.beginRequest({
        creditCeiling: 1,
        idempotencyKey: idem("agent-trigger-stale-cleanup"),
        keyDigest: generated.persistence.digest,
        leaseExpiresAt: "2026-07-27T20:03:01.000Z",
        modelId: "server-model",
        ownerToken: randomUUID(),
        providerCostCeilingMicroUsd: 250_000,
        requestFingerprint: "d".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_LIMIT_REACHED" });
    release?.({
      content: "This late success must not escape.",
      inputUnits: 12,
      model: chatRequest().model.providerId,
      outputUnits: 5,
      providerCostMicroUsd: 840,
      requestId: "late-provider-success",
    });
    await expect(owner).rejects.toMatchObject({ code: "UNAVAILABLE" });

    const accounting = context.repository.inspectAccountingForTests();
    expect(accounting.requests).toEqual([
      expect.objectContaining({
        providerCostMicroUsd: 8_000,
        state: "failed",
      }),
    ]);
    expect(accounting.usageEntries).toHaveLength(2);
    expect(accounting.usageEntries.map((entry) => entry.entryKind)).toEqual([
      "reserve",
      "refund",
    ]);
    expect(recordEvent.mock.calls).not.toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ name: "agent_call_completed" })],
      ]),
    );
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "agent_call_failed" }),
    );
    await expect(
      context.campaign.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({
      providerCommittedMicroUsd: 8_000,
      providerReservedMicroUsd: 0,
      remainingBalance: 3_000,
      reservedBalance: 0,
    });
  });

  it("reaches the shared wallet provider cap after failed provider attempts", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const principal = await context.repository.authenticateKey(
      generated.persistence.digest,
    );
    const provider: AgentChatProvider = {
      name: "failing",
      run: vi.fn(async () => {
        throw new Error("upstream admission may have billed");
      }),
    };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await expect(
        runAgentChat(
          {
            idempotencyKey: idem(`agent-failed-cap-${attempt}`),
            keyDigest: generated.persistence.digest,
            principal,
            request: chatRequest("reasoning"),
          },
          {
            environment: ENVIRONMENT,
            now: context.now,
            provider,
            repository: context.repository,
          },
        ),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    }
    context.setNow("2026-07-27T20:01:01.000Z");
    await expect(
      runAgentChat(
        {
          idempotencyKey: idem("agent-failed-cap-blocked"),
          keyDigest: generated.persistence.digest,
          principal,
          request: chatRequest("reasoning"),
        },
        {
          environment: ENVIRONMENT,
          now: context.now,
          provider,
          repository: context.repository,
        },
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_LIMIT_REACHED" });
    expect(provider.run).toHaveBeenCalledTimes(12);
    await expect(
      context.campaign.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({
      providerCommittedMicroUsd: 240_000,
      providerReservedMicroUsd: 0,
      remainingBalance: 3_000,
      reservedBalance: 0,
    });
  });

  it("rejects concurrent duplicate execution and charges only the owner", async () => {
    const context = await setup();
    const { generated } = await context.createKey();
    const principal = await context.repository.authenticateKey(
      generated.persistence.digest,
    );
    let release:
      | ((result: AgentProviderResult) => void)
      | undefined;
    const provider: AgentChatProvider = {
      name: "deferred",
      run: vi.fn(
        (input) =>
          new Promise<AgentProviderResult>((resolve) => {
            release = resolve;
            expect(input.model.id).toBe("fast");
          }),
      ),
    };
    const input = {
      idempotencyKey: idem("agent-concurrent-1"),
      keyDigest: generated.persistence.digest,
      principal,
      request: chatRequest(),
    };
    const owner = runAgentChat(input, {
      environment: ENVIRONMENT,
      now: context.now,
      provider,
      repository: context.repository,
    });
    await vi.waitFor(() => {
      expect(provider.run).toHaveBeenCalledTimes(1);
      expect(release).toBeTypeOf("function");
    });

    await expect(
      runAgentChat(input, {
        environment: ENVIRONMENT,
        now: context.now,
        provider,
        repository: context.repository,
      }),
    ).rejects.toMatchObject({ code: "CONCURRENCY_LIMITED" });

    release?.({
      content: "One owner.",
      inputUnits: 4,
      model: chatRequest().model.providerId,
      outputUnits: 2,
      providerCostMicroUsd: 840,
      requestId: "provider-concurrent",
    });
    await expect(owner).resolves.toMatchObject({
      ygf: { remaining_credits: 2990 },
    });
    expect(provider.run).toHaveBeenCalledTimes(1);
  });

  it("rejects revoked, rotated, and expired keys generically", async () => {
    const context = await setup();
    const first = await context.createKey();
    await context.repository.revokeKey(
      "demo-user",
      first.descriptor.id,
    );
    await expect(
      context.repository.authenticateKey(
        first.generated.persistence.digest,
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });

    const second = await context.createKey();
    const replacement = generateAgentApiKey({
      digestSecret: DIGEST_SECRET,
    });
    await context.repository.rotateKey(
      "demo-user",
      second.descriptor.id,
      {
        createdAt: context.now().toISOString(),
        expiresAt: context.wallet.expiresAt,
        limits: second.descriptor.limits,
        persistence: replacement.persistence,
        scopes: AGENT_API_KEY_SCOPES,
        userId: "demo-user",
        walletId: context.wallet.id,
      },
    );
    await expect(
      context.repository.authenticateKey(
        second.generated.persistence.digest,
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    await expect(
      context.repository.authenticateKey(
        replacement.persistence.digest,
      ),
    ).resolves.toMatchObject({ userId: "demo-user" });

    context.setNow("2026-08-11T20:00:00.000Z");
    await expect(
      context.repository.authenticateKey(
        replacement.persistence.digest,
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("uses the wallet-wide provider cap across multiple keys", async () => {
    const context = await setup();
    const first = await context.createKey();
    const second = await context.createKey();
    const lease = new Date(
      context.now().getTime() + 90_000,
    ).toISOString();

    await expect(
      context.repository.beginRequest({
        creditCeiling: 1,
        idempotencyKey: idem("cap-first"),
        keyDigest: first.generated.persistence.digest,
        leaseExpiresAt: lease,
        modelId: "server-model",
        ownerToken: randomUUID(),
        providerCostCeilingMicroUsd: 250_000,
        requestFingerprint: "a".repeat(64),
      }),
    ).resolves.toMatchObject({ state: "owner" });
    await expect(
      context.repository.beginRequest({
        creditCeiling: 1,
        idempotencyKey: idem("cap-second"),
        keyDigest: second.generated.persistence.digest,
        leaseExpiresAt: lease,
        modelId: "server-model",
        ownerToken: randomUUID(),
        providerCostCeilingMicroUsd: 1,
        requestFingerprint: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_LIMIT_REACHED" });
  });

  it("rejects provider ids and models outside the public allowlist", () => {
    expect(() => chatRequest("openai/gpt-4.1-mini")).toThrow(
      "AGENT_MODEL_NOT_ALLOWED",
    );
    expect(() => chatRequest("unapproved-model")).toThrow(
      "AGENT_MODEL_NOT_ALLOWED",
    );
  });
});
