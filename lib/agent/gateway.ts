import { createHmac, randomUUID } from "node:crypto";

import { MAX_WALLET_CREDITS } from "@/lib/campaign/credits";
import type { CampaignEventMetadata } from "@/lib/campaign/types";
import type {
  ParsedAgentChatRequest,
} from "@/lib/agent/openai-contract";
import {
  costMicroUsdToCredits,
  DEFAULT_MICRO_USD_PER_CREDIT,
} from "@/lib/agent/policy";
import { recordProductSignal } from "@/lib/analytics/product-signals";
import {
  getAgentChatProvider,
  type AgentChatProvider,
} from "@/lib/agent/provider";
import { deriveSafetyIdentifier } from "@/lib/providers/openai-chat-client";
import { serverSecret, type RuntimeEnvironment } from "@/lib/auth/runtime";
import { fingerprintClientIdempotencyKey } from "@/lib/agent/idempotency";
import type { RecordEventInput } from "@/lib/repositories/campaign-repository";
import {
  AgentGatewayError,
  getAgentGatewayRepository,
  type AgentGatewayRepository,
  type AgentPrincipal,
} from "@/lib/repositories/agent-gateway-repository";

interface RunAgentChatInput {
  idempotencyKey: string;
  keyDigest: string;
  principal: AgentPrincipal;
  request: ParsedAgentChatRequest;
}

interface RunAgentChatDependencies {
  environment?: RuntimeEnvironment;
  now?: () => Date;
  provider?: AgentChatProvider;
  recordEvent?: (input: RecordEventInput) => Promise<unknown>;
  repository?: AgentGatewayRepository;
}

type AgentEventModel = NonNullable<CampaignEventMetadata["model"]>;

async function recordSafely(
  recordEvent: (input: RecordEventInput) => Promise<unknown>,
  input: RecordEventInput,
) {
  await recordEvent(input).catch(() => undefined);
}

function fingerprint(
  request: ParsedAgentChatRequest,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update("ygf-agent-request:v1:", "utf8")
    .update(
      JSON.stringify({
        maxTokens: request.maxTokens,
        messages: request.messages,
        model: request.model.providerId,
        temperature: request.temperature,
      }),
      "utf8",
    )
    .digest("hex");
}

function validIdempotencyKey(value: string) {
  return (
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  );
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

function nonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function replayPayload(value: unknown): Readonly<Record<string, unknown>> {
  if (!plainRecord(value) || !plainRecord(value.response)) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  const response = value.response;
  const choices = response.choices;
  const usage = response.usage;
  const ygf = response.ygf;
  if (
    !Array.isArray(choices) ||
    choices.length !== 1 ||
    !plainRecord(choices[0]) ||
    choices[0].finish_reason !== "stop" ||
    choices[0].index !== 0 ||
    !plainRecord(choices[0].message) ||
    choices[0].message.role !== "assistant" ||
    typeof choices[0].message.content !== "string" ||
    choices[0].message.content.length < 1 ||
    choices[0].message.content.length > 32_000 ||
    response.object !== "chat.completion" ||
    typeof response.id !== "string" ||
    !/^chatcmpl_[A-Za-z0-9_-]{1,160}$/u.test(response.id) ||
    typeof response.model !== "string" ||
    !/^[a-z0-9][a-z0-9.-]{0,127}$/u.test(response.model) ||
    !nonnegativeSafeInteger(response.created) ||
    !plainRecord(usage) ||
    !nonnegativeSafeInteger(usage.prompt_tokens) ||
    !nonnegativeSafeInteger(usage.completion_tokens) ||
    !nonnegativeSafeInteger(usage.total_tokens) ||
    usage.total_tokens !==
      usage.prompt_tokens + usage.completion_tokens ||
    !plainRecord(ygf) ||
    !nonnegativeSafeInteger(ygf.credits_used) ||
    ygf.credits_used > 3_000 ||
    !nonnegativeSafeInteger(ygf.remaining_credits) ||
    ygf.remaining_credits > MAX_WALLET_CREDITS
  ) {
    throw new AgentGatewayError("UNAVAILABLE");
  }

  // Reconstruct the public response instead of replaying stored JSON. This
  // strips legacy/internal fields (including provider-cost estimates) from
  // pre-deploy idempotency rows and prevents future persistence fields from
  // crossing the customer response boundary.
  return responseObject({
    content: choices[0].message.content,
    created: response.created,
    creditsUsed: ygf.credits_used,
    id: response.id.slice("chatcmpl_".length),
    inputUnits: usage.prompt_tokens,
    model: response.model,
    outputUnits: usage.completion_tokens,
    remainingCredits: ygf.remaining_credits,
  });
}

function canonicalJson(value: unknown): string {
  const maximumDepth = 64;
  const maximumNodes = 10_000;
  const maximumLength = 50_000;
  let nodes = 0;

  function encode(candidate: unknown, depth: number): string {
    nodes += 1;
    if (nodes > maximumNodes || depth > maximumDepth) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    if (candidate === null) {
      return "null";
    }
    if (typeof candidate === "string") {
      return JSON.stringify(candidate);
    }
    if (typeof candidate === "boolean") {
      return candidate ? "true" : "false";
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        throw new AgentGatewayError("UNAVAILABLE");
      }
      return JSON.stringify(candidate);
    }
    if (Array.isArray(candidate)) {
      return `[${candidate
        .map((item) => encode(item, depth + 1))
        .join(",")}]`;
    }
    if (
      typeof candidate !== "object" ||
      Object.getOwnPropertySymbols(candidate).length > 0
    ) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    const object = candidate as Readonly<Record<string, unknown>>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${encode(
            object[key],
            depth + 1,
          )}`,
      )
      .join(",")}}`;
  }

  const encoded = encode(value, 0);
  if (encoded.length > maximumLength) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  return encoded;
}

