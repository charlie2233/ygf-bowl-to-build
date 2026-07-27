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
});
