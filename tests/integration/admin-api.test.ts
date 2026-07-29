import { describe, expect, it, vi } from "vitest";

import {
  createAdminCodeBatchHandler,
  type AdminCodeGateway,
} from "@/app/api/admin/codes/route";
import { createAdminBatchActivationHandler } from "@/lib/admin/batch-activation-handler";
import { createAdminCodeRevokeHandler } from "@/app/api/admin/codes/[id]/revoke/route";
import { createPartnerHandoffSignalHandler } from "@/app/api/events/route";
import type { CampaignAdminAuthorization } from "@/lib/auth/admin";

const ORIGIN = "https://build.ygf.example";
const BATCH_ID = "df5075d4-81f7-4bcc-a00d-2f6bc5fe9a00";
const CREATE_REQUEST_ID =
  "06fccf76-d189-4b6b-945a-00029d94b963";
const ACTIVATE_REQUEST_ID =
  "356dcee0-1872-4d92-a6c2-ee7ece9edb82";
const REVOKE_REQUEST_ID =
  "c23cc7ba-6381-48e0-a6a8-a86569c9001e";
const ROW_REFERENCE = "YGF-JKMNPQRS-0001";
const adminAuthorization: CampaignAdminAuthorization = {
  kind: "authorized",
  user: {
    email: "operator@example.com",
    id: "operator-1",
  },
};

