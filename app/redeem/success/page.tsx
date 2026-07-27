import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

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

  let wallet;
  try {
    wallet = await getCampaignRepository().getWallet({
      userId: user.id,
    });
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

  return (
    <section className="redemption-state redemption-state--success">
      <div>
        <CheckCircle2 aria-hidden="true" />
        <h1>Your Build Credits are ready</h1>
        <p>
          Your AI balance is active. Pick a useful task and get to a first
          result.
        </p>
        <a className="button button--primary button--medium" href="/wallet">
          Choose your first task
        </a>
      </div>
    </section>
  );
}
