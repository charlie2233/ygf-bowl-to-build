import { createHmac, randomUUID } from "node:crypto";

import {
  serverSecret,
  type RuntimeEnvironment,
} from "@/lib/auth/runtime";
import {
  getTaskDefinition,
  isTaskType,
  validateTaskInput,
} from "@/lib/content/tasks";
import { MAX_WALLET_CREDITS } from "@/lib/campaign/credits";
import type { TaskType } from "@/lib/campaign/types";
import {
  friendlyModelName,
  resolveModel,
} from "@/lib/providers/model-catalog";
import { deriveSafetyIdentifier } from "@/lib/providers/openai-chat-client";
import type {
  TaskOutput,
  TaskProvider,
  TaskProviderResult,
} from "@/lib/providers/provider";
import { parseTaskOutput } from "@/lib/providers/provider";
import {
  compactSpendResult,
  type TaskExecutionResult,
  type TaskWorkflowRepository,
} from "@/lib/repositories/task-workflow-repository";

const RESULT_TTL_MS = 15 * 60 * 1_000;
const RESULT_STORE_LIMIT = 1_000;

export interface RunTaskInput {
  idempotencyKey: string;
  input: unknown;
  model?: unknown;
  saveResult?: boolean;
  taskType: unknown;
  /**
   * Trusted identity derived by the server route. Browser request parsing must
   * never accept this field.
   */
  userId: string;
}

export interface TaskCompletedResult {
  friendlyModel: string;
  output: TaskOutput;
  providerCostMicroUsd?: number;
  providerRequestId?: string;
  remainingCredits: number;
  sessionId: string;
  status: "completed";
}

export interface TaskFailedResult {
  error: "PROVIDER_UNAVAILABLE";
  remainingCredits: number;
  sessionId: string;
  status: "failed";
}

export type RunTaskResult = TaskCompletedResult | TaskFailedResult;

interface StoredResult {
  expiresAt: number;
  fingerprint: string;
  result: RunTaskResult;
  userId: string;
}

interface InFlightResult {
  fingerprint: string;
  promise: Promise<RunTaskResult>;
}

export class MemoryTaskResultStore {
  readonly #entries = new Map<string, StoredResult>();
  readonly #inFlight = new Map<string, InFlightResult>();
  readonly #outputBySession = new Map<
    string,
    { expiresAt: number; output: TaskOutput; userId: string }
  >();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  private storageKey(userId: string, idempotencyKey: string) {
    return `${userId}:${idempotencyKey}`;
  }

  private prune() {
    const now = this.#now();
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) {
        this.#entries.delete(key);
      }
    }
    for (const [key, entry] of this.#outputBySession) {
      if (entry.expiresAt <= now) {
        this.#outputBySession.delete(key);
      }
    }
    while (this.#entries.size > RESULT_STORE_LIMIT) {
      const oldest = this.#entries.keys().next().value;
      if (typeof oldest !== "string") {
        break;
      }
      this.#entries.delete(oldest);
    }
  }

  async run(
    userId: string,
    idempotencyKey: string,
    fingerprint: string,
    operation: () => Promise<RunTaskResult>,
  ) {
    this.prune();
    const key = this.storageKey(userId, idempotencyKey);
    const prior = this.#entries.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new Error("TASK_IDEMPOTENCY_CONFLICT");
      }
      return prior.result;
    }
    const inFlight = this.#inFlight.get(key);
    if (inFlight) {
      if (inFlight.fingerprint !== fingerprint) {
        throw new Error("TASK_IDEMPOTENCY_CONFLICT");
      }
      return inFlight.promise;
    }

    const promise = operation()
      .then((result) => {
        const expiresAt = this.#now() + RESULT_TTL_MS;
        this.#entries.set(key, {
          expiresAt,
          fingerprint,
          result,
          userId,
        });
        if (result.status === "completed") {
          this.#outputBySession.set(result.sessionId, {
            expiresAt,
            output: result.output,
            userId,
          });
        }
        return result;
      })
      .finally(() => {
        this.#inFlight.delete(key);
      });
    this.#inFlight.set(key, { fingerprint, promise });
    return promise;
  }

  getOutput(userId: string, sessionId: string) {
    this.prune();
    const saved = this.#outputBySession.get(sessionId);
    if (!saved || saved.userId !== userId) {
      return null;
    }
    return saved.output;
  }
}

