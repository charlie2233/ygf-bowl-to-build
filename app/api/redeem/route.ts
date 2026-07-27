import { cookies } from "next/headers";

import {
  PENDING_CLAIM_COOKIE,
  readPendingClaim,
} from "@/lib/auth/pending-claim";
import { isSameOriginMutation } from "@/lib/auth/admin";
import { getRedemptionAbuseSignal } from "@/lib/auth/request-signal";
import { serverSecret } from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { createRedemptionHandler } from "@/lib/http/redeem-route";
import { getCampaignRepository } from "@/lib/repositories";
import { getRedemptionAdmission } from "@/lib/repositories/redemption-admission";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { error: "ORIGIN_FORBIDDEN" },
      {
        headers: { "cache-control": "private, no-store" },
        status: 403,
      },
    );
  }
  const cookieStore = await cookies();
  const handler = createRedemptionHandler({
    admission: getRedemptionAdmission(),
    async clearPendingClaim() {
      cookieStore.delete(PENDING_CLAIM_COOKIE);
    },
    getAbuseSignal: getRedemptionAbuseSignal,
    async getPendingClaim() {
      return readPendingClaim(
        cookieStore.get(PENDING_CLAIM_COOKIE)?.value,
        serverSecret("YGF_CLAIM_COOKIE_SECRET"),
      );
    },
    async getUser() {
      return getAuthenticatedUser();
    },
    repository: getCampaignRepository(),
  });

  return handler(request);
}
