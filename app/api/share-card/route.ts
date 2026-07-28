import {
  BoundedBodyError,
  readBoundedRequestText,
} from "@/lib/admin/http";
import { recordProductSignal } from "@/lib/analytics/product-signals";
import { isSameOriginMutation } from "@/lib/auth/admin";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { isWalletExpired } from "@/lib/campaign/credits";
import type { TaskType } from "@/lib/campaign/types";
import type { CampaignRepository } from "@/lib/repositories/campaign-repository";
import type { RecordEventInput } from "@/lib/repositories/campaign-repository";
import { getCampaignRepository } from "@/lib/repositories";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
};
const MAX_BODY_BYTES = 64;
const TASK_TYPES = new Set<TaskType>([
  "study",
  "coding",
  "career",
  "pick-my-bowl",
]);

interface ShareCardEventDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  getUser?: typeof getAuthenticatedUser;
  recordEvent?: (input: RecordEventInput) => Promise<unknown>;
  repository?: Pick<CampaignRepository, "getWallet">;
}

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    { headers: PRIVATE_HEADERS, status },
  );
}

function parseBody(value: unknown): { taskType?: TaskType } {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("SHARE_EVENT_INVALID");
  }
  const keys = Object.keys(value);
  if (
    keys.some((key) => key !== "taskType") ||
    keys.length > 1
  ) {
    throw new Error("SHARE_EVENT_INVALID");
  }
  const taskType = (value as { taskType?: unknown }).taskType;
  if (taskType === undefined) {
    return {};
  }
  if (
    typeof taskType !== "string" ||
    !TASK_TYPES.has(taskType as TaskType)
  ) {
    throw new Error("SHARE_EVENT_INVALID");
  }
  return { taskType: taskType as TaskType };
}

export function createShareCardEventHandler({
  environment = process.env,
  getUser = getAuthenticatedUser,
  recordEvent = recordProductSignal,
  repository,
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

    let input: { taskType?: TaskType };
    try {
      const text = await readBoundedRequestText(
        request,
        MAX_BODY_BYTES,
      );
      input = parseBody(JSON.parse(text) as unknown);
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
      await recordEvent({
        metadata: {
          outcome: "success",
          ...(input.taskType ? { taskType: input.taskType } : {}),
        },
        name: "share_card_generated",
        source: "share",
        userId: user.id,
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
