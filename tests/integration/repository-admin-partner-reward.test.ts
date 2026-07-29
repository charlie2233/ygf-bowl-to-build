import { describe, expect, it, vi } from "vitest";

import { hashCode } from "@/lib/campaign/code";
import { CampaignDomainError } from "@/lib/campaign/types";
import { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";
import { RepositoryAdminCodeGateway } from "@/lib/repositories/supabase-admin-repository";

const OPERATOR_ID = "demo-operator";
const ROW_REFERENCE = "YGF-JKMNPQRS-0001";
const FUTURE_EXPIRY = "2099-08-28T12:00:00.000Z";
const SECRET = {
  ciphertext: "Q2lwaGVydGV4dFJld2FyZA",
  digest: "a".repeat(64),
  iv: "AAAAAAAAAAAAAAAA",
  tag: "AQEBAQEBAQEBAQEBAQEBAQ",
};

function requestId(suffix: string): string {
  return `00000000-0000-4000-8000-00000000000${suffix}`;
}

async function pendingRewardInventory(code = "GIFT2026") {
  const repository = new MemoryCampaignRepository();
  const gateway = new RepositoryAdminCodeGateway(repository);
  const codeHash = await hashCode(code);
  const batch = await gateway.createBatch({
    codeHashes: [codeHash],
    name: "Partner reward test",
    operatorId: OPERATOR_ID,
    requestId: requestId("1"),
    rowReferences: [ROW_REFERENCE],
    source: "soft-test",
  });
  const assignment = {
    expiresAt: FUTURE_EXPIRY,
    kind: "claude-pro-gift" as const,
    operatorId: OPERATOR_ID,
    requestId: requestId("2"),
    rowReference: ROW_REFERENCE,
    secret: SECRET,
  };
  await gateway.assignPartnerReward(assignment);
  return { assignment, batch, code, gateway, repository };
}

describe("repository admin partner-reward revocation", () => {
  it("retains a pending revocation and never attaches that reward at activation", async () => {
    const { assignment, batch, code, gateway, repository } =
      await pendingRewardInventory();

    await expect(
      gateway.revokePartnerReward({
        operatorId: OPERATOR_ID,
        rowReference: ROW_REFERENCE,
      }),
    ).resolves.toMatchObject({
      rowReference: ROW_REFERENCE,
      state: "revoked",
    });
    await expect(
      gateway.revokePartnerReward({
        operatorId: OPERATOR_ID,
        rowReference: ROW_REFERENCE,
      }),
    ).resolves.toMatchObject({ state: "revoked" });
    await expect(
      gateway.assignPartnerReward(assignment),
    ).resolves.toMatchObject({
      rowReference: ROW_REFERENCE,
      state: "revoked",
    });

    await gateway.activateBatch({
      batchId: batch.id,
      operatorId: OPERATOR_ID,
      requestId: requestId("3"),
    });
    await repository.redeemCode({
      code,
      idempotencyKey: "pending-revocation-redeem",
      userId: "pending-revocation-user",
    });

    await expect(
      repository.getPartnerReward({
        userId: "pending-revocation-user",
      }),
    ).resolves.toBeNull();
    expect(JSON.stringify(repository.toJSON())).not.toContain(
      SECRET.ciphertext,
    );
  });

  it("revokes active assigned inventory without returning its envelope", async () => {
    const { assignment, batch, code, gateway, repository } =
      await pendingRewardInventory("ACTV2026");
    await gateway.activateBatch({
      batchId: batch.id,
      operatorId: OPERATOR_ID,
      requestId: requestId("3"),
    });

    const revoked = await gateway.revokePartnerReward({
      operatorId: OPERATOR_ID,
      rowReference: ROW_REFERENCE,
    });
    expect(revoked).toMatchObject({
      rowReference: ROW_REFERENCE,
      state: "revoked",
    });
    expect(JSON.stringify(revoked)).not.toContain(SECRET.ciphertext);
    await expect(
      gateway.assignPartnerReward(assignment),
    ).resolves.toMatchObject({
      rowReference: ROW_REFERENCE,
      state: "revoked",
    });
    await repository.redeemCode({
      code,
      idempotencyKey: "active-revocation-redeem",
      userId: "active-revocation-user",
    });
    await expect(
      repository.getPartnerReward({
        userId: "active-revocation-user",
      }),
    ).resolves.toMatchObject({ state: "revoked" });
    await expect(
      repository.revealPartnerReward({
        userId: "active-revocation-user",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CampaignDomainError>>({
        code: "PARTNER_REWARD_REVOKED",
      }),
    );
  });

  it("replays the current expired state without attaching a pending gift", async () => {
    vi.useFakeTimers();
    try {
      const start = new Date("2026-07-28T12:00:00.000Z");
      vi.setSystemTime(start);
      const repository = new MemoryCampaignRepository({
        now: () => new Date(),
      });
      const gateway = new RepositoryAdminCodeGateway(repository);
      const code = "EXPIRE26";
      const batch = await gateway.createBatch({
        codeHashes: [await hashCode(code)],
        name: "Expiring partner reward test",
        operatorId: OPERATOR_ID,
        requestId: requestId("4"),
        rowReferences: [ROW_REFERENCE],
        source: "soft-test",
      });
      const assignment = {
        expiresAt: "2026-07-28T12:01:00.000Z",
        kind: "claude-pro-gift" as const,
        operatorId: OPERATOR_ID,
        requestId: requestId("5"),
        rowReference: ROW_REFERENCE,
        secret: SECRET,
      };
      await gateway.assignPartnerReward(assignment);

      vi.setSystemTime(new Date("2026-07-28T12:02:00.000Z"));
      await expect(
        gateway.assignPartnerReward(assignment),
      ).resolves.toMatchObject({ state: "expired" });
      await gateway.activateBatch({
        batchId: batch.id,
        operatorId: OPERATOR_ID,
        requestId: requestId("6"),
      });
      await repository.redeemCode({
        code,
        idempotencyKey: "expired-replay-redeem",
        userId: "expired-replay-user",
      });
      await expect(
        repository.getPartnerReward({
          userId: "expired-replay-user",
        }),
      ).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
