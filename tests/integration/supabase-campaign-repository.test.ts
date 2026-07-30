import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServiceRoleClient } from "@/lib/auth/server";
import {
  SupabaseCampaignRepository,
} from "@/lib/repositories/supabase-campaign-repository";

vi.mock("@/lib/auth/server", () => ({
  createServiceRoleClient: vi.fn(),
}));

const createServiceRoleClientMock = vi.mocked(createServiceRoleClient);
const redemptionRow = {
  code_id: "code-1",
  expires_at: "2026-08-10T12:00:00.000Z",
  initial_balance: 3000,
  provider_committed_micro_usd: 0,
  provider_reserved_micro_usd: 0,
  redeemed_at: "2026-07-27T12:00:00.000Z",
  remaining_balance: 3000,
  reserved_balance: 0,
  wallet_created_at: "2026-07-27T12:00:00.000Z",
  wallet_id: "wallet-1",
  wallet_user_id: "user-1",
};

const partnerRewardRow = {
  reward_expires_at: "2026-08-28T12:00:00.000Z",
  reward_id: "reward-1",
  reward_kind: "claude-pro-gift",
  reward_revealed_at: null,
  reward_state: "assigned",
};

const rewardEnvelope = {
  secret_ciphertext: "Q2lwaGVydGV4dA",
  secret_digest: "a".repeat(64),
  secret_iv: "AAAAAAAAAAAAAAAA",
  secret_tag: "AQEBAQEBAQEBAQEBAQEBAQ",
};

function mockServiceClient(response: {
  data: unknown;
  error: { message: string } | null;
}) {
  const from = vi.fn(() => {
    throw new Error("post-commit read attempted");
  });
  const rpc = vi.fn().mockResolvedValue(response);
  createServiceRoleClientMock.mockReturnValue({
    from,
    rpc,
  } as never);
  return { from, rpc };
}

