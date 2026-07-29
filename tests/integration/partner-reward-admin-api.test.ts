import { describe, expect, it, vi } from "vitest";

import { createAdminClaudeGiftHandler } from "@/app/api/admin/rewards/claude-pro/route";
import { createAdminClaudeGiftRevocationHandler } from "@/app/api/admin/rewards/claude-pro/revoke/route";
import type { CampaignAdminAuthorization } from "@/lib/auth/admin";
import type {
  AdminCodeGateway,
  AdminPartnerRewardAssignInput,
} from "@/lib/repositories/supabase-admin-repository";
import { AdminGatewayError } from "@/lib/repositories/supabase-admin-repository";

const ORIGIN = "https://malatangai.com";
const ROW_REFERENCE = "YGF-JKMNPQRS-0001";
const REQUEST_ID = "06fccf76-d189-4b6b-945a-00029d94b963";
const EXPIRES_AT = "2026-08-20T12:00:00.000Z";
const GIFT_URL =
  "https://claude.ai/gift/redeem?gift=admin-private-token";
const KEY_BASE64 = Buffer.alloc(32, 13).toString("base64");
const authorization: CampaignAdminAuthorization = {
  kind: "authorized",
  user: {
    email: "operator@example.com",
    id: "operator-1",
  },
};

function gateway() {
  const assignPartnerReward = vi.fn(
    async (input: AdminPartnerRewardAssignInput) => ({
      expiresAt: input.expiresAt,
      id: "reward-1",
      kind: "claude-pro-gift" as const,
      rowReference: input.rowReference,
      state: "assigned" as const,
    }),
  );
  const revokePartnerReward = vi.fn(async (input) => ({
    expiresAt: EXPIRES_AT,
    id: "reward-1",
    kind: "claude-pro-gift" as const,
    rowReference: input.rowReference,
    state: "revoked" as const,
  }));
  return {
    activateBatch: vi.fn(),
    assignPartnerReward,
    createBatch: vi.fn(),
    getAnalyticsData: vi.fn(),
    recordEvent: vi.fn(),
    revokeCode: vi.fn(),
    revokePartnerReward,
  } satisfies AdminCodeGateway;
}

function request(body: unknown, origin = ORIGIN) {
  return new Request(
    `${ORIGIN}/api/admin/rewards/claude-pro`,
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        origin,
      },
      method: "POST",
    },
  );
}

function validBody() {
  return {
    expiresAt: EXPIRES_AT,
    giftUrl: GIFT_URL,
    requestId: REQUEST_ID,
    rowReference: ROW_REFERENCE,
  };
}

describe("admin Claude gift assignment API", () => {
  it("encrypts one official gift and returns metadata only", async () => {
    const activeGateway = gateway();
    const handler = createAdminClaudeGiftHandler({
      authorize: async () => authorization,
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      },
      gateway: activeGateway,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });

    const response = await handler(request(validBody()));
    const responseText = await response.text();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(responseText).not.toContain(GIFT_URL);
    expect(responseText).not.toContain("admin-private-token");
    expect(activeGateway.assignPartnerReward).toHaveBeenCalledTimes(1);
    const stored =
      activeGateway.assignPartnerReward.mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      expiresAt: EXPIRES_AT,
      kind: "claude-pro-gift",
      operatorId: "operator-1",
      requestId: REQUEST_ID,
      rowReference: ROW_REFERENCE,
      secret: {
        digest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    });
    expect(JSON.stringify(stored)).not.toContain(GIFT_URL);
    expect(JSON.stringify(stored)).not.toContain(
      "admin-private-token",
    );
  });

  it("rejects unauthorized, cross-origin, and invalid gift links", async () => {
    const activeGateway = gateway();
    const dependencies = {
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      },
      gateway: activeGateway,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    };

    expect(
      (
        await createAdminClaudeGiftHandler({
          ...dependencies,
          authorize: async () => ({ kind: "unauthenticated" }),
        })(request(validBody()))
      ).status,
    ).toBe(401);
    expect(
      (
        await createAdminClaudeGiftHandler({
          ...dependencies,
          authorize: async () => authorization,
        })(
          request(validBody(), "https://attacker.example"),
        )
      ).status,
    ).toBe(403);
    for (const giftUrl of [
      "https://claude.ai.evil.example/gift/redeem?gift=x",
      "https://claude.ai/gift/redeem?utm_source=partner",
      "https://claude.ai/gift/redeem?gift=one&gift=two",
      "https://claude.ai/gift/redeem/opaque-token/extra",
    ]) {
      expect(
        (
          await createAdminClaudeGiftHandler({
            ...dependencies,
            authorize: async () => authorization,
          })(request({ ...validBody(), giftUrl }))
        ).status,
      ).toBe(400);
    }
    expect(activeGateway.assignPartnerReward).not.toHaveBeenCalled();
  });

  it("fails closed when the encryption key is missing", async () => {
    const activeGateway = gateway();
    const response = await createAdminClaudeGiftHandler({
      authorize: async () => authorization,
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
      },
      gateway: activeGateway,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    })(request(validBody()));

    expect(response.status).toBe(503);
    expect(activeGateway.assignPartnerReward).not.toHaveBeenCalled();
  });
});

describe("admin Claude gift revocation API", () => {
  it("revokes by the non-secret row reference and returns metadata only", async () => {
    const activeGateway = gateway();
    const handler = createAdminClaudeGiftRevocationHandler({
      authorize: async () => authorization,
      environment: { YGF_PUBLIC_ORIGIN: ORIGIN },
      gateway: activeGateway,
    });

    const response = await handler(
      request({ rowReference: ROW_REFERENCE }),
    );
    const responseText = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(responseText).toContain(ROW_REFERENCE);
    expect(responseText).not.toContain("ciphertext");
    expect(responseText).not.toContain("giftUrl");
    expect(activeGateway.revokePartnerReward).toHaveBeenCalledWith({
      operatorId: "operator-1",
      rowReference: ROW_REFERENCE,
    });
  });

  it("rejects unauthenticated, cross-origin, malformed, and unavailable revocations", async () => {
    const activeGateway = gateway();
    const dependencies = {
      environment: { YGF_PUBLIC_ORIGIN: ORIGIN },
      gateway: activeGateway,
    };

    expect(
      (
        await createAdminClaudeGiftRevocationHandler({
          ...dependencies,
          authorize: async () => ({ kind: "unauthenticated" }),
        })(request({ rowReference: ROW_REFERENCE }))
      ).status,
    ).toBe(401);
    expect(
      (
        await createAdminClaudeGiftRevocationHandler({
          ...dependencies,
          authorize: async () => authorization,
        })(
          request(
            { rowReference: ROW_REFERENCE },
            "https://attacker.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createAdminClaudeGiftRevocationHandler({
          ...dependencies,
          authorize: async () => authorization,
        })(request({ rewardId: "reward-1" }))
      ).status,
    ).toBe(400);

    activeGateway.revokePartnerReward.mockRejectedValueOnce(
      new AdminGatewayError("UNAVAILABLE"),
    );
    expect(
      (
        await createAdminClaudeGiftRevocationHandler({
          ...dependencies,
          authorize: async () => authorization,
        })(request({ rowReference: ROW_REFERENCE }))
      ).status,
    ).toBe(503);
  });
});
