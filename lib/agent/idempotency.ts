import { createHmac } from "node:crypto";

import { serverSecret, type RuntimeEnvironment } from "@/lib/auth/runtime";

const CLIENT_IDEMPOTENCY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const PERSONAL_KEY_PATTERN = /^ygf_[A-Za-z0-9_-]{43}$/u;
const CLAIM_CODE_PATTERN = /^[A-Za-z0-9]{8}$/u;

/**
 * Converts an untrusted transport retry token to opaque storage material.
 * The raw token must stay at the HTTP boundary: it is never safe to hand it
 * to a repository, provider, analytics event, or response header.
 */
export function fingerprintClientIdempotencyKey({
  domain,
  environment = process.env,
  secretName,
  value,
}: {
  domain: string;
  environment?: RuntimeEnvironment;
  secretName:
    | "YGF_AGENT_REQUEST_FINGERPRINT_SECRET"
    | "YGF_TASK_FINGERPRINT_SECRET";
  value: unknown;
}): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !CLIENT_IDEMPOTENCY_PATTERN.test(value) ||
    PERSONAL_KEY_PATTERN.test(value) ||
    CLAIM_CODE_PATTERN.test(value)
  ) {
    throw new Error("CLIENT_IDEMPOTENCY_KEY_INVALID");
  }

  const secret = serverSecret(
    secretName,
    environment,
    process.env.NODE_ENV,
  );
  return `idem_${createHmac("sha256", secret)
    .update(`${domain}:`, "utf8")
    .update(value, "utf8")
    .digest("hex")}`;
}
