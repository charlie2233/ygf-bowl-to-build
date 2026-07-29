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
  AdminGatewayError,
  getAdminCodeGateway,
  type AdminCodeGateway,
} from "@/lib/repositories/supabase-admin-repository";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512;
const ROW_REFERENCE_PATTERN =
  /^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$/u;
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "content-security-policy": "default-src 'none'",
  expires: "0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
};

interface PartnerRewardRevocationDependencies {
  authorize?: () => Promise<CampaignAdminAuthorization>;
  environment?: Readonly<Record<string, string | undefined>>;
  gateway?: AdminCodeGateway;
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

async function readRowReference(
  request: Request,
): Promise<string | null> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return null;
  }
  const text = await readBoundedRequestText(
    request,
    MAX_BODY_BYTES,
  );
  const body: unknown = JSON.parse(text);
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "rowReference")
  ) {
    return null;
  }
  const rowReference = (
    body as { rowReference?: unknown }
  ).rowReference;
  if (typeof rowReference !== "string") {
    return null;
  }
  const normalized = rowReference.trim().toUpperCase();
  return ROW_REFERENCE_PATTERN.test(normalized)
    ? normalized
    : null;
}

function mapGatewayError(error: AdminGatewayError): Response {
  switch (error.code) {
    case "FORBIDDEN":
      return responseJson({ error: "ADMIN_REQUIRED" }, 403);
    case "NOT_FOUND":
      return responseJson(
        { error: "PARTNER_REWARD_NOT_FOUND" },
        404,
      );
    default:
      return responseJson(
        { error: "PARTNER_REWARD_REVOCATION_UNAVAILABLE" },
        503,
      );
  }
}

export function createAdminClaudeGiftRevocationHandler({
  authorize = getCampaignAdminAuthorization,
  environment = process.env,
  gateway,
}: PartnerRewardRevocationDependencies = {}) {
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

    let rowReference: string | null;
    try {
      rowReference = await readRowReference(request);
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
    if (!rowReference) {
      return responseJson({ error: "REQUEST_INVALID" }, 400);
    }

    try {
      const reward = await (
        gateway ?? getAdminCodeGateway()
      ).revokePartnerReward({
        operatorId: authorization.user.id,
        rowReference,
      });
      return responseJson(
        {
          expiresAt: reward.expiresAt,
          kind: reward.kind,
          rewardId: reward.id,
          rowReference: reward.rowReference,
          status: reward.state,
        },
        200,
      );
    } catch (error) {
      if (error instanceof AdminGatewayError) {
        return mapGatewayError(error);
      }
      return responseJson(
        { error: "PARTNER_REWARD_REVOCATION_UNAVAILABLE" },
        503,
      );
    }
  };
}

export async function POST(request: Request) {
  return createAdminClaudeGiftRevocationHandler()(request);
}
