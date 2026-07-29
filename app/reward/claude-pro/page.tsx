import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClaudeGiftRewardCard } from "@/components/reward/claude-gift";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { CampaignDomainError } from "@/lib/campaign/types";
import { getCampaignRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description:
    "Privately open an official Claude gift attached to an eligible YGF redemption.",
  robots: {
    follow: false,
    index: false,
  },
  title: "Claude Pro gift",
};

export default async function ClaudeProRewardPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth?next=/reward/claude-pro");
  }

  const repository = getCampaignRepository();
  let reward;
  try {
    reward = await repository.getPartnerReward({ userId: user.id });
  } catch (error) {
    if (
      error instanceof CampaignDomainError &&
      error.code === "PARTNER_REWARD_NOT_FOUND"
    ) {
      redirect("/wallet");
    }
    throw error;
  }

  if (!reward) {
    redirect("/wallet");
  }

  return <ClaudeGiftRewardCard reward={reward} />;
}
