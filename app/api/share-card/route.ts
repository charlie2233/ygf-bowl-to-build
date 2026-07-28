import {
  BoundedBodyError,
  readBoundedRequestText,
} from "@/lib/admin/http";
import { isSameOriginMutation } from "@/lib/auth/admin";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { isWalletExpired } from "@/lib/campaign/credits";
import type { CampaignRepository } from "@/lib/repositories/campaign-repository";
import { getCampaignRepository } from "@/lib/repositories";
import {
  getShareCardSignalGateway,
  type ShareCardSignalGateway,
} from "@/lib/repositories/share-card-repository";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
};
const MAX_BODY_BYTES = 16;

interface ShareCardEventDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  getUser?: typeof getAuthenticatedUser;
  repository?: Pick<CampaignRepository, "getWallet">;
  signalGateway?: ShareCardSignalGateway;
}

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    { headers: PRIVATE_HEADERS, status },
  );
}

function parseBody(value: unknown): Record<string, never> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 0
  ) {
    throw new Error("SHARE_EVENT_INVALID");
  }
  return {};
}

export function createShareCardEventHandler({
  environment = process.env,
  getUser = getAuthenticatedUser,
  repository,
  signalGateway,
}: ShareCardEventDependencies = {}) {
  return async function handle(request: Request) {
    if (!isSameOriginMutation(request, environment)) {
      return jsonError("ORIGIN_FORBIDDEN", 403);
    }
    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() !== "application/json"
    ) {
      return jsonError("SHARE_EVENT_INVALID", 400);
    }

    try {
      const text = await readBoundedRequestText(
        request,
        MAX_BODY_BYTES,
      );
      parseBody(JSON.parse(text) as unknown);
    } catch (error) {
      const tooLarge =
        error instanceof BoundedBodyError &&
        error.code === "BODY_TOO_LARGE";
      return jsonError(
        tooLarge ? "SHARE_EVENT_TOO_LARGE" : "SHARE_EVENT_INVALID",
        tooLarge ? 413 : 400,
      );
    }

    let user;
    try {
      user = await getUser();
    } catch {
      return jsonError("SHARE_EVENT_UNAVAILABLE", 503);
    }
    if (!user) {
      return jsonError("AUTHENTICATION_REQUIRED", 401);
    }

    try {
      const campaign = repository ?? getCampaignRepository();
      const wallet = await campaign.getWallet({ userId: user.id });
      if (isWalletExpired(wallet.expiresAt)) {
        return jsonError("WALLET_EXPIRED", 410);
      }
      await (
        signalGateway ?? getShareCardSignalGateway()
      ).recordGeneration({
        userId: user.id,
        walletId: wallet.id,
      });
      return new Response(null, {
        headers: PRIVATE_HEADERS,
        status: 204,
      });
    } catch {
      return jsonError("SHARE_EVENT_UNAVAILABLE", 503);
    }
  };
}

export async function POST(request: Request) {
  return createShareCardEventHandler()(request);
}
