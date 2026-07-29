import {
  getCampaignAdminAuthorization,
  isSameOriginAdminMutation,
  type CampaignAdminAuthorization,
} from "@/lib/auth/admin";
import {
  BoundedBodyError,
  readBoundedRequestText,
} from "@/lib/admin/http";
import {
  encryptClaudeGiftUrl,
  normalizeClaudeGiftUrl,
  resolveRewardEncryptionKey,
} from "@/lib/rewards/secret";
import {
  AdminGatewayError,
  getAdminCodeGateway,
  type AdminCodeGateway,
} from "@/lib/repositories/supabase-admin-repository";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const MAX_REWARD_LIFETIME_MS = 366 * 24 * 60 * 60 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ROW_REFERENCE_PATTERN =
  /^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$/u;
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "content-security-policy": "default-src 'none'",
  expires: "0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
};

interface ClaudeGiftAssignmentRequest {
  expiresAt: string;
  giftUrl: string;
  requestId: string;
  rowReference: string;
}

interface AdminClaudeGiftHandlerDependencies {
  authorize?: () => Promise<CampaignAdminAuthorization>;
  environment?: Readonly<Record<string, string | undefined>>;
  gateway?: AdminCodeGateway;
  now?: () => Date;
}

function responseJson(
  body: Readonly<Record<string, unknown>>,
  status: number,
): Response {
  return Response.json(body, {
    headers: PRIVATE_HEADERS,
    status,
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new Error("CONTENT_TYPE_INVALID");
  }
  const body = await readBoundedRequestText(
    request,
    MAX_BODY_BYTES,
  );
  return JSON.parse(body) as unknown;
}

function parseRequest(
  value: unknown,
  now: Date,
): ClaudeGiftAssignmentRequest | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        ![
          "expiresAt",
          "giftUrl",
          "requestId",
          "rowReference",
        ].includes(key),
    ) ||
    typeof body.expiresAt !== "string" ||
    typeof body.giftUrl !== "string" ||
    typeof body.requestId !== "string" ||
    typeof body.rowReference !== "string"
  ) {
    return null;
  }

  const rowReference = body.rowReference.trim().toUpperCase();
  const requestId = body.requestId.trim().toLowerCase();
  const expiry = new Date(body.expiresAt);
  let giftUrl: string;
  try {
    giftUrl = normalizeClaudeGiftUrl(body.giftUrl);
  } catch {
    return null;
  }
  if (
    !ROW_REFERENCE_PATTERN.test(rowReference) ||
    !UUID_PATTERN.test(requestId) ||
    !Number.isFinite(expiry.getTime()) ||
    expiry.getTime() <= now.getTime() ||
    expiry.getTime() - now.getTime() > MAX_REWARD_LIFETIME_MS
  ) {
    return null;
  }

  return {
    expiresAt: expiry.toISOString(),
    giftUrl,
    requestId,
    rowReference,
  };
}

function mapGatewayError(error: AdminGatewayError): Response {
  switch (error.code) {
    case "FORBIDDEN":
      return responseJson({ error: "ADMIN_REQUIRED" }, 403);
    case "NOT_FOUND":
      return responseJson(
        { error: "ROW_REFERENCE_NOT_FOUND" },
        404,
      );
    case "ALREADY_ASSIGNED":
      return responseJson(
        { error: "CLAUDE_GIFT_ALREADY_ASSIGNED" },
        409,
      );
    case "NOT_ASSIGNABLE":
      return responseJson(
        { error: "CLAUDE_GIFT_NOT_ASSIGNABLE" },
        409,
      );
    case "IDEMPOTENCY_CONFLICT":
      return responseJson(
        { error: "IDEMPOTENCY_CONFLICT" },
        409,
      );
    default:
      return responseJson(
        { error: "CLAUDE_GIFT_ASSIGNMENT_UNAVAILABLE" },
        503,
      );
  }
}

export function createAdminClaudeGiftHandler({
  authorize = getCampaignAdminAuthorization,
  environment = process.env,
  gateway,
  now = () => new Date(),
}: AdminClaudeGiftHandlerDependencies = {}) {
  return async function handle(request: Request): Promise<Response> {
    let authorization: CampaignAdminAuthorization;
    try {
      authorization = await authorize();
    } catch {
      return responseJson({ error: "ADMIN_UNAVAILABLE" }, 503);
    }
    if (authorization.kind === "unauthenticated") {
      return responseJson(
        { error: "AUTHENTICATION_REQUIRED" },
        401,
      );
    }
    if (authorization.kind === "forbidden") {
      return responseJson({ error: "ADMIN_REQUIRED" }, 403);
    }
    if (!isSameOriginAdminMutation(request, environment)) {
      return responseJson({ error: "ORIGIN_FORBIDDEN" }, 403);
    }

    let untrustedBody: unknown;
    try {
      untrustedBody = await readJsonBody(request);
    } catch (error) {
      return responseJson(
        {
          error:
            error instanceof BoundedBodyError &&
            error.code === "BODY_TOO_LARGE"
              ? "REQUEST_TOO_LARGE"
              : "REQUEST_INVALID",
        },
        error instanceof BoundedBodyError &&
          error.code === "BODY_TOO_LARGE"
          ? 413
          : 400,
      );
    }
    const input = parseRequest(untrustedBody, now());
    if (!input) {
      return responseJson({ error: "REQUEST_INVALID" }, 400);
    }

    try {
      const secret = encryptClaudeGiftUrl(
        input.giftUrl,
        resolveRewardEncryptionKey(environment),
      );
      const assigned = await (
        gateway ?? getAdminCodeGateway()
      ).assignPartnerReward({
        expiresAt: input.expiresAt,
        kind: "claude-pro-gift",
        operatorId: authorization.user.id,
        requestId: input.requestId,
        rowReference: input.rowReference,
        secret,
      });
      return responseJson(
        {
          expiresAt: assigned.expiresAt,
          kind: assigned.kind,
          rewardId: assigned.id,
          rowReference: assigned.rowReference,
          status: assigned.state,
        },
        201,
      );
    } catch (error) {
      if (error instanceof AdminGatewayError) {
        return mapGatewayError(error);
      }
      return responseJson(
        { error: "CLAUDE_GIFT_ASSIGNMENT_UNAVAILABLE" },
        503,
      );
    }
  };
}

export async function POST(request: Request) {
  return createAdminClaudeGiftHandler()(request);
}
