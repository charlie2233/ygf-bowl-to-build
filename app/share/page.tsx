import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ShareCardBuilder } from "@/components/share/share-card-builder";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { isWalletExpired } from "@/lib/campaign/credits";
import {
  CampaignDomainError,
  type TaskType,
} from "@/lib/campaign/types";
import { getCampaignRepository } from "@/lib/repositories";
import { getTaskWorkflowRepository } from "@/lib/repositories/task-workflow-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create a check-in card",
  description:
    "Download a public, secret-free YGF Bowl-to-Build check-in card.",
};

export function SharePageContent({
  firstTaskType,
}: {
  firstTaskType?: TaskType;
}) {
  return (
    <section className="share-page">
      <div className="container">
        <header className="share-page__intro">
          <p>YGF Bowl-to-Build</p>
          <h1>Create your check-in card</h1>
          <p>
            Preview the public card, then download it as an SVG when
            you’re ready. If you completed a task, its verified type is
            added automatically.
          </p>
        </header>
        <ShareCardBuilder firstTaskType={firstTaskType} />
      </div>
    </section>
  );
}

export default async function SharePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/redeem");
  }

  try {
    const wallet = await getCampaignRepository().getWallet({
      userId: user.id,
    });
    if (isWalletExpired(wallet.expiresAt)) {
      redirect("/expired");
    }
  } catch (error) {
    if (
      error instanceof CampaignDomainError &&
      error.code === "WALLET_NOT_FOUND"
    ) {
      redirect("/redeem");
    }
    throw error;
  }

  const earliestCompletedTask =
    await getTaskWorkflowRepository().getEarliestCompletedTask({
      userId: user.id,
    });
  return (
    <SharePageContent
      firstTaskType={earliestCompletedTask?.taskType}
    />
  );
}