export interface TaskRateLimiter {
  admit(userId: string): boolean;
}

export function createTaskRateLimiter({
  limit = 8,
  now = Date.now,
  windowMs = 60_000,
}: {
  limit?: number;
  now?: () => number;
  windowMs?: number;
} = {}): TaskRateLimiter {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1_000
  ) {
    throw new Error("TASK_RATE_LIMIT_INVALID");
  }
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  return {
    admit(userId) {
      const current = now();
      const prior = buckets.get(userId);
      if (!prior || prior.expiresAt <= current) {
        buckets.set(userId, {
          count: 1,
          expiresAt: current + windowMs,
        });
        return true;
      }
      if (prior.count >= limit) {
        return false;
      }
      prior.count += 1;
      return true;
    },
  };
}

export interface RunTaskDependencies {
  fingerprintSecret: string;
  provider: TaskProvider;
  rateLimiter: TaskRateLimiter;
  repository: TaskWorkflowRepository;
  resultStore: MemoryTaskResultStore;
}

function validateIdentifier(
  value: unknown,
  error: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  ) {
    throw new Error(error);
  }
}

export function resolveTaskFingerprintSecret(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
) {
  return serverSecret(
    "YGF_TASK_FINGERPRINT_SECRET",
    environment,
    nodeEnvironment,
  );
}

function inputFingerprint({
  input,
  modelId,
  saveResult,
  secret,
  taskType,
}: {
  input: string;
  modelId: string;
  saveResult: boolean;
  secret: string;
  taskType: TaskType;
}) {
  return createHmac("sha256", secret)
    .update(
      JSON.stringify({
        input,
        modelId,
        saveResult,
        taskType,
      }),
    )
    .digest("hex");
}

function validResultIdentity(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128
  );
}

function replayResult(
  execution: TaskExecutionResult,
  modelId: string,
): RunTaskResult {
  if (
    (execution.state !== "completed" &&
      execution.state !== "failed") ||
    !validResultIdentity(execution.sessionId) ||
    typeof execution.remainingCredits !== "number" ||
    !Number.isSafeInteger(execution.remainingCredits) ||
    Number(execution.remainingCredits) < 0 ||
    Number(execution.remainingCredits) > MAX_WALLET_CREDITS
  ) {
    throw new Error("TASK_UNAVAILABLE");
  }
  if (
    typeof execution.resultPayload !== "object" ||
    execution.resultPayload === null
  ) {
    throw new Error("RESULT_REPLAY_EXPIRED");
  }
  if (execution.state === "failed") {
    const error = (execution.resultPayload as { error?: unknown }).error;
    if (
      error !== "PROVIDER_UNAVAILABLE" ||
      execution.errorCode !== "PROVIDER_UNAVAILABLE"
    ) {
      throw new Error("TASK_UNAVAILABLE");
    }
    return {
      error,
      remainingCredits: execution.remainingCredits,
      sessionId: execution.sessionId,
      status: "failed",
    };
  }
  const output = parseTaskOutput(
    (execution.resultPayload as { output?: unknown }).output,
  );
  return {
    friendlyModel: friendlyModelName(modelId),
    output,
    remainingCredits: execution.remainingCredits,
    sessionId: execution.sessionId,
    status: "completed",
  };
}

function safeProviderResult(
  result: TaskProviderResult,
  expectedModel: string,
  maximumCost: number,
) {
  if (
    result.model !== expectedModel ||
    typeof result.requestId !== "string" ||
    result.requestId.length < 1 ||
    result.requestId.length > 200 ||
    !Number.isSafeInteger(result.inputUnits) ||
    result.inputUnits < 0 ||
    !Number.isSafeInteger(result.outputUnits) ||
    result.outputUnits < 0
  ) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }
  const cost =
    result.providerCostMicroUsd === undefined
      ? maximumCost
      : result.providerCostMicroUsd;
  if (
    !Number.isSafeInteger(cost) ||
    cost < 0 ||
    cost > maximumCost
  ) {
    throw new Error("PROVIDER_UNAVAILABLE");
  }
  return cost;
}

async function safeRecordEvent(
  repository: TaskWorkflowRepository,
  input: Parameters<TaskWorkflowRepository["recordEvent"]>[0],
) {
  await Promise.resolve()
    .then(() => repository.recordEvent(input))
    .catch(() => undefined);
}