function request(
  path: string,
  body?: unknown,
  origin = ORIGIN,
): Request {
  return new Request(`${ORIGIN}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined
        ? {}
        : { "content-type": "application/json" }),
      origin,
    },
    method: "POST",
  });
}

function createGateway(): AdminCodeGateway & {
  activateBatch: ReturnType<typeof vi.fn>;
  assignPartnerReward: ReturnType<typeof vi.fn>;
  createBatch: ReturnType<typeof vi.fn>;
  recordEvent: ReturnType<typeof vi.fn>;
  revokeCode: ReturnType<typeof vi.fn>;
  revokePartnerReward: ReturnType<typeof vi.fn>;
} {
  return {
    activateBatch: vi.fn(async () => ({
      activatedAt: "2026-07-27T12:05:00.000Z",
      codeCount: 2,
      createdAt: "2026-07-27T12:00:00.000Z",
      id: BATCH_ID,
      name: "Lunch receipts",
      source: "receipt-insert" as const,
      status: "active" as const,
    })),
    assignPartnerReward: vi.fn(async (input) => ({
      expiresAt: input.expiresAt,
      id: "reward-1",
      kind: "claude-pro-gift" as const,
      rowReference: input.rowReference,
      state: "assigned" as const,
    })),
    createBatch: vi.fn(
      async (
        input: Parameters<
          AdminCodeGateway["createBatch"]
        >[0],
      ) => ({
      codeCount: input.codeHashes.length,
      createdAt: "2026-07-27T12:00:00.000Z",
      id: BATCH_ID,
      name: input.name,
      source: input.source,
      status: "pending" as const,
      }),
    ),
    getAnalyticsData: vi.fn(),
    recordEvent: vi.fn(async () => undefined),
    revokeCode: vi.fn(async () => ({
      codeId: "code-1",
      revokedAt: "2026-07-27T12:00:00.000Z",
      rowReference: ROW_REFERENCE,
    })),
    revokePartnerReward: vi.fn(async (input) => ({
      expiresAt: "2026-08-28T12:00:00.000Z",
      id: "reward-1",
      kind: "claude-pro-gift" as const,
      rowReference: input.rowReference,
      state: "revoked" as const,
    })),
  };
}

describe("admin code APIs", () => {
  it("rejects a non-admin code-batch request", async () => {
    const gateway = createGateway();
    const handler = createAdminCodeBatchHandler({
      authorize: async () => ({ kind: "forbidden" }),
      gateway,
    });

    const response = await handler(
      request("/api/admin/codes", {
        count: 300,
        name: "Fall launch",
        requestId: CREATE_REQUEST_ID,
        source: "receipt-insert",
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(gateway.createBatch).not.toHaveBeenCalled();
  });

  it("requires authentication and rejects cross-origin mutations", async () => {
    const gateway = createGateway();
    const unauthenticated = createAdminCodeBatchHandler({
      authorize: async () => ({ kind: "unauthenticated" }),
      gateway,
    });
    const authorized = createAdminCodeBatchHandler({
      authorize: async () => adminAuthorization,
      gateway,
    });

    await expect(
      unauthenticated(
        request("/api/admin/codes", {
          count: 2,
          name: "Lunch receipts",
          requestId: CREATE_REQUEST_ID,
          source: "receipt-insert",
        }),
      ),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      authorized(
        request(
          "/api/admin/codes",
          {
            count: 2,
            name: "Lunch receipts",
            requestId: CREATE_REQUEST_ID,
            source: "receipt-insert",
          },
          "https://attacker.example",
        ),
      ),
    ).resolves.toMatchObject({ status: 403 });
    expect(gateway.createBatch).not.toHaveBeenCalled();
  });

  it("accepts only 1–3,000 codes and bounded batch metadata", async () => {
    const gateway = createGateway();
    const handler = createAdminCodeBatchHandler({
      authorize: async () => adminAuthorization,
      gateway,
    });

    for (const body of [
      {
        count: 0,
        name: "Batch",
        requestId: CREATE_REQUEST_ID,
        source: "staff",
      },
      {
        count: 3_001,
        name: "Batch",
        requestId: CREATE_REQUEST_ID,
        source: "staff",
      },
      {
        count: 1.5,
        name: "Batch",
        requestId: CREATE_REQUEST_ID,
        source: "staff",
      },
      {
        count: 1,
        name: "",
        requestId: CREATE_REQUEST_ID,
        source: "staff",
      },
      {
        count: 1,
        name: "Batch",
        requestId: CREATE_REQUEST_ID,
        source: "unknown",
      },
      {
        count: 1,
        name: "Batch",
        requestId: "not-a-uuid",
        source: "staff",
      },
    ]) {
      const response = await handler(
        request("/api/admin/codes", body),
      );
      expect(response.status).toBe(400);
    }
    expect(gateway.createBatch).not.toHaveBeenCalled();
  });

  it("stores only hashes and returns plaintext once as a private CSV download", async () => {
    const gateway = createGateway();
    const plaintext = ["23456789", "ABCDEFGH"];
    const handler = createAdminCodeBatchHandler({
      authorize: async () => adminAuthorization,
      gateway,
      generateCodes: () => plaintext,
      generateRowReferences: () => [
        ROW_REFERENCE,
        "YGF-JKMNPQRS-0002",
      ],
    });

    const response = await handler(
      request("/api/admin/codes", {
        count: 2,
        expiresAt: "2026-08-10T12:00:00.000Z",
        name: "Lunch receipts",
        requestId: CREATE_REQUEST_ID,
        source: "receipt-insert",
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain(
      "text/csv",
    );
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment;/,
    );
    expect(response.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(response.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    expect(response.headers.get("x-ygf-batch-id")).toBe(
      BATCH_ID,
    );
    expect(response.headers.get("x-ygf-batch-status")).toBe(
      "pending",
    );
    expect(gateway.createBatch).toHaveBeenCalledTimes(1);

    const storedInput = gateway.createBatch.mock.calls[0]?.[0];
    expect(storedInput).toMatchObject({
      codeHashes: expect.arrayContaining([
        expect.stringMatching(/^[a-f0-9]{64}$/),
      ]),
      name: "Lunch receipts",
      operatorId: "operator-1",
      requestId: CREATE_REQUEST_ID,
      rowReferences: [
        ROW_REFERENCE,
        "YGF-JKMNPQRS-0002",
      ],
      source: "receipt-insert",
    });
    expect(JSON.stringify(storedInput)).not.toContain("23456789");
    expect(JSON.stringify(storedInput)).not.toContain("ABCDEFGH");

    const csv = await response.text();
    expect(csv).toMatch(
      /^row_reference,code,claim_url\n/,
    );
    expect(csv).toContain(ROW_REFERENCE);
    expect(csv).toContain("23456789");
    expect(csv).toContain("ABCDEFGH");
    expect(csv).toContain(
      "https://build.ygf.example/redeem#code=23456789",
    );
    expect(response.bodyUsed).toBe(true);
    await expect(response.text()).rejects.toThrow();
  });

  it("persists 300 unique hashes for the standard launch batch", async () => {
    const gateway = createGateway();
    const handler = createAdminCodeBatchHandler({
      authorize: async () => adminAuthorization,
      gateway,
    });

    const response = await handler(
      request("/api/admin/codes", {
        count: 300,
        name: "Standard launch batch",
        requestId: CREATE_REQUEST_ID,
        source: "scratch-card",
      }),
    );

    expect(response.status).toBe(201);
    const input = gateway.createBatch.mock.calls[0]?.[0];
    expect(input.codeHashes).toHaveLength(300);
    expect(new Set(input.codeHashes)).toHaveLength(300);
    expect(
      input.codeHashes.every((hash: string) =>
        /^[a-f0-9]{64}$/.test(hash),
      ),
    ).toBe(true);
  });

  it("does not return plaintext when durable batch creation fails", async () => {
    const gateway = createGateway();
    gateway.createBatch.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const handler = createAdminCodeBatchHandler({
      authorize: async () => adminAuthorization,
      gateway,
      generateCodes: () => ["23456789"],
      generateRowReferences: () => [ROW_REFERENCE],
    });

    const response = await handler(
      request("/api/admin/codes", {
        count: 1,
        name: "Lunch receipts",
        requestId: CREATE_REQUEST_ID,
        source: "receipt-insert",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("23456789");
  });

  it("activates only a same-origin pending batch with a separate request UUID", async () => {
    const gateway = createGateway();
    const handler = createAdminBatchActivationHandler({
      authorize: async () => adminAuthorization,
      gateway,
    });

    const response = await handler(
      request(`/api/admin/codes/${BATCH_ID}/activate`, {
        requestId: ACTIVATE_REQUEST_ID,
      }),
      { id: BATCH_ID },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(gateway.activateBatch).toHaveBeenCalledOnce();
    expect(gateway.activateBatch).toHaveBeenCalledWith({
      batchId: BATCH_ID,
      operatorId: "operator-1",
      requestId: ACTIVATE_REQUEST_ID,
    });
    await expect(response.json()).resolves.toEqual({
      activatedAt: "2026-07-27T12:05:00.000Z",
      batchId: BATCH_ID,
      status: "active",
    });

    const crossOrigin = await handler(
      request(
        `/api/admin/codes/${BATCH_ID}/activate`,
        { requestId: ACTIVATE_REQUEST_ID },
        "https://attacker.example",
      ),
      { id: BATCH_ID },
    );
    expect(crossOrigin.status).toBe(403);
    expect(gateway.activateBatch).toHaveBeenCalledTimes(1);
  });

  it("revokes by row reference and records the idempotent operator request", async () => {
    const gateway = createGateway();
    const handler = createAdminCodeRevokeHandler({
      authorize: async () => adminAuthorization,
      gateway,
    });
    const response = await handler(
      request(
        `/api/admin/codes/${ROW_REFERENCE}/revoke`,
        { requestId: REVOKE_REQUEST_ID },
      ),
      { id: ROW_REFERENCE },
    );

    expect(response.status).toBe(200);
    expect(gateway.revokeCode).toHaveBeenCalledWith({
      operatorId: "operator-1",
      requestId: REVOKE_REQUEST_ID,
      rowReference: ROW_REFERENCE,
    });
    expect(await response.json()).toEqual({
      revoked: true,
    });
  });
});

describe("partner handoff event API", () => {
  it("is retired without recording or redirecting to an external provider", async () => {
    const handler = createPartnerHandoffSignalHandler();
    const response = await handler(
      new Request(`${ORIGIN}/api/events`, {
        headers: { origin: ORIGIN },
        method: "POST",
      }),
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(await response.json()).toEqual({
      error: "ENDPOINT_RETIRED",
      next: "/connect/agent",
    });
  });
});