describe("SupabaseCampaignRepository redemption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the complete atomic RPC row without post-commit reads", async () => {
    const { from, rpc } = mockServiceClient({
      data: [redemptionRow],
      error: null,
    });
    const repository = new SupabaseCampaignRepository();

    await expect(
      repository.redeemCode({
        code: "BOWL7K2A",
        idempotencyKey: "redeem-1",
        userId: "user-1",
      }),
    ).resolves.toEqual({
      codeId: "code-1",
      redeemedAt: "2026-07-27T12:00:00.000Z",
      wallet: {
        createdAt: "2026-07-27T12:00:00.000Z",
        expiresAt: "2026-08-10T12:00:00.000Z",
        id: "wallet-1",
        initialBalance: 3000,
        providerCommittedMicroUsd: 0,
        providerReservedMicroUsd: 0,
        remainingBalance: 3000,
        reservedBalance: 0,
        userId: "user-1",
      },
    });
    expect(rpc).toHaveBeenCalledWith("redeem_campaign_code", {
      p_code_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_idempotency_key: "redeem-1",
      p_user_id: "user-1",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps authoritative domain failures distinct from infrastructure failures", async () => {
    const repository = new SupabaseCampaignRepository();
    mockServiceClient({
      data: null,
      error: { message: "CODE_EXPIRED" },
    });
    await expect(
      repository.redeemCode({
        code: "BOWL7K2A",
        idempotencyKey: "redeem-domain",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "CODE_EXPIRED",
      name: "CampaignDomainError",
    });

    mockServiceClient({
      data: null,
      error: { message: "connection reset: sensitive internal detail" },
    });
    const infrastructureFailure = repository.redeemCode({
      code: "BOWL7K2A",
      idempotencyKey: "redeem-infrastructure",
      userId: "user-1",
    });
    await expect(infrastructureFailure).rejects.toMatchObject({
      message: "CAMPAIGN_REPOSITORY_UNAVAILABLE",
      name: "CampaignRepositoryUnavailableError",
    });
    await expect(infrastructureFailure).rejects.not.toThrow(
      /sensitive internal detail/i,
    );
  });

  it("treats an incomplete successful RPC row as infrastructure failure", async () => {
    mockServiceClient({
      data: [{ ...redemptionRow, code_id: null }],
      error: null,
    });
    const repository = new SupabaseCampaignRepository();

    await expect(
      repository.redeemCode({
        code: "BOWL7K2A",
        idempotencyKey: "redeem-malformed",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      message: "CAMPAIGN_REPOSITORY_UNAVAILABLE",
      name: "CampaignRepositoryUnavailableError",
    });
  });

  it("rejects impossible wallet accounting in successful database rows", async () => {
    mockServiceClient({
      data: [{
        ...redemptionRow,
        remaining_balance: 2_950,
        reserved_balance: 120,
      }],
      error: null,
    });
    const repository = new SupabaseCampaignRepository();

    await expect(
      repository.redeemCode({
        code: "BOWL7K2A",
        idempotencyKey: "redeem-impossible-wallet",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      message: "CAMPAIGN_REPOSITORY_UNAVAILABLE",
      name: "CampaignRepositoryUnavailableError",
    });
  });

  it("does not misclassify validation or wallet outages as user state", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn(() => ({ select })),
    } as never);
    const repository = new SupabaseCampaignRepository();

    await expect(
      repository.validateCode({ code: "BOWL7K2A" }),
    ).rejects.toMatchObject({
      message: "CAMPAIGN_REPOSITORY_UNAVAILABLE",
    });
    await expect(
      repository.getWallet({ userId: "user-1" }),
    ).rejects.toMatchObject({
      message: "CAMPAIGN_REPOSITORY_UNAVAILABLE",
    });
  });

  it("treats a redeemed code as eligible only for its trusted owning account", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        expires_at: "2026-08-10T12:00:00.000Z",
        redeemed_by: "user-1",
        state: "redeemed",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn(() => ({ select })),
    } as never);
    const repository = new SupabaseCampaignRepository();

    await expect(
      repository.validateCode({
        code: "BOWL7K2A",
        userId: "user-1",
      }),
    ).resolves.toEqual({ eligible: true });
    await expect(
      repository.validateCode({
        code: "BOWL7K2A",
        userId: "user-2",
      }),
    ).resolves.toEqual({ eligible: false });
    await expect(
      repository.validateCode({ code: "BOWL7K2A" }),
    ).resolves.toEqual({ eligible: false });
    expect(select).toHaveBeenCalledWith(
      "state,expires_at,redeemed_by",
    );
  });

  it("maps partner reward summaries without exposing a secret envelope", async () => {
    const { rpc } = mockServiceClient({
      data: [{ ...partnerRewardRow, ...rewardEnvelope }],
      error: null,
    });
    const repository = new SupabaseCampaignRepository();

    const summary = await repository.getPartnerReward({
      userId: "user-1",
    });

    expect(summary).toEqual({
      expiresAt: "2026-08-28T12:00:00.000Z",
      id: "reward-1",
      kind: "claude-pro-gift",
      state: "assigned",
    });
    expect(JSON.stringify(summary)).not.toContain(
      rewardEnvelope.secret_ciphertext,
    );
    expect(rpc).toHaveBeenCalledWith("get_partner_reward_summary", {
      p_user_id: "user-1",
    });
  });

  it("maps a reveal envelope only from the reveal RPC", async () => {
    const { rpc } = mockServiceClient({
      data: [{ ...partnerRewardRow, ...rewardEnvelope }],
      error: null,
    });
    const repository = new SupabaseCampaignRepository();

    await expect(
      repository.revealPartnerReward({ userId: "user-1" }),
    ).resolves.toEqual({
      reward: {
        expiresAt: "2026-08-28T12:00:00.000Z",
        id: "reward-1",
        kind: "claude-pro-gift",
        state: "assigned",
      },
      secret: {
        ciphertext: rewardEnvelope.secret_ciphertext,
        digest: rewardEnvelope.secret_digest,
        iv: rewardEnvelope.secret_iv,
        tag: rewardEnvelope.secret_tag,
      },
    });
    expect(rpc).toHaveBeenCalledWith("reveal_partner_reward", {
      p_reward_id: null,
      p_user_id: "user-1",
    });
  });

  it("rejects malformed reveal envelopes and maps reward domain errors", async () => {
    mockServiceClient({
      data: [{ ...partnerRewardRow, ...rewardEnvelope, secret_iv: "bad" }],
      error: null,
    });
    const repository = new SupabaseCampaignRepository();
    await expect(
      repository.revealPartnerReward({ userId: "user-1" }),
    ).rejects.toMatchObject({
      message: "CAMPAIGN_REPOSITORY_UNAVAILABLE",
    });

    mockServiceClient({
      data: null,
      error: { message: "PARTNER_REWARD_EXPIRED" },
    });
    await expect(
      repository.revealPartnerReward({ userId: "user-1" }),
    ).rejects.toMatchObject({
      code: "PARTNER_REWARD_EXPIRED",
      name: "CampaignDomainError",
    });
  });
});
