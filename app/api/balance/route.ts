import { getAuthenticatedUser } from "@/lib/auth/user";
import { createBalanceHandler } from "@/lib/http/balance-route";
import { getCampaignRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export async function GET() {
  return createBalanceHandler({
    getUser: getAuthenticatedUser,
    repository: getCampaignRepository(),
  })();
}
