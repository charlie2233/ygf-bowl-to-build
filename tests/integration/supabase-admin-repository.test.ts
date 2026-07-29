import { describe, expect, it } from "vitest";

import {
  AdminGatewayError,
  SupabaseAdminCodeGateway,
} from "@/lib/repositories/supabase-admin-repository";

const OPERATOR_ID = "4f7dfe5e-2059-4f90-8b86-1ce622c9d2f5";
const CREATE_REQUEST_ID =
  "06fccf76-d189-4b6b-945a-00029d94b963";
const ACTIVATE_REQUEST_ID =
  "356dcee0-1872-4d92-a6c2-ee7ece9edb82";
const REVOKE_REQUEST_ID =
  "c23cc7ba-6381-48e0-a6a8-a86569c9001e";
const BATCH_ID = "df5075d4-81f7-4bcc-a00d-2f6bc5fe9a00";
const ROW_REFERENCE = "YGF-ABCDEFGH-0001";
const REWARD_REQUEST_ID =
  "31bd8a9d-6bd0-47c3-8d94-e7c64906a219";
const REWARD_SECRET = {
  ciphertext: "Q2lwaGVydGV4dA",
  digest: "a".repeat(64),
  iv: "AAAAAAAAAAAAAAAA",
  tag: "AQEBAQEBAQEBAQEBAQEBAQ",
};

interface RpcCall {
  args: Record<string, unknown>;
  name: string;
}

interface HarnessOptions {
  errors?: Readonly<Record<string, string>>;
  malformed?: string;
}

function batchRow(status: "active" | "pending") {
  return {
    activated_at:
      status === "active"
        ? "2026-07-27T12:10:00.000Z"
        : null,
    batch_id: BATCH_ID,
    batch_name: "Lunch receipts",
    batch_source: "receipt-insert",
    batch_status: status,
    code_count: 2,
    created_at: "2026-07-27T12:00:00.000Z",
    expires_at: null,
  };
}

function partnerRewardRow() {
  return {
    promo_code_id: "568d66c0-7827-4c01-b30e-1c05d3ee6c45",
    reward_expires_at: "2026-08-28T12:00:00.000Z",
    reward_id: "reward-1",
    reward_kind: "claude-pro-gift",
    reward_revealed_at: null,
    reward_state: "assigned",
    row_reference: ROW_REFERENCE,
  };
}

function revokedPartnerRewardRow(
  state: "expired" | "revoked" = "revoked",
) {
  return {
    ...partnerRewardRow(),
    reward_state: state,
  };
}

function createHarness(options: HarnessOptions = {}) {
  const calls: RpcCall[] = [];
  const client = {
    from() {
      throw new Error(
        "Production inventory mutations must not use table writes",
      );
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ args, name });
      const message = options.errors?.[name];
      if (message) {
        return { data: null, error: { message } };
      }
      if (options.malformed === name) {
        return { data: [{ unexpected: true }], error: null };
      }
      if (name === "create_campaign_admin_batch") {
        return { data: [batchRow("pending")], error: null };
      }
      if (name === "activate_campaign_admin_batch") {
        return { data: [batchRow("active")], error: null };
      }
      if (name === "revoke_campaign_admin_code") {
        return {
          data: [
            {
              code_id:
                "568d66c0-7827-4c01-b30e-1c05d3ee6c45",
              revoked_at: "2026-07-27T12:20:00.000Z",
              row_reference: ROW_REFERENCE,
            },
          ],
          error: null,
        };
      }
      if (name === "assign_partner_reward") {
        return { data: [partnerRewardRow()], error: null };
      }
      if (name === "revoke_partner_reward") {
        return {
          data: [revokedPartnerRewardRow()],
          error: null,
        };
      }
      return { data: null, error: { message: "unknown RPC" } };
    },
  };
  return {
    calls,
    gateway: new SupabaseAdminCodeGateway(
      () => client as never,
    ),
  };
}

