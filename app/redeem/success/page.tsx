import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RedeemSuccessView } from "@/components/workspace-views";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { isWalletExpired } from "@/lib/campaign/credits";
import { CampaignDomainError } from "@/lib/campaign/types";
import { getCampaignRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build Credits ready",
};

export default async function RedeemSuccessPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth?next=/wallet");
  }

  const repository = getCampaignRepository();
  let wallet;
  let reward;
  try {
    [wallet, reward] = await Promise.all([
      repository.getWallet({
        userId: user.id,
      }),
      repository.getPartnerReward({
        userId: user.id,
      }),
    ]);
  } catch (error) {
    if (
      error instanceof CampaignDomainError &&
      error.code === "WALLET_NOT_FOUND"
    ) {
      redirect("/redeem");
    }
    throw error;
  }

  if (isWalletExpired(wallet.expiresAt)) {
    redirect("/expired");
  }

  return <RedeemSuccessView reward={reward} />;
}
