import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";
import {
  MemoryTaskResultStore,
  createTaskRateLimiter,
  runTask,
  type RunTaskDependencies,
} from "@/lib/campaign/run-task";
import type {
  BeginTaskExecutionInput,
  TaskExecutionResult,
  TaskWorkflowRepository,
  TerminalizeTaskExecutionInput,
} from "@/lib/repositories/task-workflow-repository";
import type {
  TaskProvider,
  TaskProviderResult,
} from "@/lib/providers/provider";

const validInputs = {
  career: "Rewrite this resume bullet for a software internship.",
  coding: "Explain why this TypeScript value may be undefined.",
  "pick-my-bowl":
    "Suggest a filling vegetarian bowl with mild spice.",
  study:
    "Explain active recall and create five flashcards.",
} as const;

class SharedExecutionRepository
  implements TaskWorkflowRepository
{
  readonly base: MemoryCampaignRepository;
  legacyCommitCalls = 0;
  legacyRefundCalls = 0;
  legacySessionCalls = 0;
  taskReserveCalls = 0;
  terminalizeCalls = 0;
  #execution:
    | {
        fingerprint: string;
        id: string;
        idempotencyKey: string;
        modelId: string;
        ownerToken: string;
        result?: TaskExecutionResult;
        state: "running" | "completed" | "failed";
        taskType: BeginTaskExecutionInput["taskType"];
        userId: string;
      }
    | undefined;
  #reclaim = false;

  constructor(base: MemoryCampaignRepository) {
    this.base = base;
  }

  get requestFingerprint() {
    return this.#execution?.fingerprint;
  }

  reclaimLeaseWithoutTerminalResult() {
    if (!this.#execution) {
      throw new Error("execution missing");
    }
    this.#execution.state = "running";
    this.#execution.result = undefined;
    this.#reclaim = true;
  }

  expireReplayPayload() {
    if (!this.#execution?.result) {
      throw new Error("execution result missing");
    }
    this.#execution.result = {
      ...this.#execution.result,
      resultPayload: undefined,
    };
  }

  async beginTaskExecution(
    input: BeginTaskExecutionInput,
  ): Promise<TaskExecutionResult> {
    if (!this.#execution) {
      this.#execution = {
        fingerprint: input.requestFingerprint,
        id: "execution-1",
        idempotencyKey: input.idempotencyKey,
        modelId: input.modelId,
        ownerToken: input.ownerToken,
        state: "running",
        taskType: input.taskType,
        userId: input.userId,
      };
      return {
        executionId: this.#execution.id,
        ownerToken: input.ownerToken,
        state: "owner",
      };
    }
    if (
      this.#execution.fingerprint !== input.requestFingerprint ||
      this.#execution.modelId !== input.modelId
    ) {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    if (this.#execution.result) {
      return this.#execution.result;
    }
    if (this.#reclaim) {
      this.#reclaim = false;
      this.#execution.ownerToken = input.ownerToken;
      return {
        executionId: this.#execution.id,
        ownerToken: input.ownerToken,
        state: "owner",
      };
    }
    return {
      executionId: this.#execution.id,
      state: "running",
    };
  }

  async terminalizeTaskExecution(
    input: TerminalizeTaskExecutionInput,
  ): Promise<TaskExecutionResult> {
    if (
      !this.#execution ||
      this.#execution.id !== input.executionId ||
      this.#execution.ownerToken !== input.ownerToken
    ) {
      throw new Error("OWNER_MISMATCH");
    }
    this.terminalizeCalls += 1;
    const spend =
      input.state === "completed"
        ? await this.base.commitSpend({
            idempotencyKey: `${input.executionId}:commit`,
            providerCostMicroUsd: input.providerCostMicroUsd,
            reservationId: input.reservationId,
            userId: this.#execution.userId,
          })
        : await this.base.settleFailedSpend({
            idempotencyKey: `${input.executionId}:refund`,
            providerCostMicroUsd: input.providerCostMicroUsd,
            reservationId: input.reservationId,
            userId: this.#execution.userId,
          });
    const session = await this.base.recordSession({
      inputUnits: input.inputUnits,
      model: this.#execution.modelId,
      outputUnits: input.outputUnits,
      providerCostMicroUsd: input.providerCostMicroUsd,
      reservationId: input.reservationId,
      ...(input.savedOutput
        ? { savedOutput: input.savedOutput }
        : {}),
      status: input.state,
      taskType: this.#execution.taskType,
      title: input.taskTitle,
      userId: this.#execution.userId,
    });
    this.#execution.state = input.state;
    this.#execution.result = {
      errorCode: input.errorCode,
      executionId: input.executionId,
      remainingCredits: spend.wallet.remainingBalance,
      resultPayload: input.resultPayload,
      sessionId: session.id,
      state: input.state,
    };
    return this.#execution.result;
  }

  async getRemainingCredits(userId: string) {
    return (await this.base.getWallet({ userId })).remainingBalance;
  }

  reserveSpend(
    input: Parameters<MemoryCampaignRepository["reserveSpend"]>[0],
  ) {
    return this.base.reserveSpend(input);
  }

  reserveTaskSpend({
    executionId,
    ownerToken,
  }: {
    executionId: string;
    ownerToken: string;
  }) {
    if (
      !this.#execution ||
      this.#execution.id !== executionId ||
      this.#execution.ownerToken !== ownerToken
    ) {
      throw new Error("OWNER_MISMATCH");
    }
    this.taskReserveCalls += 1;
    return this.base.reserveSpend({
      idempotencyKey: this.#execution.idempotencyKey,
      providerCostMicroUsd: 12_000,
      userId: this.#execution.userId,
    });
  }

  commitSpend(
    input: Parameters<MemoryCampaignRepository["commitSpend"]>[0],
  ) {
    this.legacyCommitCalls += 1;
    return this.base.commitSpend(input);
  }

  refundSpend(
    input: Parameters<MemoryCampaignRepository["refundSpend"]>[0],
  ) {
    this.legacyRefundCalls += 1;
    return this.base.refundSpend(input);
  }

  recordSession(
    input: Parameters<MemoryCampaignRepository["recordSession"]>[0],
  ) {
    this.legacySessionCalls += 1;
    return this.base.recordSession(input);
  }

  listHistory(
    input: Parameters<MemoryCampaignRepository["listHistory"]>[0],
  ) {
    return this.base.listHistory(input);
  }

  recordEvent(
    input: Parameters<MemoryCampaignRepository["recordEvent"]>[0],
  ) {
    return this.base.recordEvent(input);
  }
}

