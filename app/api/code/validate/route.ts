import { NextResponse } from "next/server";

import {
  createPendingClaim,
  PENDING_CLAIM_COOKIE,
  PENDING_CLAIM_TTL_SECONDS,
} from "@/lib/auth/pending-claim";
import { isSameOriginMutation } from "@/lib/auth/admin";
import {
  getPublicValidationAbuseSignal,
} from "@/lib/auth/request-signal";
import { serverSecret } from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { normalizeCode } from "@/lib/campaign/code";
import { isRedemptionEnabled } from "@/lib/operations/readiness";
import { getCampaignRepository } from "@/lib/repositories";
import { getPublicValidationAdmission } from "@/lib/repositories/public-validation-admission";
import {
  BoundedBodyError,
  readBoundedRequestText,
} from "@/lib/admin/http";

export const dynamic = "force-dynamic";

interface ValidationBody {
  code?: unknown;
  termsAccepted?: unknown;
}

const MAX_VALIDATION_BODY_BYTES = 512;

interface ValidationRouteDependencies {
  handle: (request: Request) => Promise<Response>;
  environment?: Readonly<Record<string, string | undefined>>;
  nodeEnvironment?: string;
}

function validationResponse(
  eligible: boolean,
  status = 200,
) {
  return NextResponse.json(
    { eligible },
    {
      headers: { "cache-control": "private, no-store" },
      status,
    },
  );
}

function validationPausedResponse() {
  return NextResponse.json(
    { eligible: false, error: "REDEMPTION_PAUSED" },
    {
      headers: { "cache-control": "private, no-store" },
      status: 503,
    },
  );
}

export function createValidationRouteHandler({
  handle,
  environment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
}: ValidationRouteDependencies) {
  return async function handleValidationRoute(request: Request) {
    if (!isRedemptionEnabled(environment, nodeEnvironment)) {
      return validationPausedResponse();
    }
    return handle(request);
  };
}

async function handleValidation(request: Request) {
  if (!isSameOriginMutation(request)) {
    return validationResponse(false, 403);
  }

  let body: ValidationBody;
  try {
    const mediaType =
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() ?? "";
    if (mediaType !== "application/json") {
      return validationResponse(false, 400);
    }
    const parsed = JSON.parse(
      await readBoundedRequestText(
        request,
        MAX_VALIDATION_BODY_BYTES,
      ),
    ) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).some(
        (key) => key !== "code" && key !== "termsAccepted",
      )
    ) {
      return validationResponse(false, 400);
    }
    body = parsed as ValidationBody;
  } catch (error) {
    return validationResponse(
      false,
      error instanceof BoundedBodyError &&
        error.code === "BODY_TOO_LARGE"
        ? 413
        : 400,
    );
  }

  if (body.termsAccepted !== true || typeof body.code !== "string") {
    return validationResponse(false, 400);
  }

  try {
    const signal = await getPublicValidationAbuseSignal(request);
    if (!(await getPublicValidationAdmission().admit(signal))) {
      return validationResponse(false, 429);
    }

    let code: string;
    try {
      code = normalizeCode(body.code);
    } catch {
      return validationResponse(false);
    }

    const repository = getCampaignRepository();
    const result = await repository.validateCode({ code });
    if (!result.eligible) {
      return validationResponse(false);
    }

    const user = await getAuthenticatedUser();
    const response = NextResponse.json({
      eligible: true,
      requiresAnonymousSession: user === null,
    });
    response.cookies.set(
      PENDING_CLAIM_COOKIE,
      createPendingClaim(
        code,
        serverSecret("YGF_CLAIM_COOKIE_SECRET"),
      ),
      {
        httpOnly: true,
        maxAge: PENDING_CLAIM_TTL_SECONDS,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch {
    return validationResponse(false, 503);
  }
}

export async function POST(request: Request) {
  return createValidationRouteHandler({
    handle: handleValidation,
  })(request);
}
