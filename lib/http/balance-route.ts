import { CampaignDomainError } from "@/lib/campaign/types";
import { toBrowserWallet } from "@/lib/http/campaign-dto";
import type { CampaignRepository } from "@/lib/repositories/campaign-repository";

interface AuthenticatedUser {
  id: string;
}

export interface BalanceHandlerDependencies {
  getUser: () => Promise<AuthenticatedUser | null>;
  repository: Pick<CampaignRepository, "getWallet">;
}

function balanceResponse(body: unknown, status: number) {
  return Response.json(body, {
    headers: { "cache-control": "private, no-store" },
    status,
  });
}

export function createBalanceHandler({
  getUser,
  repository,
}: BalanceHandlerDependencies) {
  return async function handleBalance() {
    let user: AuthenticatedUser | null;
    try {
      user = await getUser();
    } catch {
      return balanceResponse({ error: "BALANCE_UNAVAILABLE" }, 503);
    }
    if (!user) {
      return balanceResponse(
        { error: "AUTHENTICATION_REQUIRED" },
        401,
      );
    }

    try {
      const wallet = await repository.getWallet({
        userId: user.id,
      });
      return balanceResponse(
        { wallet: toBrowserWallet(wallet) },
        200,
      );
    } catch (error) {
      if (
        error instanceof CampaignDomainError &&
        error.code === "WALLET_NOT_FOUND"
      ) {
        return balanceResponse({ error: error.code }, 404);
      }
      return balanceResponse({ error: "BALANCE_UNAVAILABLE" }, 503);
    }
  };
}