function latencyBucket(
  elapsedMs: number,
): "under-30s" | "30-60s" | "60-90s" | "over-90s" {
  if (elapsedMs < 30_000) {
    return "under-30s";
  }
  if (elapsedMs < 60_000) {
    return "30-60s";
  }
  if (elapsedMs < 90_000) {
    return "60-90s";
  }
  return "over-90s";
}

export async function runTask(
  untrusted: RunTaskInput,
  dependencies: RunTaskDependencies,
): Promise<RunTaskResult> {
  validateIdentifier(untrusted.userId, "USER_INVALID");
  validateIdentifier(
    untrusted.idempotencyKey,
    "IDEMPOTENCY_INVALID",
  );
  if (!isTaskType(untrusted.taskType)) {
    throw new Error("TASK_TYPE_INVALID");
  }
  const taskType = untrusted.taskType;
  if (
    untrusted.saveResult !== undefined &&
    typeof untrusted.saveResult !== "boolean"
  ) {
    throw new Error("TASK_SAVE_INVALID");
  }

  const task = getTaskDefinition(taskType);
  const input = validateTaskInput(untrusted.input);
  const model = resolveModel(taskType, untrusted.model);
  const saveResult = untrusted.saveResult === true;
  if (Buffer.byteLength(dependencies.fingerprintSecret, "utf8") < 32) {
    throw new Error("TASK_FINGERPRINT_SECRET_INVALID");
  }
  const fingerprint = inputFingerprint({
    input,
    modelId: model.providerId,
    saveResult,
    secret: dependencies.fingerprintSecret,
    taskType,
  });

  async function terminalizeSharedExecution(
    execution: TaskExecutionResult,
    input: Omit<
      Parameters<
        NonNullable<
          TaskWorkflowRepository["terminalizeTaskExecution"]
        >
      >[0],
      "executionId" | "ownerToken"
    >,
  ) {
    if (
      !dependencies.repository.terminalizeTaskExecution ||
      !execution.executionId ||
      !execution.ownerToken
    ) {
      throw new Error("TASK_UNAVAILABLE");
    }
    const terminal =
      await dependencies.repository.terminalizeTaskExecution({
        ...input,
        executionId: execution.executionId,
        ownerToken: execution.ownerToken,
      });
    if (
      terminal.state !== input.state ||
      !validResultIdentity(terminal.sessionId) ||
      typeof terminal.remainingCredits !== "number" ||
      !Number.isSafeInteger(terminal.remainingCredits) ||
      terminal.remainingCredits < 0 ||
      terminal.remainingCredits > MAX_WALLET_CREDITS
    ) {
      throw new Error("TASK_UNAVAILABLE");
    }
    return {
      remainingCredits: terminal.remainingCredits,
      sessionId: terminal.sessionId,
    };
  }

  async function execute(
    execution?: TaskExecutionResult,
  ): Promise<RunTaskResult> {
    if (
      (execution && !dependencies.repository.reserveTaskSpend) ||
      (!execution && !dependencies.repository.settleFailedSpend)
    ) {
      throw new Error("TASK_UNAVAILABLE");
    }
    const reserved = compactSpendResult(
      execution
        ? await dependencies.repository.reserveTaskSpend!({
            executionId: execution.executionId!,
            ownerToken: execution.ownerToken!,
          })
        : await dependencies.repository.reserveSpend({
            idempotencyKey: untrusted.idempotencyKey,
            providerCostMicroUsd: model.maxCostMicroUsd,
            userId: untrusted.userId,
          }),
    );

    if (execution) {
      const existingSession = (
        await dependencies.repository.listHistory({
          userId: untrusted.userId,
        })
      ).find(
        (session) =>
          session.reservationId === reserved.reservationId,
      );
      if (existingSession) {
        if (existingSession.status === "failed") {
          const terminal = await terminalizeSharedExecution(
            execution,
            {
              errorCode: "PROVIDER_UNAVAILABLE",
              inputUnits: 0,
              outputUnits: 0,
              providerCostMicroUsd:
                existingSession.providerCostMicroUsd,
              reservationId: reserved.reservationId,
              resultPayload: { error: "PROVIDER_UNAVAILABLE" },
              state: "failed",
              taskTitle: existingSession.title,
            },
          );
          const result: TaskFailedResult = {
            error: "PROVIDER_UNAVAILABLE",
            remainingCredits: terminal.remainingCredits,
            sessionId: terminal.sessionId,
            status: "failed",
          };
          return result;
        }
        if (!existingSession.savedOutput) {
          throw new Error("RESULT_REPLAY_EXPIRED");
        }
        const output = parseTaskOutput(
          JSON.parse(existingSession.savedOutput),
        );
        const terminal = await terminalizeSharedExecution(
          execution,
          {
            inputUnits: existingSession.inputUnits,
            outputUnits: existingSession.outputUnits,
            providerCostMicroUsd:
              existingSession.providerCostMicroUsd,
            reservationId: reserved.reservationId,
            resultPayload: { output },
            savedOutput: existingSession.savedOutput,
            state: "completed",
            taskTitle: existingSession.title,
          },
        );
        const result: TaskCompletedResult = {
          friendlyModel: friendlyModelName(existingSession.model),
          output,
          remainingCredits: terminal.remainingCredits,
          sessionId: terminal.sessionId,
          status: "completed",
        };
        return result;
      }
    }

    const startedAt = Date.now();
    await safeRecordEvent(dependencies.repository, {
      metadata: {
        isReturning: false,
        taskType,
      },
      name: "task_started",
      source: "task",
      userId: untrusted.userId,
    });

    let providerResult: TaskProviderResult;
    let providerCostMicroUsd: number;
    try {
      providerResult = await dependencies.provider.run({
        input,
        model,
        ...(execution?.executionId
          ? { requestTraceId: execution.executionId }
          : {}),
        safetyIdentifier: deriveSafetyIdentifier(
          dependencies.fingerprintSecret,
          untrusted.userId,
        ),
        task,
      });
      providerCostMicroUsd = safeProviderResult(
        providerResult,
        model.providerId,
        model.maxCostMicroUsd,
      );
    } catch {
      const terminal = execution
        ? await terminalizeSharedExecution(execution, {
            errorCode: "PROVIDER_UNAVAILABLE",
            inputUnits: 0,
            outputUnits: 0,
            providerCostMicroUsd: model.maxCostMicroUsd,
            reservationId: reserved.reservationId,
            resultPayload: { error: "PROVIDER_UNAVAILABLE" },
            state: "failed",
            taskTitle: `${task.title} attempt`,
          })
        : await (async () => {
            const settled = compactSpendResult(
              await dependencies.repository.settleFailedSpend!({
                idempotencyKey: `${untrusted.idempotencyKey}:refund`,
                providerCostMicroUsd: model.maxCostMicroUsd,
                reservationId: reserved.reservationId,
                userId: untrusted.userId,
              }),
            );
            const session =
              await dependencies.repository.recordSession({
                inputUnits: 0,
                model: model.providerId,
                outputUnits: 0,
              providerCostMicroUsd: model.maxCostMicroUsd,
                reservationId: reserved.reservationId,
                status: "failed",
                taskType,
                title: `${task.title} attempt`,
                userId: untrusted.userId,
              });
            return {
              remainingCredits: settled.remainingCredits,
              sessionId: session.id,
            };
          })();
      await safeRecordEvent(dependencies.repository, {
        metadata: {
          latencyBucket: latencyBucket(Date.now() - startedAt),
          outcome: "failure",
          taskType,
        },
        name: "task_failed",
        source: "task",
        userId: untrusted.userId,
      });
      const result: TaskFailedResult = {
        error: "PROVIDER_UNAVAILABLE",
        remainingCredits: terminal.remainingCredits,
        sessionId: terminal.sessionId,
        status: "failed",
      };
      return result;
    }

    const savedOutput = saveResult
      ? JSON.stringify(providerResult.output)
      : undefined;
    const terminal = execution
      ? await terminalizeSharedExecution(execution, {
          inputUnits: providerResult.inputUnits,
          outputUnits: providerResult.outputUnits,
          providerCostMicroUsd,
          reservationId: reserved.reservationId,
          resultPayload: { output: providerResult.output },
          ...(savedOutput ? { savedOutput } : {}),
          state: "completed",
          taskTitle: providerResult.output.title,
        })
      : await (async () => {
          const committed = compactSpendResult(
            await dependencies.repository.commitSpend({
              idempotencyKey: `${untrusted.idempotencyKey}:commit`,
              providerCostMicroUsd,
              reservationId: reserved.reservationId,
              userId: untrusted.userId,
            }),
          );
          const session =
            await dependencies.repository.recordSession({
              inputUnits: providerResult.inputUnits,
              model: providerResult.model,
              outputUnits: providerResult.outputUnits,
              providerCostMicroUsd,
              reservationId: reserved.reservationId,
              ...(savedOutput ? { savedOutput } : {}),
              status: "completed",
              taskType,
              title: providerResult.output.title,
              userId: untrusted.userId,
            });
          return {
            remainingCredits: committed.remainingCredits,
            sessionId: session.id,
          };
        })();
    await safeRecordEvent(dependencies.repository, {
      metadata: {
        credits: 120,
        isReturning: false,
        latencyBucket: latencyBucket(Date.now() - startedAt),
        outcome: "success",
        taskType,
      },
      name: "task_completed",
      source: "task",
      userId: untrusted.userId,
    });

    const result: TaskCompletedResult = {
      friendlyModel: friendlyModelName(providerResult.model),
      output: providerResult.output,
      providerCostMicroUsd,
      providerRequestId: providerResult.requestId,
      remainingCredits: terminal.remainingCredits,
      sessionId: terminal.sessionId,
      status: "completed",
    };
    return result;
  }

  if (dependencies.repository.beginTaskExecution) {
    const ownerToken = randomUUID();
    const execution =
      await dependencies.repository.beginTaskExecution({
        idempotencyKey: untrusted.idempotencyKey,
        modelId: model.providerId,
        ownerToken,
        providerCostCeilingMicroUsd: model.maxCostMicroUsd,
        requestFingerprint: fingerprint,
        taskType,
        userId: untrusted.userId,
      });
    if (
      execution.state === "completed" ||
      execution.state === "failed"
    ) {
      return replayResult(execution, model.providerId);
    }
    if (execution.state === "throttled") {
      throw new Error("TASK_THROTTLED");
    }
    if (execution.state === "running") {
      throw new Error("TASK_IN_PROGRESS");
    }
    if (
      execution.state !== "owner" ||
      execution.ownerToken !== ownerToken ||
      !validResultIdentity(execution.executionId) ||
      !dependencies.repository.terminalizeTaskExecution
    ) {
      throw new Error("TASK_UNAVAILABLE");
    }
    return execute(execution);
  }

  return dependencies.resultStore.run(
    untrusted.userId,
    untrusted.idempotencyKey,
    fingerprint,
    async () => {
      if (!dependencies.rateLimiter.admit(untrusted.userId)) {
        throw new Error("TASK_THROTTLED");
      }
      return execute();
    },
  );
}

