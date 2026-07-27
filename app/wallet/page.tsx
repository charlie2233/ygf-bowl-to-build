import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { TaskLauncher } from "@/components/task-launcher";
import { WalletBalance } from "@/components/wallet-balance";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { isWalletExpired } from "@/lib/campaign/credits";
import { CampaignDomainError } from "@/lib/campaign/types";
import { getCampaignRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your AI balance",
};

export default async function WalletPage() {
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
    <section className="wallet-page">
      <Image
        alt=""
        aria-hidden="true"
        className="wallet-page__image"
        height={760}
        priority
        src="/media/malatang-hero.png"
        width={980}
      />
      <div className="wallet-page__inner container">
        <h1>What will you build first?</h1>
        <WalletBalance wallet={wallet} />
        <TaskLauncher />
      </div>
    </section>
  );
}
