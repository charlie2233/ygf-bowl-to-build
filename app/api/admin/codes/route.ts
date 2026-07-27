import { hashCode } from "@/lib/campaign/code";
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
  ADMIN_BATCH_SOURCES,
  AdminGatewayError,
  getAdminCodeGateway,
  type AdminBatchSource,
  type AdminCodeGateway,
} from "@/lib/repositories/supabase-admin-repository";
import {
  generatePrivateRowReferences,
  generateUniqueCodes,
  serializePrivateCodeCsv,
} from "@/lib/admin/code-batch";

export type { AdminCodeGateway };

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
};

interface BatchRequest {
  count: number;
  expiresAt?: string;
  name: string;
  requestId: string;
  source: AdminBatchSource;
}

interface AdminCodeBatchDependencies {
  authorize?: () => Promise<CampaignAdminAuthorization>;
  environment?: Readonly<Record<string, string | undefined>>;
  gateway?: AdminCodeGateway;
  generateCodes?: (count: number) => readonly string[];
  generateRowReferences?: (
    count: number,
  ) => readonly string[];
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

async function readJsonBody(
  request: Request,
): Promise<unknown> {
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
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("BODY_INVALID");
  }
}

function parseBatchRequest(
  value: unknown,
  now: Date,
): BatchRequest | null {
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
          "count",
          "expiresAt",
          "name",
          "requestId",
          "source",
        ].includes(key),
    )
  ) {
    return null;
  }

  const name =
    typeof body.name === "string" ? body.name.trim() : "";
  const source =
    typeof body.source === "string" &&
    ADMIN_BATCH_SOURCES.includes(
      body.source as AdminBatchSource,
    )
      ? (body.source as AdminBatchSource)
      : null;
  const requestId =
    typeof body.requestId === "string"
      ? body.requestId.toLowerCase()
      : "";
  if (
    !Number.isSafeInteger(body.count) ||
    Number(body.count) < 1 ||
    Number(body.count) > 3_000 ||
    name.length < 1 ||
    name.length > 120 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      requestId,
    ) ||
    source === null
  ) {
    return null;
  }

  let expiresAt: string | undefined;
  if (body.expiresAt !== undefined) {
    if (
      typeof body.expiresAt !== "string" ||
      body.expiresAt.length > 64
    ) {
      return null;
    }
    const expiry = new Date(body.expiresAt);
    if (
      !Number.isFinite(expiry.getTime()) ||
      expiry.getTime() <= now.getTime()
    ) {
      return null;
    }
    expiresAt = expiry.toISOString();
  }

  return {
    count: Number(body.count),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    name,
    requestId,
    source,
  };
}

function publicOrigin(
  request: Request,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const configured = environment.YGF_PUBLIC_ORIGIN?.trim();
  if (configured) {
    return new URL(configured).origin;
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("PUBLIC_ORIGIN_REQUIRED");
  }
  return new URL(request.url).origin;
}

function privateFilename(batchId: string): string {
  const safeId = batchId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return `ygf-private-codes-${safeId || "batch"}.csv`;
}

export function createAdminCodeBatchHandler({
  authorize = getCampaignAdminAuthorization,
  environment = process.env,
  gateway,
  generateCodes = generateUniqueCodes,
  generateRowReferences = generatePrivateRowReferences,
  now = () => new Date(),
}: AdminCodeBatchDependencies = {}) {
  return async function handle(request: Request): Promise<Response> {
    let authorization: CampaignAdminAuthorization;
    try {
      authorization = await authorize();
    } catch {
      return responseJson({ error: "ADMIN_UNAVAILABLE" }, 503);
    }
    if (authorization.kind === "unauthenticated") {
      return responseJson({ error: "AUTHENTICATION_REQUIRED" }, 401);
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
    const input = parseBatchRequest(untrustedBody, now());
    if (!input) {
      return responseJson({ error: "BATCH_INVALID" }, 400);
    }

    let codes: readonly string[];
    let rowReferences: readonly string[];
    try {
      codes = generateCodes(input.count);
      rowReferences = generateRowReferences(input.count);
    } catch {
      return responseJson(
        { error: "CODE_GENERATION_UNAVAILABLE" },
        503,
      );
    }
    if (
      codes.length !== input.count ||
      new Set(codes).size !== codes.length ||
      rowReferences.length !== input.count ||
      new Set(rowReferences).size !== rowReferences.length ||
      rowReferences.some(
        (rowReference) =>
          !/^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$/.test(
            rowReference,
          ),
      )
    ) {
      return responseJson(
        { error: "CODE_GENERATION_UNAVAILABLE" },
        503,
      );
    }

    try {
      const codeHashes = await Promise.all(codes.map(hashCode));
      const csv = serializePrivateCodeCsv(
        codes,
        publicOrigin(request, environment),
        rowReferences,
      );
      const activeGateway = gateway ?? getAdminCodeGateway();
      const batch = await activeGateway.createBatch({
        codeHashes,
        ...(input.expiresAt === undefined
          ? {}
          : { expiresAt: input.expiresAt }),
        name: input.name,
        operatorId: authorization.user.id,
        requestId: input.requestId,
        rowReferences,
        source: input.source,
      });
      if (batch.status !== "pending") {
        throw new Error("BATCH_STATE_INVALID");
      }

      return new Response(csv, {
        headers: {
          ...PRIVATE_HEADERS,
          "content-disposition": `attachment; filename="${privateFilename(batch.id)}"`,
          "content-security-policy": "default-src 'none'; sandbox",
          "content-type": "text/csv; charset=utf-8",
          "x-ygf-batch-id": batch.id,
          "x-ygf-batch-status": batch.status,
          "x-content-type-options": "nosniff",
        },
        status: 201,
      });
    } catch (error) {
      if (
        error instanceof AdminGatewayError &&
        error.code === "IDEMPOTENCY_CONFLICT"
      ) {
        return responseJson(
          { error: "IDEMPOTENCY_CONFLICT" },
          409,
        );
      }
      if (
        error instanceof AdminGatewayError &&
        error.code === "FORBIDDEN"
      ) {
        return responseJson({ error: "ADMIN_REQUIRED" }, 403);
      }
      return responseJson({ error: "BATCH_UNAVAILABLE" }, 503);
    }
  };
}

export async function POST(request: Request) {
  return createAdminCodeBatchHandler()(request);
}