export async function saveTaskResult({
  repository,
  resultStore,
  sessionId,
  userId,
}: {
  repository: TaskWorkflowRepository;
  resultStore: MemoryTaskResultStore;
  sessionId: string;
  userId: string;
}) {
  validateIdentifier(userId, "USER_INVALID");
  validateIdentifier(sessionId, "SESSION_INVALID");
  let output = resultStore.getOutput(userId, sessionId);
  if (!output && repository.getTaskExecutionOutput) {
    const storedOutput = await repository.getTaskExecutionOutput(
      userId,
      sessionId,
    );
    if (storedOutput) {
      output = parseTaskOutput(storedOutput);
    }
  }
  if (!output || !repository.saveSessionOutput) {
    throw new Error("RESULT_NO_LONGER_AVAILABLE");
  }
  await repository.saveSessionOutput({
    output: JSON.stringify(output),
    sessionId,
    userId,
  });
}

const globalTaskRuntime = globalThis as typeof globalThis & {
  ygfTaskRateLimiter?: TaskRateLimiter;
  ygfTaskResultStore?: MemoryTaskResultStore;
};

export function getTaskRateLimiter() {
  globalTaskRuntime.ygfTaskRateLimiter ??= createTaskRateLimiter();
  return globalTaskRuntime.ygfTaskRateLimiter;
}

export function getTaskResultStore() {
  globalTaskRuntime.ygfTaskResultStore ??= new MemoryTaskResultStore();
  return globalTaskRuntime.ygfTaskResultStore;
}
