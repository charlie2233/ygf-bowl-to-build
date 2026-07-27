import { createHmac } from "node:crypto";
import { domainError } from "@/lib/campaign/types";

const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_INPUT_BYTES = 512;
const MINIMUM_BUCKET_MS = 60_000;
const MAXIMUM_BUCKET_MS = 60 * 60_000;

export const ABUSE_SIGNAL_VERSION = "v1" as const;
export const DEFAULT_ABUSE_SIGNAL_BUCKET_MS = 5 * 60_000;

export interface AbuseSignal {
  version: typeof ABUSE_SIGNAL_VERSION;
  purpose: string;
  bucket: number;
  digest: string;
  expiresAt: string;
}

export interface DeriveAbuseSignalInput {
  secret: string;
  purpose: string;
  value: string;
  now?: Date;
  bucketMs?: number;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function deriveAbuseSignal({
  secret,
  purpose,
  value,
  now = new Date(),
  bucketMs = DEFAULT_ABUSE_SIGNAL_BUCKET_MS,
}: DeriveAbuseSignalInput): AbuseSignal {
  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < MINIMUM_SECRET_BYTES
  ) {
    return domainError("ABUSE_SIGNAL_SECRET_INVALID");
  }

  if (
    typeof purpose !== "string" ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(purpose)
  ) {
    return domainError("ABUSE_SIGNAL_PURPOSE_INVALID");
  }

  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, "utf8") > MAXIMUM_INPUT_BYTES
  ) {
    return domainError("ABUSE_SIGNAL_INPUT_INVALID");
  }

  if (
    !isValidDate(now) ||
    !Number.isSafeInteger(bucketMs) ||
    bucketMs < MINIMUM_BUCKET_MS ||
    bucketMs > MAXIMUM_BUCKET_MS
  ) {
    return domainError("ABUSE_SIGNAL_INPUT_INVALID");
  }

  const bucket = Math.floor(now.getTime() / bucketMs);
  const digest = createHmac("sha256", secret)
    .update(
      `ygf-campaign:${ABUSE_SIGNAL_VERSION}:${purpose}:${bucket}:`,
      "utf8",
    )
    .update(value, "utf8")
    .digest("hex");

  return {
    version: ABUSE_SIGNAL_VERSION,
    purpose,
    bucket,
    digest,
    expiresAt: new Date((bucket + 1) * bucketMs).toISOString(),
  };
}
