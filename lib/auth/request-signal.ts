import {
  deriveAbuseSignal,
  type AbuseSignal,
} from "@/lib/campaign/rate-limit";
import { serverSecret } from "@/lib/auth/runtime";

function firstHeaderValue(value: string | null) {
  const first = value?.split(",")[0]?.trim();
  return first && first.length <= 128 ? first : null;
}

export function trustedNetworkValue(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nodeEnvironment = process.env.NODE_ENV,
) {
  if (environment.VERCEL === "1") {
    const value = firstHeaderValue(
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
