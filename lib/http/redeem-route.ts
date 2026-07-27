import {
  CampaignDomainError,
  type CampaignErrorCode,
} from "@/lib/campaign/types";
import type { AbuseSignal } from "@/lib/campaign/rate-limit";
import type {
  RedemptionAdmission,
  RedemptionAdmissionResult,
  RedemptionAttemptOutcome,
} from "@/lib/campaign/redemption-admission";
import type {
  CampaignRepository,
  RedemptionResult,
} from "@/lib/repositories/campaign-repository";
import type { PendingClaim } from "@/lib/auth/pending-claim";
import { toBrowserWallet } from "@/lib/http/campaign-dto";

interface AuthenticatedUser {
  id: string;
}

export interface RedemptionHandlerDependencies {
  admission: RedemptionAdmission;
  clearPendingClaim: () => Promise<void> | void;
  getAbuseSignal: (request: Request) => Promise<AbuseSignal>;
  getPendingClaim: (request: Request) => Promise<PendingClaim | null>;
  getUser: (request: Request) => Promise<AuthenticatedUser | null>;
  repository: Pick<CampaignRepository, "redeemCode">;
}

interface MappedCampaignError {
  error: string;
  outcome: RedemptionAttemptOutcome;
  status: number;
}

function errorResponse(error: string, status: number) {
  return Response.json(
    { error },
    {
      headers: {
        "cache-control": "private, no-store",
      },
      status,
    },
  );
}

function parseBody(value: unknown): Record<string, never> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 0
  ) {
    return null;
  }

  return {};
}

function mapCampaignError(code: CampaignErrorCode): MappedCampaignError {
  switch (code) {
    case "CODE_NOT_FOUND":
    case "INVALID_CODE":
      return {
        error: "CODE_INVALID",
        outcome: "invalid",
        status: 400,
      };
    case "CODE_ALREADY_REDEEMED":
    case "ACCOUNT_ALREADY_REDEEMED":
      return {
        error: code,
        outcome: "unavailable",
        status: 409,
      };
    case "CODE_EXPIRED":
      return {
        error: code,
        outcome: "unavailable",
        status: 410,
      };
    case "CODE_REVOKED":
      return {
        error: code,
        outcome: "unavailable",
        status: 423,
      };
    default:
      return {
        error: "REDEMPTION_UNAVAILABLE",
        outcome: "unavailable",
        status: 503,
      };
  }
}

async function finishAttempt(
  admission: RedemptionAdmission,
  attemptId: string,
  outcome: RedemptionAttemptOutcome,
) {
  await Promise.resolve()
    .then(() => admission.finish({ attemptId, outcome }))
    .catch(() => undefined);
}

async function clearClaim(
  clearPendingClaim: () => Promise<void> | void,
) {
  await Promise.resolve()
    .then(clearPendingClaim)
    .catch(() => undefined);
}

function successResponse(result: RedemptionResult) {
  return Response.json(
    {
      next: "/redeem/success",
      wallet: toBrowserWallet(result.wallet),
    },
    {
      headers: {
        "cache-control": "private, no-store",
      },
      status: 200,
    },
  );
}

export function createRedemptionHandler({
  admission,
  clearPendingClaim,
  getAbuseSignal,
  getPendingClaim,
  getUser,
  repository,
}: RedemptionHandlerDependencies) {
  return async function handleRedemption(request: Request) {
    let user: AuthenticatedUser | null;
    try {
      user = await getUser(request);
    } catch {
      return errorResponse("REDEMPTION_UNAVAILABLE", 503);
    }
    if (!user) {
      return errorResponse("AUTHENTICATION_REQUIRED", 401);
    }

    let parsedBody: Record<string, never> | null = null;
    try {
      parsedBody = parseBody(await request.json());
    } catch {
      return errorResponse("INVALID_REDEMPTION_REQUEST", 400);
    }
    if (!parsedBody) {
      return errorResponse("INVALID_REDEMPTION_REQUEST", 400);
    }

    let claim: PendingClaim | null;
    try {
      claim = await getPendingClaim(request);
    } catch {
      return errorResponse("REDEMPTION_UNAVAILABLE", 503);
    }
    if (!claim) {
      return errorResponse("PENDING_CLAIM_REQUIRED", 400);
    }

    let admitted: RedemptionAdmissionResult;
    try {
      const signal = await getAbuseSignal(request);
      admitted = await admission.admit({
        signal,
        userId: user.id,
      });
    } catch {
      return errorResponse("REDEMPTION_UNAVAILABLE", 503);
    }

    if (!admitted.allowed) {
      return errorResponse("REDEMPTION_THROTTLED", 429);
    }

    try {
      const result = await repository.redeemCode({
        code: claim.code,
        idempotencyKey: claim.idempotencyKey,
        userId: user.id,
      });
      await finishAttempt(
        admission,
        admitted.attemptId,
        "accepted",
      );
      await clearClaim(clearPendingClaim);
      return successResponse(result);
    } catch (error) {
      if (!(error instanceof CampaignDomainError)) {
        await finishAttempt(
          admission,
          admitted.attemptId,
          "unavailable",
        );
        return errorResponse("REDEMPTION_UNAVAILABLE", 503);
      }

      const mapped = mapCampaignError(error.code);
      await finishAttempt(
        admission,
        admitted.attemptId,
        mapped.outcome,
      );
      await clearClaim(clearPendingClaim);
      return errorResponse(mapped.error, mapped.status);
    }
  };
}
