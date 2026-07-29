import { resolveAuthRuntime } from "@/lib/auth/runtime";
import {
  MemoryCampaignRepository,
} from "@/lib/repositories/memory-campaign-repository";
import {
  SupabaseCampaignRepository,
  type Task4CampaignRepository,
} from "@/lib/repositories/supabase-campaign-repository";
import {
  encryptClaudeGiftUrl,
  resolveRewardEncryptionKey,
} from "@/lib/rewards/secret";

const globalRepositories = globalThis as typeof globalThis & {
  ygfDemoRepository?: MemoryCampaignRepository;
};

export function getDemoCampaignRepository(): MemoryCampaignRepository {
  if (!globalRepositories.ygfDemoRepository) {
    const giftUrl =
      process.env.YGF_DEMO_CLAUDE_GIFT_URL?.trim();
    const giftExpiresAt =
      process.env.YGF_DEMO_CLAUDE_GIFT_EXPIRES_AT?.trim();
    let demoPartnerReward:
      | {
          expiresAt: string;
          secret: ReturnType<typeof encryptClaudeGiftUrl>;
        }
      | undefined;
    if (giftUrl || giftExpiresAt) {
      const expiry = new Date(giftExpiresAt ?? "");
      if (
        !giftUrl ||
        !giftExpiresAt ||
        !Number.isFinite(expiry.getTime()) ||
        expiry.getTime() <= Date.now()
      ) {
        throw new Error("YGF demo Claude gift configuration is invalid");
      }
      demoPartnerReward = {
        expiresAt: expiry.toISOString(),
        secret: encryptClaudeGiftUrl(
          giftUrl,
          resolveRewardEncryptionKey(),
        ),
      };
    }
    globalRepositories.ygfDemoRepository =
      new MemoryCampaignRepository({
        ...(demoPartnerReward === undefined
          ? {}
          : { demoPartnerReward }),
        demoMode: true,
      });
  }
  return globalRepositories.ygfDemoRepository;
}

export function getCampaignRepository(): Task4CampaignRepository {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "supabase") {
    return new SupabaseCampaignRepository();
  }

  return getDemoCampaignRepository();
}

export function resetDemoRepositoryForTests() {
  delete globalRepositories.ygfDemoRepository;
}
