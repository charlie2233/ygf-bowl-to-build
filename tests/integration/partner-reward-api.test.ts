import { describe, expect, it, vi } from "vitest";

import { createClaudeGiftOpenHandler } from "@/app/api/rewards/claude-pro/open/route";
import { CampaignDomainError } from "@/lib/campaign/types";
import { isWalletExpired } from "@/lib/campaign/credits";
import {
  MemoryCampaignRepository,
} from "@/lib/repositories/memory-campaign-repository";
import {
  encryptClaudeGiftUrl,
} from "@/lib/rewards/secret";

const START = new Date("2026-07-28T12:00:00.000Z");
const EXPIRES = "2026-08-28T12:00:00.000Z";
const KEY = Buffer.alloc(32, 11);
const KEY_BASE64 = KEY.toString("base64");
const GIFT_URL =
  "https://claude.ai/gift/redeem?gift=integration-private-token";
const ORIGIN = "https://malatangai.com";

function repositoryWithGift(now: () => Date = () => START) {
  return new MemoryCampaignRepository({
    demoMode: true,
    demoPartnerReward: {
      expiresAt: EXPIRES,
      secret: encryptClaudeGiftUrl(GIFT_URL, KEY),
    },
    now,
  });
}

function request(origin = ORIGIN) {
  return new Request(
    `${ORIGIN}/api/rewards/claude-pro/open`,
    {
      headers: { origin },
      method: "POST",
    },
  );
}

describe("Claude gift owner-only open boundary", () => {
  it("adds one private gift to the special code and safely reopens it", async () => {
    const repository = repositoryWithGift();
    await repository.redeemCode({
      code: "CLAUDE26",
      idempotencyKey: "reward-redemption-1",
      userId: "reward-user",
    });
    const handler = createClaudeGiftOpenHandler({
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      },
      getUser: async () => ({ id: "reward-user" }),
      repository,
    });

    const first = await handler(request());
    const replay = await handler(request());

    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe(GIFT_URL);
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await first.text()).toBe("");
    expect(replay.status).toBe(303);
    expect(replay.headers.get("location")).toBe(GIFT_URL);
    await expect(
      repository.getPartnerReward({ userId: "reward-user" }),
    ).resolves.toMatchObject({
      kind: "claude-pro-gift",
      state: "revealed",
    });

    const serialized = JSON.stringify(repository.toJSON());
    expect(serialized).not.toContain(GIFT_URL);
    expect(serialized).not.toContain("integration-private-token");
    expect(serialized).not.toContain(
      encryptClaudeGiftUrl(GIFT_URL, KEY).digest,
    );
  });

  it("keeps normal codes normal and denies another account", async () => {
    const ordinary = repositoryWithGift();
    await ordinary.redeemCode({
      code: "BOWL7K2A",
      idempotencyKey: "ordinary-redemption-1",
      userId: "ordinary-user",
    });
    await expect(
      ordinary.getPartnerReward({ userId: "ordinary-user" }),
    ).resolves.toBeNull();

    const reward = repositoryWithGift();
    await reward.redeemCode({
      code: "CLAUDE26",
      idempotencyKey: "reward-redemption-2",
      userId: "owner-user",
    });
    const handler = createClaudeGiftOpenHandler({
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      },
      getUser: async () => ({ id: "other-user" }),
      repository: reward,
    });
    const response = await handler(request());

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("reveals a valid gift after its 3,000-credit wallet expires", async () => {
    let now = START;
    const repository = repositoryWithGift(() => now);
    await repository.redeemCode({
      code: "CLAUDE26",
      idempotencyKey: "reward-redemption-wallet-expiry",
      userId: "reward-user",
    });
    now = new Date("2026-08-20T12:00:00.000Z");
    expect(isWalletExpired(
      (await repository.getWallet({ userId: "reward-user" })).expiresAt,
      now,
    )).toBe(true);

    const handler = createClaudeGiftOpenHandler({
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      },
      getUser: async () => ({ id: "reward-user" }),
      repository,
    });

    const response = await handler(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(GIFT_URL);
  });

  it("fails closed for cross-origin, expired, and corrupt rewards", async () => {
    let now = START;
    const repository = repositoryWithGift(() => now);
    await repository.redeemCode({
      code: "CLAUDE26",
      idempotencyKey: "reward-redemption-3",
      userId: "reward-user",
    });
    const reveal = vi.spyOn(repository, "revealPartnerReward");
    const handler = createClaudeGiftOpenHandler({
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      },
      getUser: async () => ({ id: "reward-user" }),
      repository,
    });

    expect(
      (await handler(request("https://attacker.example"))).status,
    ).toBe(403);
    expect(reveal).not.toHaveBeenCalled();

    now = new Date("2026-09-01T12:00:00.000Z");
    expect((await handler(request())).status).toBe(410);
    expect((await repository.getPartnerReward({
      userId: "reward-user",
    }))?.state).toBe("expired");

    const corrupt = createClaudeGiftOpenHandler({
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      },
      getUser: async () => ({ id: "reward-user" }),
      repository: {
        revealPartnerReward: vi.fn(async () => ({
          reward: {
            expiresAt: EXPIRES,
            id: "reward-corrupt",
            kind: "claude-pro-gift" as const,
            state: "assigned" as const,
          },
          secret: {
            ciphertext: "corrupt",
            digest: "0".repeat(64),
            iv: "corrupt",
            tag: "corrupt",
          },
        })),
      },
    });
    expect((await corrupt(request())).status).toBe(503);
  });

  it("maps reward domain errors without leaking details", async () => {
    const handler = createClaudeGiftOpenHandler({
      environment: {
        YGF_PUBLIC_ORIGIN: ORIGIN,
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      },
      getUser: async () => ({ id: "reward-user" }),
      repository: {
        revealPartnerReward: vi.fn(async () => {
          throw new CampaignDomainError("PARTNER_REWARD_REVOKED");
        }),
      },
    });
    const response = await handler(request());
    expect(response.status).toBe(423);
    expect(await response.json()).toEqual({
      error: "CLAUDE_GIFT_REVOKED",
    });
  });
});