describe("Supabase admin inventory gateway", () => {
  it("creates pending inventory with one service RPC and no compensating table writes", async () => {
    const harness = createHarness();
    const hashes = ["a".repeat(64), "b".repeat(64)];
    const rowReferences = [
      ROW_REFERENCE,
      "YGF-ABCDEFGH-0002",
    ];

    await expect(
      harness.gateway.createBatch({
        codeHashes: hashes,
        name: "Lunch receipts",
        operatorId: OPERATOR_ID,
        requestId: CREATE_REQUEST_ID,
        rowReferences,
        source: "receipt-insert",
      }),
    ).resolves.toEqual({
      codeCount: 2,
      createdAt: "2026-07-27T12:00:00.000Z",
      id: BATCH_ID,
      name: "Lunch receipts",
      source: "receipt-insert",
      status: "pending",
    });

    expect(harness.calls).toEqual([
      {
        args: {
          p_code_hashes: hashes,
          p_expires_at: null,
          p_name: "Lunch receipts",
          p_operator_id: OPERATOR_ID,
          p_request_id: CREATE_REQUEST_ID,
          p_row_references: rowReferences,
          p_source: "receipt-insert",
        },
        name: "create_campaign_admin_batch",
      },
    ]);
  });

  it("activates a pending batch atomically through one RPC", async () => {
    const harness = createHarness();

    await expect(
      harness.gateway.activateBatch({
        batchId: BATCH_ID,
        operatorId: OPERATOR_ID,
        requestId: ACTIVATE_REQUEST_ID,
      }),
    ).resolves.toMatchObject({
      activatedAt: "2026-07-27T12:10:00.000Z",
      id: BATCH_ID,
      status: "active",
    });
    expect(harness.calls).toEqual([
      {
        args: {
          p_batch_id: BATCH_ID,
          p_operator_id: OPERATOR_ID,
          p_request_id: ACTIVATE_REQUEST_ID,
        },
        name: "activate_campaign_admin_batch",
      },
    ]);
  });

  it("revokes by non-secret row reference through one audited RPC", async () => {
    const harness = createHarness();

    await expect(
      harness.gateway.revokeCode({
        operatorId: OPERATOR_ID,
        requestId: REVOKE_REQUEST_ID,
        rowReference: ROW_REFERENCE,
      }),
    ).resolves.toEqual({
      codeId: "568d66c0-7827-4c01-b30e-1c05d3ee6c45",
      revokedAt: "2026-07-27T12:20:00.000Z",
      rowReference: ROW_REFERENCE,
    });
    expect(harness.calls).toEqual([
      {
        args: {
          p_operator_id: OPERATOR_ID,
          p_request_id: REVOKE_REQUEST_ID,
          p_row_reference: ROW_REFERENCE,
        },
        name: "revoke_campaign_admin_code",
      },
    ]);
    expect(JSON.stringify(harness.calls)).not.toContain(
      "a".repeat(64),
    );
  });

  it("maps partner reward assignment through its RPC without returning the secret", async () => {
    const harness = createHarness();

    const reward = await harness.gateway.assignPartnerReward({
      expiresAt: "2026-08-28T12:00:00.000Z",
      kind: "claude-pro-gift",
      operatorId: OPERATOR_ID,
      requestId: REWARD_REQUEST_ID,
      rowReference: ROW_REFERENCE,
      secret: REWARD_SECRET,
    });

    expect(reward).toEqual({
      expiresAt: "2026-08-28T12:00:00.000Z",
      id: "reward-1",
      kind: "claude-pro-gift",
      rowReference: ROW_REFERENCE,
      state: "assigned",
    });
    expect(JSON.stringify(reward)).not.toContain(REWARD_SECRET.ciphertext);
    expect(harness.calls).toEqual([
      {
        args: {
          p_expires_at: "2026-08-28T12:00:00.000Z",
          p_kind: "claude-pro-gift",
          p_operator_id: OPERATOR_ID,
          p_request_id: REWARD_REQUEST_ID,
          p_row_reference: ROW_REFERENCE,
          p_secret_ciphertext: REWARD_SECRET.ciphertext,
          p_secret_digest: REWARD_SECRET.digest,
          p_secret_iv: REWARD_SECRET.iv,
          p_secret_tag: REWARD_SECRET.tag,
        },
        name: "assign_partner_reward",
      },
    ]);
  });

  it("revokes a partner reward by row reference without accepting a reward UUID", async () => {
    const harness = createHarness();

    await expect(
      harness.gateway.revokePartnerReward({
        operatorId: OPERATOR_ID,
        rowReference: ROW_REFERENCE,
      }),
    ).resolves.toEqual({
      expiresAt: "2026-08-28T12:00:00.000Z",
      id: "reward-1",
      kind: "claude-pro-gift",
      rowReference: ROW_REFERENCE,
      state: "revoked",
    });
    expect(harness.calls).toEqual([
      {
        args: {
          p_operator_id: OPERATOR_ID,
          p_row_reference: ROW_REFERENCE,
        },
        name: "revoke_partner_reward",
      },
    ]);
  });

  it.each([
    ["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
    ["PARTNER_REWARD_ALREADY_ASSIGNED", "ALREADY_ASSIGNED"],
    ["PARTNER_REWARD_NOT_ASSIGNABLE", "NOT_ASSIGNABLE"],
  ] as const)(
    "maps reward assignment database error %s to %s",
    async (databaseMessage, expectedCode) => {
      const harness = createHarness({
        errors: { assign_partner_reward: databaseMessage },
      });

      await expect(
        harness.gateway.assignPartnerReward({
          expiresAt: "2026-08-28T12:00:00.000Z",
          kind: "claude-pro-gift",
          operatorId: OPERATOR_ID,
          requestId: REWARD_REQUEST_ID,
          rowReference: ROW_REFERENCE,
          secret: REWARD_SECRET,
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<AdminGatewayError>>({
          code: expectedCode,
        }),
      );
    },
  );

  it.each([
    ["ADMIN_REQUIRED", "FORBIDDEN"],
    ["PARTNER_REWARD_NOT_FOUND", "NOT_FOUND"],
  ] as const)(
    "maps reward revocation database error %s to %s",
    async (databaseMessage, expectedCode) => {
      const harness = createHarness({
        errors: { revoke_partner_reward: databaseMessage },
      });

      await expect(
        harness.gateway.revokePartnerReward({
          operatorId: OPERATOR_ID,
          rowReference: ROW_REFERENCE,
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<AdminGatewayError>>({
          code: expectedCode,
        }),
      );
    },
  );

  it.each([
    ["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
    ["ADMIN_REQUIRED", "FORBIDDEN"],
    ["ADMIN_BATCH_NOT_FOUND", "NOT_FOUND"],
    ["ADMIN_BATCH_NOT_ACTIVATABLE", "NOT_ACTIVATABLE"],
  ] as const)(
    "maps activation database error %s to %s",
    async (databaseMessage, expectedCode) => {
      const harness = createHarness({
        errors: {
          activate_campaign_admin_batch: databaseMessage,
        },
      });

      await expect(
        harness.gateway.activateBatch({
          batchId: BATCH_ID,
          operatorId: OPERATOR_ID,
          requestId: ACTIVATE_REQUEST_ID,
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<AdminGatewayError>>({
          code: expectedCode,
        }),
      );
    },
  );

  it("fails closed on malformed RPC result data", async () => {
    const harness = createHarness({
      malformed: "create_campaign_admin_batch",
    });

    await expect(
      harness.gateway.createBatch({
        codeHashes: ["a".repeat(64)],
        name: "Lunch receipts",
        operatorId: OPERATOR_ID,
        requestId: CREATE_REQUEST_ID,
        rowReferences: [ROW_REFERENCE],
        source: "receipt-insert",
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("fails closed on malformed partner reward result data", async () => {
    const harness = createHarness({
      malformed: "assign_partner_reward",
    });

    await expect(
      harness.gateway.assignPartnerReward({
        expiresAt: "2026-08-28T12:00:00.000Z",
        kind: "claude-pro-gift",
        operatorId: OPERATOR_ID,
        requestId: REWARD_REQUEST_ID,
        rowReference: ROW_REFERENCE,
        secret: REWARD_SECRET,
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("fails closed on malformed partner reward revocation data", async () => {
    const harness = createHarness({
      malformed: "revoke_partner_reward",
    });

    await expect(
      harness.gateway.revokePartnerReward({
        operatorId: OPERATOR_ID,
        rowReference: ROW_REFERENCE,
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
