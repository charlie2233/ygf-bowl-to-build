import { cookies } from "next/headers";

import {
  PENDING_CLAIM_COOKIE,
  readPendingClaim,
} from "@/lib/auth/pending-claim";
import { isSameOriginMutation } from "@/lib/auth/admin";
import { getRedemptionAdmissionInput } from "@/lib/auth/request-signal";
import {
  serverSecret,
  type RuntimeEnvironment,
} from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { createRedemptionHandler } from "@/lib/http/redeem-route";
import { isRedemptionEnabled } from "@/lib/operations/readiness";
import { getCampaignRepository } from "@/lib/repositories";
import { getRedemptionAdmission } from "@/lib/repositories/redemption-admission";

export const dynamic = "force-dynamic";

type RedemptionRequestHandler = (request: Request) => Promise<Response>;

interface RedemptionRouteDependencies {
  createHandler: () => Promise<RedemptionRequestHandler>;
  environment?: RuntimeEnvironment;
  nodeEnvironment?: string;
}

function redemptionResponse(error: string, status: number) {
  return Response.json(
    { error },
    {
      headers: { "cache-control": "private, no-store" },
      status,
    },
  );
}

export function createRedemptionRouteHandler({
  createHandler,
  environment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
}: RedemptionRouteDependencies) {
  return async function handleRedemptionRoute(request: Request) {
    if (!isRedemptionEnabled(environment, nodeEnvironment)) {
      return redemptionResponse("REDEMPTION_PAUSED", 503);
    }
    if (!isSameOriginMutation(request, environment)) {
      return redemptionResponse("ORIGIN_FORBIDDEN", 403);
    }
    return (await createHandler())(request);
  };
}

async function createProductionHandler(): Promise<RedemptionRequestHandler> {
  const cookieStore = await cookies();
  return createRedemptionHandler({
    admission: getRedemptionAdmission(),
    async clearPendingClaim() {
      cookieStore.delete(PENDING_CLAIM_COOKIE);
    },
    getAdmissionInput: getRedemptionAdmissionInput,
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
}

export async function POST(request: Request) {
  return createRedemptionRouteHandler({
    createHandler: createProductionHandler,
  })(request);
}
