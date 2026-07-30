import { describe, expect, it, vi } from "vitest";

import { hashCode } from "@/lib/campaign/code";
import type {
  RedemptionAdmission,
  RedemptionAttemptOutcome,
} from "@/lib/campaign/redemption-admission";
import { createRedemptionHandler } from "@/lib/http/redeem-route";
import { createRedemptionRouteHandler } from "@/app/api/redeem/route";
import {
  MemoryCampaignRepository,
} from "@/lib/repositories/memory-campaign-repository";
import {
  MemoryRedemptionAdmission,
} from "@/lib/repositories/redemption-admission";

const START = new Date("2026-07-27T12:00:00.000Z");

function daysBetween(start: string, end: string) {
  return (
    (new Date(end).getTime() - new Date(start).getTime()) /
    (24 * 60 * 60 * 1000)
  );
}

function responseBody<T>(response: Response) {
  return response.json() as Promise<T>;
}

function createHarness({
  allowed = true,
  admission,
  code = "BOWL7K2A",
  now = START,
  userId = "demo-user",
}: {
  allowed?: boolean;
  admission?: RedemptionAdmission;
  code?: string | null;
  now?: Date;
  userId?: string | null;
} = {}) {
  let currentNow = now;
  let currentIdempotencyKey = "claim-idempotency-1";
  let currentUserId = userId;
  const repository = new MemoryCampaignRepository({
    demoMode: true,
    now: () => currentNow,
  });
  const finish = vi.fn<
    (input: {
      attemptId: string;
      outcome: RedemptionAttemptOutcome;
    }) => Promise<void>
  >(async () => undefined);
  const clearPendingClaim = vi.fn();
  const admit = vi.fn(async () =>
    allowed
      ? ({ allowed: true, attemptId: "attempt-1" } as const)
      : ({ allowed: false, retryAfterSeconds: 137 } as const),
  );
  const getAdmissionInput = vi.fn(
    async (
      _request: Request,
      context: Readonly<{
        code: string;
        sessionId: string;
        userId: string;
      }>,
    ) => ({
      codeDigest: "c".repeat(64),
      sessionDigest: "s".repeat(64),
      signal: {
        bucket: 1,
        digest: "a".repeat(64),
        expiresAt: "2026-07-27T12:05:00.000Z",
        purpose: "redeem",
        version: "v1" as const,
      },
      userId: context.userId,
    }),
  );
  const handler = createRedemptionHandler({
    admission: admission ?? { admit, finish },
    clearPendingClaim,
    getAdmissionInput,
    getPendingClaim: vi.fn(async () =>
      code === null
        ? null
        : {
            code,
            idempotencyKey: currentIdempotencyKey,
          },
    ),
    getUser: vi.fn(async () =>
      currentUserId === null ? null : { id: currentUserId },
    ),
    repository,
  });

  async function redeem(body: Record<string, unknown> = {}) {
    return handler(
      new Request("https://build.ygf.example/api/redeem", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
  }

  return {
    clearPendingClaim,
    getAdmissionInput,
    finish,
    handle: handler,
    redeem,
    repository,
    setNow(value: Date) {
      currentNow = value;
    },
    setPendingClaimIdempotencyKey(value: string) {
      currentIdempotencyKey = value;
    },
    setUserId(value: string | null) {
      currentUserId = value;
    },
  };
}

describe("redemption API boundary", () => {
  it("fails closed before cookies, sessions, admissions, or mutations when redemption is paused", async () => {
    const downstream = vi.fn(async () =>
      async () => Response.json({ shouldNot: "run" }),
    );
    const handler = createRedemptionRouteHandler({
      createHandler: downstream,
      environment: {
        YGF_PUBLIC_ORIGIN: "https://build.ygf.example",
      },
      nodeEnvironment: "production",
    });

    const response = await handler(
      new Request("https://build.ygf.example/api/redeem", {
        headers: { origin: "https://build.ygf.example" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    await expect(response.json()).resolves.toEqual({
      error: "REDEMPTION_PAUSED",
    });
    expect(downstream).not.toHaveBeenCalled();
  });

  it("allows an explicitly enabled production redemption route", async () => {
    const downstreamHandler = vi.fn(async () =>
      Response.json({ ready: true }),
    );
    const createHandler = vi.fn(async () => downstreamHandler);
    const handler = createRedemptionRouteHandler({
      createHandler,
      environment: {
        YGF_PUBLIC_ORIGIN: "https://build.ygf.example",
        YGF_REDEMPTION_ENABLED: "true",
      },
      nodeEnvironment: "production",
    });

    const response = await handler(
      new Request("https://build.ygf.example/api/redeem", {
        headers: { origin: "https://build.ygf.example" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(createHandler).toHaveBeenCalledOnce();
    expect(downstreamHandler).toHaveBeenCalledOnce();
  });

  it("redeems once and initializes a 14-day wallet", async () => {
    const { finish, redeem } = createHarness();
    const response = await redeem();
    const body = await responseBody<{
      wallet: {
        createdAt: string;
        expiresAt: string;
        remainingBalance: number;
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(body.wallet.remainingBalance).toBe(3000);
    expect(daysBetween(body.wallet.createdAt, body.wallet.expiresAt)).toBe(14);
    expect(finish).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      outcome: "accepted",
    });
    expect(body.wallet).not.toHaveProperty("id");
    expect(body.wallet).not.toHaveProperty("userId");
    expect(body.wallet).not.toHaveProperty(
      "providerCommittedMicroUsd",
    );
  });

  it("rejects a caller-selected user ID and derives identity server-side", async () => {
    const { redeem, repository } = createHarness({
      userId: "verified-user",
    });

    const response = await redeem({
      userId: "attacker-selected-user",
    });

    expect(response.status).toBe(400);
    const accepted = await redeem();
    expect(accepted.status).toBe(200);
    await expect(
      repository.getWallet({ userId: "verified-user" }),
    ).resolves.toMatchObject({ userId: "verified-user" });
    await expect(
      repository.getWallet({ userId: "attacker-selected-user" }),
    ).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
  });

  it("rejects non-JSON and oversized bodies before any redemption mutation", async () => {
    const harness = createHarness();
    const nonJson = await harness.handle(
      new Request("https://build.ygf.example/api/redeem", {
        body: "{}",
        headers: { "content-type": "text/plain" },
        method: "POST",
      }),
    );
    const oversized = await harness.redeem({
      filler: "x".repeat(256),
    });

    expect(nonJson.status).toBe(400);
    expect(oversized.status).toBe(413);
    await expect(
      harness.repository.getWallet({ userId: "demo-user" }),
    ).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
  });

  it("retries for the same owner and returns typed cross-owner, expired, and revoked outcomes", async () => {
    const used = createHarness();
    expect((await used.redeem()).status).toBe(200);
    used.setPendingClaimIdempotencyKey("claim-idempotency-2");
    const sameOwnerRetry = await used.redeem();
    expect(sameOwnerRetry.status).toBe(200);
    await expect(sameOwnerRetry.json()).resolves.toMatchObject({
      wallet: { remainingBalance: 3_000 },
    });
    used.setUserId("other-user");
    used.setPendingClaimIdempotencyKey("claim-idempotency-3");
    const otherOwnerRetry = await used.redeem();
    expect(otherOwnerRetry.status).toBe(409);
    await expect(otherOwnerRetry.json()).resolves.toEqual({
      error: "CODE_ALREADY_REDEEMED",
    });

    const expiredHarness = createHarness({ code: "EXPIRE99" });
    await expiredHarness.repository.createBatch({
      codeHashes: [await hashCode("EXPIRE99")],
      expiresAt: "2026-07-27T12:01:00.000Z",
      name: "Expired",
    });
    expiredHarness.setNow(new Date("2026-07-27T12:02:00.000Z"));
    expect((await expiredHarness.redeem()).status).toBe(410);

    const revoked = createHarness({ code: "REVOKE9A" });
    await revoked.repository.createBatch({
      codeHashes: [await hashCode("REVOKE9A")],
      name: "Revoked",
    });
    await revoked.repository.revokeCode({ code: "REVOKE9A" });
    expect((await revoked.redeem()).status).toBe(423);
  });

  it("rate-limits same-owner idempotent retries and returns 429 on the sixth attempt in one bucket", async () => {
    const harness = createHarness({
      admission: new MemoryRedemptionAdmission(),
    });
    const statuses: number[] = [];

    for (let index = 0; index < 6; index += 1) {
      harness.setPendingClaimIdempotencyKey(`same-owner-${index}`);
      statuses.push((await harness.redeem()).status);
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    await expect(
      harness.repository.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({ remainingBalance: 3_000 });
  });

  it("fails closed for unauthenticated, missing-claim, and throttled requests", async () => {
    expect(
      (await createHarness({ userId: null }).redeem()).status,
    ).toBe(401);
    expect(
      (await createHarness({ code: null }).redeem()).status,
    ).toBe(400);

    const throttled = createHarness({ allowed: false });
    const response = await throttled.redeem();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("137");
    expect(throttled.finish).not.toHaveBeenCalled();
  });

  it("binds admission to the trusted account and signed claim session", async () => {
    const harness = createHarness({ userId: "verified-user" });

    await harness.redeem();

    expect(harness.getAdmissionInput).toHaveBeenCalledWith(
      expect.any(Request),
      {
        code: "BOWL7K2A",
        sessionId: "claim-idempotency-1",
        userId: "verified-user",
      },
    );
  });

  it("clears the pending claim after every terminal redemption outcome", async () => {
    const success = createHarness();
    await success.redeem();
    expect(success.clearPendingClaim).toHaveBeenCalledTimes(1);

    const invalid = createHarness({ code: "NOTREAL1" });
    await invalid.redeem();
    expect(invalid.clearPendingClaim).toHaveBeenCalledTimes(1);
    expect(invalid.finish).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      outcome: "invalid",
    });
  });

  it("returns a retryable outage and idempotently recovers when finalization fails after commit", async () => {
    const harness = createHarness();
    harness.finish.mockRejectedValueOnce(
      new Error("temporary audit write failure"),
    );

    const first = await harness.redeem();

    expect(first.status).toBe(503);
    expect(harness.clearPendingClaim).not.toHaveBeenCalled();
    await expect(
      harness.repository.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({ remainingBalance: 3000 });

    const recovered = await harness.redeem();
    expect(recovered.status).toBe(200);
    expect(harness.clearPendingClaim).toHaveBeenCalledTimes(1);
    expect(harness.finish).toHaveBeenLastCalledWith({
      attemptId: "attempt-1",
      outcome: "accepted",
    });
  });

  it("recovers a committed redemption under a fresh production-shaped attempt ID without a second grant", async () => {
    const admit = vi
      .fn<RedemptionAdmission["admit"]>()
      .mockResolvedValueOnce({
        allowed: true,
        attemptId:
          "8df659d5-c8b2-4ae9-b4ef-000000000001",
      })
      .mockResolvedValueOnce({
        allowed: true,
        attemptId:
          "8df659d5-c8b2-4ae9-b4ef-000000000002",
      });
    const finish = vi.fn<RedemptionAdmission["finish"]>(
      async ({ attemptId }) => {
        if (
          attemptId ===
          "8df659d5-c8b2-4ae9-b4ef-000000000001"
        ) {
          throw new Error("temporary audit write failure");
        }
      },
    );
    const harness = createHarness({
      admission: { admit, finish },
    });

    const first = await harness.redeem();
    const recovered = await harness.redeem();

    expect(first.status).toBe(503);
    expect(recovered.status).toBe(200);
    expect(admit).toHaveBeenCalledTimes(2);
    expect(finish).toHaveBeenNthCalledWith(1, {
      attemptId:
        "8df659d5-c8b2-4ae9-b4ef-000000000001",
      outcome: "accepted",
    });
    expect(finish).toHaveBeenNthCalledWith(2, {
      attemptId:
        "8df659d5-c8b2-4ae9-b4ef-000000000002",
      outcome: "accepted",
    });
    expect(harness.clearPendingClaim).toHaveBeenCalledTimes(1);
    await expect(harness.repository.getDashboard()).resolves.toMatchObject({
      activeWalletCount: 1,
      redeemedCount: 1,
      remainingCredits: 3_000,
    });
  });

  it("preserves the signed claim when a dependency fails before completion", async () => {
    const harness = createHarness();
    vi.spyOn(harness.repository, "redeemCode").mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const response = await harness.redeem();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(harness.clearPendingClaim).not.toHaveBeenCalled();
    expect(harness.finish).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      outcome: "unavailable",
    });
  });

  it("replays a lost success with the signed claim idempotency key", async () => {
    const harness = createHarness();

    const first = await harness.redeem();
    const replay = await harness.redeem();

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual(await first.json());
  });
});
