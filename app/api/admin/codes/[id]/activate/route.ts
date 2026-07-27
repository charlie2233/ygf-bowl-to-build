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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
};

interface ActivationDependencies {
  authorize?: () => Promise<CampaignAdminAuthorization>;
  environment?: Readonly<Record<string, string | undefined>>;
  gateway?: AdminCodeGateway;
}

interface ActivationContext {
  id: string;
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

async function readRequestId(
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
    !Object.hasOwn(body, "requestId")
  ) {
    return null;
  }
  const requestId = (
    body as { requestId?: unknown }
  ).requestId;
  if (
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId.toLowerCase())
  ) {
    return null;
  }
  return requestId.toLowerCase();
}

export function createAdminBatchActivationHandler({
  authorize = getCampaignAdminAuthorization,
  environment = process.env,
  gateway,
}: ActivationDependencies = {}) {
  return async function handle(
    request: Request,
    context: ActivationContext,
  ): Promise<Response> {
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

    const batchId = context.id.toLowerCase();
    if (!UUID_PATTERN.test(batchId)) {
      return responseJson({ error: "BATCH_ID_INVALID" }, 400);
    }

    let requestId: string | null;
    try {
      requestId = await readRequestId(request);
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
    if (!requestId) {
      return responseJson({ error: "REQUEST_INVALID" }, 400);
    }

    try {
      const activeGateway = gateway ?? getAdminCodeGateway();
      const batch = await activeGateway.activateBatch({
        batchId,
        operatorId: authorization.user.id,
        requestId,
      });
      return responseJson(
        {
          activatedAt: batch.activatedAt,
          batchId: batch.id,
          status: batch.status,
        },
        200,
      );
    } catch (error) {
      if (error instanceof AdminGatewayError) {
        switch (error.code) {
          case "FORBIDDEN":
            return responseJson(
              { error: "ADMIN_REQUIRED" },
              403,
            );
          case "IDEMPOTENCY_CONFLICT":
            return responseJson(
              { error: "IDEMPOTENCY_CONFLICT" },
              409,
            );
          case "NOT_ACTIVATABLE":
            return responseJson(
              { error: "BATCH_NOT_ACTIVATABLE" },
              409,
            );
          case "NOT_FOUND":
            return responseJson(
              { error: "BATCH_NOT_FOUND" },
              404,
            );
          default:
            break;
        }
      }
      return responseJson(
        { error: "ACTIVATION_UNAVAILABLE" },
        503,
      );
    }
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return createAdminBatchActivationHandler()(
    request,
    await params,
  );
}
