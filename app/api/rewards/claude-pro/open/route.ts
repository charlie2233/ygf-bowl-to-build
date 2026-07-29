import { isSameOriginMutation } from "@/lib/auth/admin";
import type { RuntimeEnvironment } from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";
import {
  CampaignDomainError,
} from "@/lib/campaign/types";
import { getCampaignRepository } from "@/lib/repositories";
import type { Task4CampaignRepository } from "@/lib/repositories/supabase-campaign-repository";
import {
  decryptClaudeGiftUrl,
  resolveRewardEncryptionKey,
} from "@/lib/rewards/secret";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "content-security-policy": "default-src 'none'",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

interface RewardUser {
  id: string;
}

interface ClaudeGiftOpenHandlerDependencies {
  environment?: RuntimeEnvironment;
  getUser?: () => Promise<RewardUser | null>;
  repository?: Pick<
    Task4CampaignRepository,
    "revealPartnerReward"
  >;
}

function errorResponse(error: string, status: number): Response {
  return Response.json(
    { error },
    {
      headers: PRIVATE_HEADERS,
      status,
    },
  );
}

function campaignErrorResponse(error: CampaignDomainError): Response {
  switch (error.code) {
    case "PARTNER_REWARD_NOT_FOUND":
      return errorResponse("CLAUDE_GIFT_NOT_FOUND", 404);
    case "PARTNER_REWARD_EXPIRED":
      return errorResponse("CLAUDE_GIFT_EXPIRED", 410);
    case "PARTNER_REWARD_REVOKED":
      return errorResponse("CLAUDE_GIFT_REVOKED", 423);
    default:
      return errorResponse("CLAUDE_GIFT_UNAVAILABLE", 503);
  }
}

export function createClaudeGiftOpenHandler({
  environment = process.env,
  getUser = getAuthenticatedUser,
  repository,
}: ClaudeGiftOpenHandlerDependencies = {}) {
  return async function handle(request: Request): Promise<Response> {
    if (
      request.method !== "POST" ||
      new URL(request.url).search !== ""
    ) {
      return errorResponse("REQUEST_INVALID", 400);
    }
    if (!isSameOriginMutation(request, environment)) {
      return errorResponse("ORIGIN_FORBIDDEN", 403);
    }

    let user: RewardUser | null;
    try {
      user = await getUser();
    } catch {
      return errorResponse("CLAUDE_GIFT_UNAVAILABLE", 503);
    }
    if (!user) {
      return errorResponse("AUTHENTICATION_REQUIRED", 401);
    }

    try {
      const reveal = await (
        repository ?? getCampaignRepository()
      ).revealPartnerReward({ userId: user.id });
      if (reveal.reward.kind !== "claude-pro-gift") {
        return errorResponse("CLAUDE_GIFT_UNAVAILABLE", 503);
      }
      const destination = decryptClaudeGiftUrl(
        reveal.secret,
        resolveRewardEncryptionKey(environment),
      );
      return new Response(null, {
        headers: {
          ...PRIVATE_HEADERS,
          location: destination,
        },
        status: 303,
      });
    } catch (error) {
      if (error instanceof CampaignDomainError) {
        return campaignErrorResponse(error);
      }
      return errorResponse("CLAUDE_GIFT_UNAVAILABLE", 503);
    }
  };
}

export async function POST(request: Request) {
  return createClaudeGiftOpenHandler()(request);
}
