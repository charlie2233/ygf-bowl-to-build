import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAuthServerClient,
  createServiceRoleClient,
} from "@/lib/auth/server";
import {
  SupabaseTaskWorkflowRepository,
  TaskWorkflowRepositoryUnavailableError,
} from "@/lib/repositories/task-workflow-repository";

vi.mock("@/lib/auth/server", () => ({
  createAuthServerClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

const createAuthClientMock = vi.mocked(createAuthServerClient);
const createServiceClientMock = vi.mocked(createServiceRoleClient);

const ownerExecution = {
  error_code: null,
  execution_id: "execution-1",
  execution_state: "owner",
  lease_expires_at: "2026-09-01T12:01:30.000Z",
  owner_token: "owner-token-1",
  remaining_credits: null,
  result_expires_at: null,
  result_payload: null,
  session_id: null,
};

const spendRow = {
  expires_at: "2026-09-15T12:00:00.000Z",
  ledger_entry_id: "reservation-1",
  ledger_state: "reserved",
  provider_committed_micro_usd: 0,
  provider_reserved_micro_usd: 12_000,
  remaining_balance: 2_880,
  reserved_balance: 120,
  wallet_id: "wallet-1",
};

describe("SupabaseTaskWorkflowRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("begins and atomically terminalizes through server-only RPCs without prompt text", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [ownerExecution],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            ...ownerExecution,
            execution_state: "completed",
            lease_expires_at: null,
            owner_token: null,
            remaining_credits: 2_880,
            result_expires_at: "2026-09-01T12:15:00.000Z",
            result_payload: {
              output: {
                sections: [
                  { heading: "Ideas", items: ["Useful"] },
                ],
                title: "Saved result",
              },
            },
            session_id: "session-1",
          },
        ],
        error: null,
      });
    createServiceClientMock.mockReturnValue({ rpc } as never);
    const repository = new SupabaseTaskWorkflowRepository();

    await expect(
      repository.beginTaskExecution({
        idempotencyKey: "task-request-1",
        modelId: "openai/gpt-4.1-mini",
        ownerToken: "owner-token-1",
        providerCostCeilingMicroUsd: 12_000,
        requestFingerprint: "a".repeat(64),
        taskType: "study",
        userId: "00000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toMatchObject({
      executionId: "execution-1",
      ownerToken: "owner-token-1",
      state: "owner",
    });
    expect(rpc.mock.calls[0]).toEqual([
      "begin_campaign_task_execution",
      {
        p_idempotency_key: "task-request-1",
        p_model_id: "openai/gpt-4.1-mini",
        p_owner_token: "owner-token-1",
        p_provider_cost_ceiling_micro_usd: 12_000,
        p_request_fingerprint: "a".repeat(64),
        p_task_type: "study",
        p_user_id: "00000000-0000-4000-8000-000000000001",
      },
    ]);
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain(
      "Explain active recall",
    );

    await expect(
      repository.terminalizeTaskExecution({
        executionId: "execution-1",
        inputUnits: 80,
        ownerToken: "owner-token-1",
        outputUnits: 140,
        providerCostMicroUsd: 2_400,
        reservationId: "reservation-1",
        resultPayload: {
          output: {
            sections: [{ heading: "Ideas", items: ["Useful"] }],
            title: "Saved result",
          },
        },
        savedOutput:
          '{"title":"Saved result","sections":[{"heading":"Ideas","items":["Useful"]}]}',
        state: "completed",
        taskTitle: "Saved result",
      }),
    ).resolves.toMatchObject({
      remainingCredits: 2_880,
      sessionId: "session-1",
      state: "completed",
    });
    expect(rpc.mock.calls[1]).toEqual([
      "terminalize_campaign_task_execution",
      {
        p_error_code: null,
        p_execution_id: "execution-1",
        p_input_units: 80,
        p_output_units: 140,
        p_owner_token: "owner-token-1",
        p_provider_cost_micro_usd: 2_400,
        p_reservation_id: "reservation-1",
        p_result_payload: {
          output: {
            sections: [{ heading: "Ideas", items: ["Useful"] }],
            title: "Saved result",
          },
        },
        p_saved_output:
          '{"title":"Saved result","sections":[{"heading":"Ideas","items":["Useful"]}]}',
        p_state: "completed",
        p_task_title: "Saved result",
      },
    ]);
    expect(JSON.stringify(rpc.mock.calls[1])).not.toContain(
      "Explain active recall",
    );
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty("p_user_id");
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty("p_model_id");
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty("p_task_type");
  });

  it("uses the authenticated session for spend RPCs and rejects an identity mismatch", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [spendRow],
      error: null,
    });
    createAuthClientMock.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "server-user" } },
          error: null,
        }),
      },
      rpc,
    } as never);
    const repository = new SupabaseTaskWorkflowRepository();

    await expect(
      repository.reserveSpend({
        idempotencyKey: "task-request-1",
        providerCostMicroUsd: 12_000,
        userId: "server-user",
      }),
    ).resolves.toEqual({
      remainingCredits: 2_880,
      reservationId: "reservation-1",
    });
    expect(rpc).toHaveBeenCalledWith("reserve_campaign_spend", {
      p_idempotency_key: "task-request-1",
      p_provider_cost_micro_usd: 12_000,
    });

    await expect(
      repository.reserveSpend({
        idempotencyKey: "task-request-2",
        providerCostMicroUsd: 12_000,
        userId: "caller-selected-user",
      }),
    ).rejects.toEqual(
      new TaskWorkflowRepositoryUnavailableError(),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reserves execution-owned spend through the service RPC without caller-selected user or cost", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [spendRow],
      error: null,
    });
    createServiceClientMock.mockReturnValue({ rpc } as never);
    const repository = new SupabaseTaskWorkflowRepository();

    await expect(
      repository.reserveTaskSpend({
        executionId: "execution-1",
        ownerToken: "owner-token-1",
      }),
    ).resolves.toEqual({
      remainingCredits: 2_880,
      reservationId: "reservation-1",
    });
    expect(rpc).toHaveBeenCalledWith("reserve_campaign_task_spend", {
      p_execution_id: "execution-1",
      p_owner_token: "owner-token-1",
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_user_id");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty(
      "p_provider_cost_micro_usd",
    );
    expect(createAuthClientMock).not.toHaveBeenCalled();
  });

  it("maps terminal rows with expired payloads without treating them as owners", async () => {
    createServiceClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            ...ownerExecution,
            error_code: null,
            execution_state: "completed",
            lease_expires_at: null,
            owner_token: null,
            remaining_credits: 2_880,
            result_expires_at: "2026-09-01T12:15:00.000Z",
            result_payload: null,
            session_id: "session-1",
          },
        ],
        error: null,
      }),
    } as never);
    const repository = new SupabaseTaskWorkflowRepository();

    await expect(
      repository.beginTaskExecution({
        idempotencyKey: "task-request-1",
        modelId: "openai/gpt-4.1-mini",
        ownerToken: "new-owner-token",
        providerCostCeilingMicroUsd: 12_000,
        requestFingerprint: "a".repeat(64),
        taskType: "study",
        userId: "00000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toEqual({
      executionId: "execution-1",
      remainingCredits: 2_880,
      resultExpiresAt: "2026-09-01T12:15:00.000Z",
      sessionId: "session-1",
      state: "completed",
    });
  });

  it("maps database details to typed domain or safe infrastructure errors", async () => {
    const repository = new SupabaseTaskWorkflowRepository();
    createServiceClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "IDEMPOTENCY_CONFLICT private row detail" },
      }),
    } as never);
    await expect(
      repository.beginTaskExecution({
        idempotencyKey: "task-request-1",
        modelId: "openai/gpt-4.1-mini",
        ownerToken: "owner-token",
        providerCostCeilingMicroUsd: 12_000,
        requestFingerprint: "a".repeat(64),
        taskType: "study",
        userId: "00000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      name: "CampaignDomainError",
    });

    createServiceClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ ...ownerExecution, execution_id: null }],
        error: null,
      }),
    } as never);
    await expect(
      repository.beginTaskExecution({
        idempotencyKey: "task-request-1",
        modelId: "openai/gpt-4.1-mini",
        ownerToken: "owner-token",
        providerCostCeilingMicroUsd: 12_000,
        requestFingerprint: "a".repeat(64),
        taskType: "study",
        userId: "00000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toEqual(
      new TaskWorkflowRepositoryUnavailableError(),
    );
  });
});