function responseObject({
  content,
  created,
  id,
  inputUnits,
  model,
  outputUnits,
  creditsUsed,
  remainingCredits,
}: {
  content: string;
  created: number;
  creditsUsed: number;
  id: string;
  inputUnits: number;
  model: string;
  outputUnits: number;
  remainingCredits: number;
}): Readonly<Record<string, unknown>> {
  return {
    choices: [
      {
        finish_reason: "stop",
        index: 0,
        message: {
          content,
          role: "assistant",
        },
      },
    ],
    created,
    id: `chatcmpl_${id}`,
    model,
    object: "chat.completion",
    usage: {
      completion_tokens: outputUnits,
      prompt_tokens: inputUnits,
      total_tokens: inputUnits + outputUnits,
    },
    ygf: {
      credits_used: creditsUsed,
      remaining_credits: remainingCredits,
    },
  };
}

export async function runAgentChat(
  input: RunAgentChatInput,
  {
    environment = process.env,
    now = () => new Date(),
    provider = getAgentChatProvider(environment),
    recordEvent = recordProductSignal,
    repository = getAgentGatewayRepository(),
  }: RunAgentChatDependencies = {},
): Promise<Readonly<Record<string, unknown>>> {
  if (
    !validIdempotencyKey(input.idempotencyKey) ||
    !/^idem_[0-9a-f]{64}$/u.test(input.idempotencyKey)
  ) {
    throw new Error("AGENT_IDEMPOTENCY_KEY_INVALID");
  }
  if (
    !input.principal.scopes.includes("chat:completions") ||
    input.principal.remainingCredits < 1
  ) {
    throw new AgentGatewayError("INSUFFICIENT_CREDITS");
  }

  const providerCostCeilingMicroUsd =
    input.request.model.maxCostMicroUsd;
  const creditCeiling = costMicroUsdToCredits(
    providerCostCeilingMicroUsd,
    Number(
      environment.YGF_AGENT_MICRO_USD_PER_CREDIT ??
        DEFAULT_MICRO_USD_PER_CREDIT,
    ),
  );
  const startedAt = now();
  const ownerToken = randomUUID();
  const requestFingerprintSecret = serverSecret(
    "YGF_AGENT_REQUEST_FINGERPRINT_SECRET",
    environment,
    process.env.NODE_ENV,
  );
  let execution;
  try {
    execution = await repository.beginRequest({
      creditCeiling,
      idempotencyKey: input.idempotencyKey,
      keyDigest: input.keyDigest,
      leaseExpiresAt: new Date(
        startedAt.getTime() + 90_000,
      ).toISOString(),
      modelId: input.request.model.providerId,
      ownerToken,
      providerCostCeilingMicroUsd,
      requestFingerprint: fingerprint(
        input.request,
        requestFingerprintSecret,
      ),
    });
  } catch (error) {
    if (error instanceof AgentGatewayError) {
      const outcome =
        error.code === "RATE_LIMITED"
          ? "throttled"
          : error.code === "CONCURRENCY_LIMITED" ||
              error.code === "IDEMPOTENCY_CONFLICT"
            ? "blocked"
            : "failure";
      if (error.code !== "RATE_LIMITED") await recordSafely(recordEvent, {
        metadata: {
          model: input.request.model.id as AgentEventModel,
          outcome,
        },
        name: "agent_call_failed",
        source: "agent",
        userId: input.principal.userId,
      });
    }
    throw error;
  }

  if (execution.state === "completed") {
    return replayPayload(execution.resultPayload);
  }
  if (execution.state === "failed") {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  if (
    execution.state !== "owner" ||
    !execution.ownerToken
  ) {
    throw new AgentGatewayError("CONCURRENCY_LIMITED");
  }

  try {
    const result = await provider.run({
      maxTokens: input.request.maxTokens,
      messages: input.request.messages,
      model: input.request.model,
      requestTraceId: execution.requestId,
      safetyIdentifier: deriveSafetyIdentifier(
        requestFingerprintSecret,
        input.principal.userId,
      ),
      temperature: input.request.temperature,
    });
    const providerCostMicroUsd =
      result.providerCostMicroUsd ??
      providerCostCeilingMicroUsd;
    if (
      result.model !== input.request.model.providerId ||
      !Number.isSafeInteger(result.inputUnits) ||
      result.inputUnits < 0 ||
      !Number.isSafeInteger(result.outputUnits) ||
      result.outputUnits < 0 ||
      !Number.isSafeInteger(providerCostMicroUsd) ||
      providerCostMicroUsd < 0 ||
      providerCostMicroUsd > providerCostCeilingMicroUsd ||
      typeof result.content !== "string" ||
      result.content.length < 1 ||
      result.content.length > 32_000
    ) {
      throw new Error("PROVIDER_UNAVAILABLE");
    }
    const creditsUsed = costMicroUsdToCredits(
      providerCostMicroUsd,
      Number(
        environment.YGF_AGENT_MICRO_USD_PER_CREDIT ??
          DEFAULT_MICRO_USD_PER_CREDIT,
      ),
    );
    const projectedRemaining =
      (execution.remainingCredits ?? input.principal.remainingCredits) +
      creditCeiling -
      creditsUsed;
    const response = responseObject({
      content: result.content,
      created: Math.floor(startedAt.getTime() / 1_000),
      creditsUsed,
      id: execution.requestId,
      inputUnits: result.inputUnits,
      model: input.request.model.id,
      outputUnits: result.outputUnits,
      remainingCredits: Math.max(0, projectedRemaining),
    });
    const terminal = await repository.terminalizeRequest({
      creditsCharged: creditsUsed,
      inputUnits: result.inputUnits,
      outputUnits: result.outputUnits,
      ownerToken: execution.ownerToken,
      providerCostMicroUsd,
      requestId: execution.requestId,
      resultPayload: { response },
      state: "completed",
    });
    const persistedResponse = replayPayload(terminal.resultPayload);
    const expectedResponse = responseObject({
      content: result.content,
      created: Math.floor(startedAt.getTime() / 1_000),
      creditsUsed,
      id: execution.requestId,
      inputUnits: result.inputUnits,
      model: input.request.model.id,
      outputUnits: result.outputUnits,
      remainingCredits: terminal.remainingCredits,
    });
    if (
      terminal.state !== "completed" ||
      terminal.requestId !== execution.requestId ||
      terminal.errorCode !== undefined ||
      !Number.isSafeInteger(terminal.remainingCredits) ||
      terminal.remainingCredits < 0 ||
      terminal.remainingCredits > MAX_WALLET_CREDITS ||
      !Number.isFinite(new Date(terminal.resultExpiresAt).getTime()) ||
      canonicalJson(persistedResponse) !==
        canonicalJson(expectedResponse)
    ) {
      throw new Error("AGENT_TERMINAL_INVALID");
    }
    await recordSafely(recordEvent, {
      metadata: {
        credits: creditsUsed,
        model: input.request.model.id as AgentEventModel,
        outcome: "success",
      },
      name: "agent_call_completed",
      source: "agent",
      userId: input.principal.userId,
    });
    return persistedResponse;
  } catch {
    await repository
      .terminalizeRequest({
        creditsCharged: 0,
        errorCode: "PROVIDER_UNAVAILABLE",
        inputUnits: 0,
        outputUnits: 0,
        ownerToken: execution.ownerToken,
        // Provider admission can have reached the upstream even when no valid
        // response comes back. Refund Credits, but retain the cost ceiling.
        providerCostMicroUsd: providerCostCeilingMicroUsd,
        requestId: execution.requestId,
        resultPayload: {
          error: {
            code: "provider_unavailable",
            message: "The model provider is temporarily unavailable.",
            type: "server_error",
          },
        },
        state: "failed",
      })
      .catch(() => undefined);
    await recordSafely(recordEvent, {
      metadata: {
        model: input.request.model.id as AgentEventModel,
        outcome: "failure",
      },
      name: "agent_call_failed",
      source: "agent",
      userId: input.principal.userId,
    });
    throw new AgentGatewayError("UNAVAILABLE");
  }
}

export function fingerprintAgentIdempotencyKey(
  value: unknown,
  environment: RuntimeEnvironment = process.env,
) {
  return fingerprintClientIdempotencyKey({
    domain: "ygf-agent-idempotency:v1",
    environment,
    secretName: "YGF_AGENT_REQUEST_FINGERPRINT_SECRET",
    value,
  });
}
