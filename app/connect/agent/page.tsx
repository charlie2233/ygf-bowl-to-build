import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AgentConnectView } from "@/components/workspace-views";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { isWalletExpired } from "@/lib/campaign/credits";
import { CampaignDomainError } from "@/lib/campaign/types";
import { getCampaignRepository } from "@/lib/repositories";
import { isAgentGatewayReady } from "@/lib/agent/readiness";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect your Agent",
  description:
    "Create and manage a personal, limited YGF OpenAI-compatible API key.",
};

function configuredOrigin(value: string | undefined) {
  if (!value?.trim()) {
    return "";
  }
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "[::1]");
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

export default async function AgentConnectPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth?next=/connect/agent");
  }
  if (user.isAnonymous) {
    redirect("/auth?next=/connect/agent&upgrade=1");
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

  return (
    <AgentConnectView
      configuredOrigin={configuredOrigin(process.env.NEXT_PUBLIC_APP_URL)}
      gatewayEnabled={isAgentGatewayReady(process.env)}
    />
  );
}
