import { isIP } from "node:net";

import {
  deriveAbuseSignal,
  type AbuseSignal,
} from "@/lib/campaign/rate-limit";
import type { PublicValidationAdmissionInput } from "@/lib/campaign/public-validation-admission";
import type { RedemptionAdmissionInput } from "@/lib/campaign/redemption-admission";
import { resolveRateSession } from "@/lib/auth/rate-session";
import { serverSecret } from "@/lib/auth/runtime";

function mappedIpv4(value: string) {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(
    value,
  );
  if (!match) {
    return null;
  }
  const high = Number.parseInt(match[1]!, 16);
  const low = Number.parseInt(match[2]!, 16);
  return [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff,
  ].join(".");
}

export function canonicalNetworkAddress(value: string | null) {
  const candidate = value?.trim();
  if (
    !candidate ||
    candidate.length > 64 ||
    candidate.includes(",") ||
    candidate.includes("%")
  ) {
    return null;
  }

  const version = isIP(candidate);
  if (version === 4) {
    return candidate
      .split(".")
      .map((octet) => String(Number(octet)))
      .join(".");
  }
  if (version !== 6) {
    return null;
  }

  try {
    const serialized = new URL(`http://[${candidate}]/`).hostname
      .slice(1, -1)
      .toLowerCase();
    return mappedIpv4(serialized) ?? serialized;
  } catch {
    return null;
  }
}

export function trustedNetworkValue(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nodeEnvironment = process.env.NODE_ENV,
) {
  if (environment.VERCEL === "1") {
    const value = canonicalNetworkAddress(
      request.headers.get("x-vercel-forwarded-for"),
    );
    if (value) {
      return value;
    }
    throw new Error("TRUSTED_NETWORK_SIGNAL_UNAVAILABLE");
  }

  if (nodeEnvironment !== "production") {
    return "local-development-network";
  }

  throw new Error("TRUSTED_NETWORK_SIGNAL_UNAVAILABLE");
}

export async function getRedemptionAbuseSignal(
  request: Request,
): Promise<AbuseSignal> {
  return deriveAbuseSignal({
    purpose: "redeem",
    secret: serverSecret("YGF_ABUSE_SIGNAL_SECRET"),
    value: trustedNetworkValue(request),
  });
}

export async function getPublicValidationAbuseSignal(
  request: Request,
): Promise<AbuseSignal> {
  return deriveAbuseSignal({
    purpose: "validate-code",
    secret: serverSecret("YGF_ABUSE_SIGNAL_SECRET"),
    value: trustedNetworkValue(request),
  });
}

interface PublicValidationAdmissionContextInput {
  code?: string;
  userId?: string;
}

export interface PublicValidationAdmissionContext {
  admission: PublicValidationAdmissionInput;
  setRateSessionCookie?: string;
}

export function getPublicValidationAdmissionContext(
  request: Request,
  { code, userId }: PublicValidationAdmissionContextInput,
): PublicValidationAdmissionContext {
  const now = new Date();
  const secret = serverSecret("YGF_ABUSE_SIGNAL_SECRET");
  const rateSession = resolveRateSession(request, secret);
  const signal = deriveAbuseSignal({
    now,
    purpose: "validate-code",
    secret,
    value: trustedNetworkValue(request),
  });
  const sessionDigest = deriveAbuseSignal({
    now,
    purpose: "validate-session",
    secret,
    value: rateSession.id,
  }).digest;
  const codeDigest = code
    ? deriveAbuseSignal({
        now,
        purpose: "validate-claim",
        secret,
        value: code,
      }).digest
    : undefined;
  const accountDigest = userId
    ? deriveAbuseSignal({
        now,
        purpose: "validate-account",
        secret,
        value: userId,
      }).digest
    : undefined;

  return {
    admission: {
      ...(accountDigest ? { accountDigest } : {}),
      ...(codeDigest ? { codeDigest } : {}),
      sessionDigest,
      signal,
    },
    ...(rateSession.setCookieValue
      ? { setRateSessionCookie: rateSession.setCookieValue }
      : {}),
  };
}

interface RedemptionAdmissionContextInput {
  code: string;
  sessionId: string;
  userId: string;
}

export function getRedemptionAdmissionInput(
  request: Request,
  { code, sessionId, userId }: RedemptionAdmissionContextInput,
): RedemptionAdmissionInput {
  const now = new Date();
  const secret = serverSecret("YGF_ABUSE_SIGNAL_SECRET");
  const signal = deriveAbuseSignal({
    now,
    purpose: "redeem",
    secret,
    value: trustedNetworkValue(request),
  });
  const sessionDigest = deriveAbuseSignal({
    now,
    purpose: "redeem-session",
    secret,
    value: sessionId,
  }).digest;
  const codeDigest = deriveAbuseSignal({
    now,
    purpose: "redeem-claim",
    secret,
    value: code,
  }).digest;

  return {
    codeDigest,
    sessionDigest,
    signal,
    userId,
  };
}