function providerResult(
  model: string,
  title = "A useful result",
): TaskProviderResult {
  return {
    inputUnits: 80,
    model,
    output: {
      sections: [
        {
          heading: "Key ideas",
          items: ["First useful point", "Second useful point"],
        },
      ],
      title,
    },
    outputUnits: 140,
    providerCostMicroUsd: 2_400,
    requestId: "request-safe-id",
  };
}

async function setup(
  providerOverrides: Partial<TaskProvider> = {},
  now = new Date("2026-09-01T12:00:00.000Z"),
) {
  const repository = new MemoryCampaignRepository({
    demoMode: true,
    now: () => now,
  });
  await repository.redeemCode({
    code: "BOWL7K2A",
    idempotencyKey: "redeem-task-tests",
    userId: "demo-user",
  });

  const overrideRun = providerOverrides.run;
  const run = vi.fn<TaskProvider["run"]>(async (input) =>
    overrideRun
      ? overrideRun(input)
      : providerResult(input.model.providerId),
  );
  const provider: TaskProvider = {
    name: "test",
    ...providerOverrides,
    run,
  };
  const dependencies: RunTaskDependencies = {
    fingerprintSecret:
      "task-test-fingerprint-secret-at-least-32-bytes",
    provider,
    rateLimiter: createTaskRateLimiter({
      limit: 20,
      windowMs: 60_000,
    }),
    repository,
    resultStore: new MemoryTaskResultStore(),
  };

  return { dependencies, provider, repository, run };
}

