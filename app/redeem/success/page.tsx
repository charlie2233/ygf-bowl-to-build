import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
        <div className="redemption-state__actions">
          <Link className="button button--primary button--medium" href="/wallet">
            Use AI now
          </Link>
          <Link
            className="button button--secondary button--medium"
            href="/connect/agent"
          >
            Connect my Agent
          </Link>
        </div>
        <Link
          className="redemption-state__advanced"
          href="/connect/agent#developer-api-key"
        >
          Developer API key
        </Link>
        <Link className="redemption-state__share" href="/share">
          Generate a safe check-in card
        </Link>
      </div>
    </section>
  );
}
