import { NextResponse } from "next/server";

import {
  createPendingClaim,
  PENDING_CLAIM_COOKIE,
  PENDING_CLAIM_TTL_SECONDS,
} from "@/lib/auth/pending-claim";
import { isSameOriginMutation } from "@/lib/auth/admin";
import {
  getPublicValidationAdmissionContext,
  type PublicValidationAdmissionContext,
} from "@/lib/auth/request-signal";
import {
  applyRateSessionCookie,
} from "@/lib/auth/rate-session";
import { serverSecret } from "@/lib/auth/runtime";
import {
  resolveTurnstileConfiguration,
  verifyTurnstileToken,
} from "@/lib/auth/turnstile";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { normalizeCode } from "@/lib/campaign/code";
import { abuseSignalRetryAfterSeconds } from "@/lib/campaign/rate-limit";
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
  turnstileToken?: unknown;
}

const MAX_VALIDATION_BODY_BYTES = 3_072;

interface ValidationRouteDependencies {
  handle: (request: Request) => Promise<Response>;
  environment?: Readonly<Record<string, string | undefined>>;
  nodeEnvironment?: string;
}

interface ValidationResponseOptions {
  error?: string;
  nodeEnvironment?: string;
  rateSessionCookie?: string;
  retryAfterSeconds?: number;
}

function validationResponse(
  eligible: boolean,
  status = 200,
  {
    error,
    nodeEnvironment = process.env.NODE_ENV,
    rateSessionCookie,
    retryAfterSeconds,
  }: ValidationResponseOptions = {},
) {
  const response = NextResponse.json(
    { eligible, ...(error ? { error } : {}) },
    {
      headers: {
        "cache-control": "private, no-store",
        ...(retryAfterSeconds
          ? { "retry-after": String(retryAfterSeconds) }
          : {}),
      },
      status,
    },
  );
  return applyRateSessionCookie(
    response,
    rateSessionCookie,
    nodeEnvironment,
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

async function handleValidation(
  request: Request,
  environment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
) {
  if (!isSameOriginMutation(request, environment)) {
    return validationResponse(false, 403, {
      error: "ORIGIN_FORBIDDEN",
    });
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
        (key) =>
          key !== "code" &&
          key !== "termsAccepted" &&
          key !== "turnstileToken",
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

  let code: string | undefined;
  try {
    code = normalizeCode(body.code);
  } catch {
    code = undefined;
  }

  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  let context: PublicValidationAdmissionContext | undefined;
  try {
    user = await getAuthenticatedUser();
    context = getPublicValidationAdmissionContext(request, {
      ...(code ? { code } : {}),
      ...(user ? { userId: user.id } : {}),
    });
    if (
      !(await getPublicValidationAdmission().admit(context.admission))
    ) {
      return validationResponse(false, 429, {
        nodeEnvironment,
        rateSessionCookie: context.setRateSessionCookie,
        retryAfterSeconds: abuseSignalRetryAfterSeconds(
          context.admission.signal,
        ),
      });
    }

    const challenge = await verifyTurnstileToken(
      body.turnstileToken,
      resolveTurnstileConfiguration(environment, nodeEnvironment),
    );
    if (challenge.kind === "rejected") {
      return validationResponse(false, 403, {
        error: "TURNSTILE_REQUIRED",
        nodeEnvironment,
        rateSessionCookie: context.setRateSessionCookie,
      });
    }
    if (challenge.kind === "unavailable") {
      return validationResponse(false, 503, {
        error: "TURNSTILE_UNAVAILABLE",
        nodeEnvironment,
        rateSessionCookie: context.setRateSessionCookie,
      });
    }
    if (!code) {
      return validationResponse(false, 200, {
        nodeEnvironment,
        rateSessionCookie: context.setRateSessionCookie,
      });
    }

    const repository = getCampaignRepository();
    const result = await repository.validateCode({
      code,
      ...(user ? { userId: user.id } : {}),
    });
    if (!result.eligible) {
      return validationResponse(false, 200, {
        nodeEnvironment,
        rateSessionCookie: context.setRateSessionCookie,
      });
    }

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
        secure: nodeEnvironment === "production",
      },
    );
    response.headers.set("cache-control", "private, no-store");
    return applyRateSessionCookie(
      response,
      context.setRateSessionCookie,
      nodeEnvironment,
    );
  } catch {
    return validationResponse(false, 503, {
      nodeEnvironment,
      rateSessionCookie: context?.setRateSessionCookie,
    });
  }
}

export async function POST(request: Request) {
  return createValidationRouteHandler({
    handle: (currentRequest) =>
      handleValidation(currentRequest, process.env, process.env.NODE_ENV),
  })(request);
}
