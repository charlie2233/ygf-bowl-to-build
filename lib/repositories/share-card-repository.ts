import { isWalletExpired } from "@/lib/campaign/credits";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createServiceRoleClient } from "@/lib/auth/server";
import {
  getDemoCampaignRepository,
} from "@/lib/repositories";
import type { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";

export interface RecordShareCardGenerationInput {
  userId: string;
  walletId: string;
}

export interface ShareCardSignalGateway {
  recordGeneration(
    input: RecordShareCardGenerationInput,
  ): Promise<boolean>;
}

export class ShareCardSignalUnavailableError extends Error {
  constructor() {
    super("SHARE_CARD_SIGNAL_UNAVAILABLE");
    this.name = "ShareCardSignalUnavailableError";
  }
}

function unavailable(): never {
  throw new ShareCardSignalUnavailableError();
}

export class MemoryShareCardSignalGateway
  implements ShareCardSignalGateway
{
  readonly #campaign: MemoryCampaignRepository;
  readonly #recordedWalletIds = new Set<string>();

  constructor(campaign: MemoryCampaignRepository) {
    this.#campaign = campaign;
  }

  async recordGeneration({
    userId,
    walletId,
  }: RecordShareCardGenerationInput) {
    const wallet = await this.#campaign.getWallet({ userId });
    if (wallet.id !== walletId || isWalletExpired(wallet.expiresAt)) {
      return unavailable();
    }
    if (this.#recordedWalletIds.has(walletId)) {
      return false;
    }
    this.#recordedWalletIds.add(walletId);
    try {
      await this.#campaign.recordEvent({
        metadata: { outcome: "success" },
        name: "share_card_generated",
        source: "share",
        userId,
      });
      return true;
    } catch (error) {
      this.#recordedWalletIds.delete(walletId);
      throw error;
    }
  }
}

export class SupabaseShareCardSignalGateway
  implements ShareCardSignalGateway
{
  async recordGeneration({
    userId,
    walletId,
  }: RecordShareCardGenerationInput) {
    const { data, error } = await createServiceRoleClient().rpc(
      "record_share_card_generation",
      {
        p_user_id: userId,
        p_wallet_id: walletId,
      },
    );
    if (error || typeof data !== "boolean") {
      return unavailable();
    }
    return data;
  }
}

const demoGateways = new WeakMap<
  MemoryCampaignRepository,
  MemoryShareCardSignalGateway
>();

export function getShareCardSignalGateway(): ShareCardSignalGateway {
  if (resolveAuthRuntime().mode === "supabase") {
    return new SupabaseShareCardSignalGateway();
  }
  const campaign = getDemoCampaignRepository();
  let gateway = demoGateways.get(campaign);
  if (!gateway) {
    gateway = new MemoryShareCardSignalGateway(campaign);
    demoGateways.set(campaign, gateway);
  }
  return gateway;
}
