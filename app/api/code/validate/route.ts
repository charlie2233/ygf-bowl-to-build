import { NextResponse } from "next/server";

import {
  createPendingClaim,
  PENDING_CLAIM_COOKIE,
  PENDING_CLAIM_TTL_SECONDS,
} from "@/lib/auth/pending-claim";
import {
  getPublicValidationAbuseSignal,
} from "@/lib/auth/request-signal";
import { serverSecret } from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { normalizeCode } from "@/lib/campaign/code";
import { getCampaignRepository } from "@/lib/repositories";
import { getPublicValidationAdmission } from "@/lib/repositories/public-validation-admission";

export const dynamic = "force-dynamic";

interface ValidationBody {
  code?: unknown;
  termsAccepted?: unknown;
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

export async function POST(request: Request) {
  let body: ValidationBody;
  try {
    body = (await request.json()) as ValidationBody;
  } catch {
    return validationResponse(false, 400);
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
      next: user ? null : "/auth?next=/redeem",
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
