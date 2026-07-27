import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TaskShell } from "@/components/task/task-shell";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { isWalletExpired } from "@/lib/campaign/credits";
import { CampaignDomainError } from "@/lib/campaign/types";
import {
  getTaskDefinition,
  isTaskType,
} from "@/lib/content/tasks";
import { modelChoicesForTask } from "@/lib/providers/model-catalog";
import { getCampaignRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build with AI",
};

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ model?: string | string[] }>;
}) {
  const { type } = await params;
  if (!isTaskType(type)) {
    notFound();
  }
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

  const query = await searchParams;
  const selected =
    typeof query.model === "string" ? query.model : "best";
  return (
    <TaskShell
      initialCredits={wallet.remainingBalance}
      initialModel={selected}
      modelChoices={modelChoicesForTask(type)}
      task={getTaskDefinition(type)}
    />
  );
}