describe("runTask", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "study",
    "coding",
    "career",
    "pick-my-bowl",
  ] as const)(
    "runs %s with one reservation and a completed metadata-only session",
    async (taskType) => {
      const { dependencies, repository, run } = await setup();

      const result = await runTask(
        {
          idempotencyKey: `key-${taskType}`,
          input: validInputs[taskType],
          taskType,
          userId: "demo-user",
        },
        dependencies,
      );

      expect(result.status).toBe("completed");
      expect(result.remainingCredits).toBe(2_880);
      if (result.status !== "completed") {
        throw new Error("expected completed result");
      }
      expect(result.output.title.length).toBeGreaterThan(0);
      expect(run).toHaveBeenCalledTimes(1);
      const history = await repository.listHistory({
        userId: "demo-user",
      });
      expect(history).toHaveLength(1);
      expect(history[0]).not.toHaveProperty("savedOutput");
      expect(JSON.stringify(history)).not.toContain(validInputs[taskType]);
    },
  );

  it("refunds all credits and records a safe failed session when the provider fails", async () => {
    const { dependencies, repository } = await setup({
      async run() {
        throw new Error("upstream payload and secret detail");
      },
    });

    const result = await runTask(
      {
        idempotencyKey: "provider-failure",
        input: validInputs.study,
        taskType: "study",
        userId: "demo-user",
      },
      dependencies,
    );

    expect(result).toMatchObject({
      error: "PROVIDER_UNAVAILABLE",
      remainingCredits: 3_000,
      status: "failed",
    });
    expect(result).not.toHaveProperty("output");
    expect(await repository.getWallet({ userId: "demo-user" })).toMatchObject(
      {
        remainingBalance: 3_000,
        reservedBalance: 0,
        providerCommittedMicroUsd: 12_000,
      },
    );
    const history = await repository.listHistory({
      userId: "demo-user",
    });
    expect(history[0]).toMatchObject({
      inputUnits: 0,
      outputUnits: 0,
      providerCostMicroUsd: 12_000,
      status: "failed",
    });
    expect(JSON.stringify(history)).not.toContain("upstream payload");
  });

  it("settles a failed spend once with refunded Credits and committed provider cost", async () => {
    const { repository } = await setup();
    const reserved = await repository.reserveSpend({
      idempotencyKey: "failed-spend-reserve",
      providerCostMicroUsd: 12_000,
      userId: "demo-user",
    });
    const input = {
      idempotencyKey: "failed-spend-terminal",
      providerCostMicroUsd: 12_000,
      reservationId: reserved.reservation.id,
      userId: "demo-user",
    };
    await expect(
      repository.settleFailedSpend({
        ...input,
        providerCostMicroUsd: 0,
      }),
    ).rejects.toMatchObject({ code: "SPEND_STATE_INVALID" });
    await expect(
      repository.settleFailedSpend({
        ...input,
        providerCostMicroUsd: 11_999,
      }),
    ).rejects.toMatchObject({ code: "SPEND_STATE_INVALID" });
    const first = await repository.settleFailedSpend(input);
    const replay = await repository.settleFailedSpend(input);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      reservation: {
        providerCommittedMicroUsd: 12_000,
        state: "refunded",
      },
      wallet: {
        providerCommittedMicroUsd: 12_000,
        providerReservedMicroUsd: 0,
        remainingBalance: 3_000,
        reservedBalance: 0,
      },
    });
  });

  it("eventually reaches the shared provider hard cap after failed attempts", async () => {
    const { dependencies, repository, run } = await setup({
      async run() {
        throw new Error("provider failed after admission");
      },
    });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await expect(
        runTask(
          {
            idempotencyKey: `failed-cap-${attempt}`,
            input: validInputs.study,
            model: "reasoning",
            taskType: "study",
            userId: "demo-user",
          },
          dependencies,
        ),
      ).resolves.toMatchObject({ status: "failed" });
    }
    await expect(
      runTask(
        {
          idempotencyKey: "failed-cap-blocked",
          input: validInputs.study,
          model: "reasoning",
          taskType: "study",
          userId: "demo-user",
        },
        dependencies,
      ),
    ).rejects.toThrow("PROVIDER_COST_LIMIT_EXCEEDED");
    expect(run).toHaveBeenCalledTimes(12);
    await expect(repository.getWallet({ userId: "demo-user" })).resolves.toMatchObject({
      providerCommittedMicroUsd: 240_000,
      providerReservedMicroUsd: 0,
      remainingBalance: 3_000,
      reservedBalance: 0,
    });
  });

  it("returns the first result for an exact duplicate without calling the provider twice", async () => {
    const { dependencies, run } = await setup();
    const input = {
      idempotencyKey: "same-request",
      input: validInputs.study,
      taskType: "study" as const,
      userId: "demo-user",
    };

    const first = await runTask(input, dependencies);
    const duplicate = await runTask(input, dependencies);

    expect(duplicate).toEqual(first);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent duplicates and rejects key reuse with changed input", async () => {
    let releaseProvider: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const { dependencies, run } = await setup({
      async run({ model }) {
        await gate;
        return providerResult(model.providerId);
      },
    });
    const original = {
      idempotencyKey: "concurrent-request",
      input: validInputs.coding,
      taskType: "coding" as const,
      userId: "demo-user",
    };

    const first = runTask(original, dependencies);
    const second = runTask(original, dependencies);
    releaseProvider?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      await first,
      await first,
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    await expect(
      runTask(
        { ...original, input: "A different prompt" },
        dependencies,
      ),
    ).rejects.toThrow("TASK_IDEMPOTENCY_CONFLICT");
  });

  it("rejects models outside the allowlist before reserving or calling the provider", async () => {
    const { dependencies, repository, run } = await setup();

    await expect(
      runTask(
        {
          idempotencyKey: "bad-model",
          input: validInputs.study,
          model: "unlisted/provider-model",
          taskType: "study",
          userId: "demo-user",
        },
        dependencies,
      ),
    ).rejects.toThrow("MODEL_NOT_ALLOWED");
    expect(run).not.toHaveBeenCalled();
    expect(
      (await repository.getWallet({ userId: "demo-user" }))
        .remainingBalance,
    ).toBe(3_000);
  });

  it("enforces the provider-cost cap before the external call", async () => {
    const { dependencies, repository, run } = await setup();
    const expensive = await repository.reserveSpend({
      idempotencyKey: "existing-expense",
      providerCostMicroUsd: 240_000,
      userId: "demo-user",
    });
    await repository.commitSpend({
      idempotencyKey: "existing-expense:commit",
      providerCostMicroUsd: 240_000,
      reservationId: expensive.reservation.id,
      userId: "demo-user",
    });

    await expect(
      runTask(
        {
          idempotencyKey: "over-provider-cap",
          input: validInputs.study,
          model: "reasoning",
          taskType: "study",
          userId: "demo-user",
        },
        dependencies,
      ),
    ).rejects.toThrow("PROVIDER_COST_LIMIT_EXCEEDED");
    expect(run).not.toHaveBeenCalled();
  });

  it("refunds when reported provider cost exceeds the reserved model ceiling", async () => {
    const { dependencies, repository } = await setup({
      async run({ model }) {
        return {
          ...providerResult(model.providerId),
          providerCostMicroUsd: model.maxCostMicroUsd + 1,
        };
      },
    });

    const result = await runTask(
      {
        idempotencyKey: "provider-overage",
        input: validInputs.study,
        taskType: "study",
        userId: "demo-user",
      },
      dependencies,
    );

    expect(result).toMatchObject({
      error: "PROVIDER_UNAVAILABLE",
      remainingCredits: 3_000,
      status: "failed",
    });
    expect(
      (await repository.getWallet({ userId: "demo-user" }))
        .remainingBalance,
    ).toBe(3_000);
  });

  it("rate-limits by server-derived user before spend or provider work", async () => {
    const { dependencies, repository, run } = await setup();
    dependencies.rateLimiter = createTaskRateLimiter({
      limit: 1,
      windowMs: 60_000,
    });
    await runTask(
      {
        idempotencyKey: "first-admitted",
        input: validInputs.career,
        taskType: "career",
        userId: "demo-user",
      },
      dependencies,
    );

    await expect(
      runTask(
        {
          idempotencyKey: "second-throttled",
          input: validInputs.career,
          taskType: "career",
          userId: "demo-user",
        },
        dependencies,
      ),
    ).rejects.toThrow("TASK_THROTTLED");
    expect(run).toHaveBeenCalledTimes(1);
    expect(
      (await repository.getWallet({ userId: "demo-user" }))
        .remainingBalance,
    ).toBe(2_880);
  });

  it("persists generated output only with explicit save consent", async () => {
    const { dependencies, repository } = await setup();
    await runTask(
      {
        idempotencyKey: "save-consented",
        input: validInputs.study,
        saveResult: true,
        taskType: "study",
        userId: "demo-user",
      },
      dependencies,
    );

    const history = await repository.listHistory({
      userId: "demo-user",
    });
    expect(history[0]?.savedOutput).toContain("First useful point");
    expect(history[0]?.savedOutput).not.toContain(validInputs.study);
  });

  it("replays a completed result across process-local stores without a second provider call", async () => {
    const first = await setup();
    const shared = new SharedExecutionRepository(first.repository);
    first.dependencies.repository = shared;
    const request = {
      idempotencyKey: "cross-instance-replay",
      input: validInputs.study,
      taskType: "study" as const,
      userId: "demo-user",
    };
    const original = await runTask(request, first.dependencies);
    expect(shared.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(shared.requestFingerprint).not.toBe(
      createHash("sha256").update(request.input).digest("hex"),
    );
    expect(shared.terminalizeCalls).toBe(1);
    expect(shared.taskReserveCalls).toBe(1);
    expect(shared.legacyCommitCalls).toBe(0);
    expect(shared.legacyRefundCalls).toBe(0);
    expect(shared.legacySessionCalls).toBe(0);
    expect(
      await first.repository.getWallet({ userId: "demo-user" }),
    ).toMatchObject({
      providerCommittedMicroUsd: 2_400,
      providerReservedMicroUsd: 0,
      remainingBalance: 2_880,
      reservedBalance: 0,
    });

    const secondProvider = vi.fn<TaskProvider["run"]>();
    const secondDependencies: RunTaskDependencies = {
      fingerprintSecret:
        "task-test-fingerprint-secret-at-least-32-bytes",
      provider: { name: "second-process", run: secondProvider },
      rateLimiter: createTaskRateLimiter(),
      repository: shared,
      resultStore: new MemoryTaskResultStore(),
    };
    const replayed = await runTask(request, secondDependencies);

    expect(replayed).toMatchObject({
      output: original.status === "completed" ? original.output : {},
      remainingCredits: 2_880,
      status: "completed",
    });
    expect(first.run).toHaveBeenCalledTimes(1);
    expect(secondProvider).not.toHaveBeenCalled();
  });

  it("atomically refunds and records a production failure without legacy terminal writes", async () => {
    const first = await setup({
      async run() {
        throw new Error("provider secret must not escape");
      },
    });
    const shared = new SharedExecutionRepository(first.repository);
    first.dependencies.repository = shared;

    const result = await runTask(
      {
        idempotencyKey: "atomic-production-failure",
        input: validInputs.study,
        taskType: "study",
        userId: "demo-user",
      },
      first.dependencies,
    );

    expect(result).toMatchObject({
      error: "PROVIDER_UNAVAILABLE",
      remainingCredits: 3_000,
      status: "failed",
    });
    expect(shared.terminalizeCalls).toBe(1);
    expect(shared.legacyCommitCalls).toBe(0);
    expect(shared.legacyRefundCalls).toBe(0);
    expect(shared.legacySessionCalls).toBe(0);
    expect(
      await first.repository.getWallet({ userId: "demo-user" }),
    ).toMatchObject({
      remainingBalance: 3_000,
      reservedBalance: 0,
    });
  });

  it("does not separately charge or record a session when atomic terminalization rejects", async () => {
    const first = await setup();
    const shared = new SharedExecutionRepository(first.repository);
    first.dependencies.repository = shared;
    vi.spyOn(shared, "terminalizeTaskExecution").mockRejectedValueOnce(
      new Error("atomic transaction rolled back"),
    );

    await expect(
      runTask(
        {
          idempotencyKey: "atomic-terminal-reject",
          input: validInputs.coding,
          taskType: "coding",
          userId: "demo-user",
        },
        first.dependencies,
      ),
    ).rejects.toThrow("atomic transaction rolled back");

    expect(shared.legacyCommitCalls).toBe(0);
    expect(shared.legacyRefundCalls).toBe(0);
    expect(shared.legacySessionCalls).toBe(0);
    expect(
      await first.repository.getWallet({ userId: "demo-user" }),
    ).toMatchObject({
      remainingBalance: 2_880,
      reservedBalance: 120,
    });
    expect(
      await first.repository.listHistory({ userId: "demo-user" }),
    ).toHaveLength(0);
  });

  it("returns running or replay-expired without calling a provider on another instance", async () => {
    const first = await setup({
      async run({ model }) {
        return providerResult(model.providerId);
      },
    });
    const shared = new SharedExecutionRepository(first.repository);
    first.dependencies.repository = shared;
    const request = {
      idempotencyKey: "cross-instance-terminal",
      input: validInputs.coding,
      taskType: "coding" as const,
      userId: "demo-user",
    };
    await runTask(request, first.dependencies);

    shared.expireReplayPayload();
    const neverCall = vi.fn<TaskProvider["run"]>();
    const fresh: RunTaskDependencies = {
      fingerprintSecret:
        "task-test-fingerprint-secret-at-least-32-bytes",
      provider: { name: "fresh", run: neverCall },
      rateLimiter: createTaskRateLimiter(),
      repository: shared,
      resultStore: new MemoryTaskResultStore(),
    };
    await expect(runTask(request, fresh)).rejects.toThrow(
      "RESULT_REPLAY_EXPIRED",
    );
    expect(neverCall).not.toHaveBeenCalled();

    shared.reclaimLeaseWithoutTerminalResult();
    await expect(runTask(request, fresh)).rejects.toThrow(
      "RESULT_REPLAY_EXPIRED",
    );
    expect(neverCall).not.toHaveBeenCalled();
  });
});
