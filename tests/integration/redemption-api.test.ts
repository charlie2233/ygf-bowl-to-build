import { describe, expect, it, vi } from "vitest";

import { hashCode } from "@/lib/campaign/code";
import type { RedemptionAttemptOutcome } from "@/lib/campaign/redemption-admission";
import { createRedemptionHandler } from "@/lib/http/redeem-route";
import {
  MemoryCampaignRepository,
} from "@/lib/repositories/memory-campaign-repository";

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
  code = "BOWL7K2A",
  now = START,
  userId = "demo-user",
}: {
  allowed?: boolean;
  code?: string | null;
  now?: Date;
  userId?: string | null;
} = {}) {
  let currentNow = now;
  let currentIdempotencyKey = "claim-idempotency-1";
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
  const handler = createRedemptionHandler({
    admission: {
      admit: vi.fn(async () => ({
        allowed,
        attemptId: "attempt-1",
      })),
      finish,
    },
    clearPendingClaim,
    getAbuseSignal: vi.fn(async () => ({
      bucket: 1,
      digest: "a".repeat(64),
      expiresAt: "2026-07-27T12:05:00.000Z",
      purpose: "redeem",
      version: "v1" as const,
    })),
    getPendingClaim: vi.fn(async () =>
      code === null
        ? null
        : {
            code,
            idempotencyKey: currentIdempotencyKey,
          },
    ),
    getUser: vi.fn(async () =>
      userId === null ? null : { id: userId },
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
  };
}

describe("redemption API boundary", () => {
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

  it("returns typed used, expired, and revoked outcomes", async () => {
    const used = createHarness();
    expect((await used.redeem()).status).toBe(200);
    used.setPendingClaimIdempotencyKey("claim-idempotency-2");
    expect(
      (await used.redeem()).status,
    ).toBe(409);

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
    expect(throttled.finish).not.toHaveBeenCalled();
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

  it("reports a committed redemption truthfully if attempt finalization fails", async () => {
    const harness = createHarness();
    harness.finish.mockRejectedValueOnce(
      new Error("temporary audit write failure"),
    );

    const response = await harness.redeem();

    expect(response.status).toBe(200);
    expect(harness.clearPendingClaim).toHaveBeenCalledTimes(1);
    await expect(
      harness.repository.getWallet({ userId: "demo-user" }),
    ).resolves.toMatchObject({ remainingBalance: 3000 });
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
