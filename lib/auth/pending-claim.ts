import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { normalizeCode } from "@/lib/campaign/code";

export const PENDING_CLAIM_COOKIE = "ygf_pending_claim";
export const PENDING_CLAIM_TTL_SECONDS = 10 * 60;

interface PendingClaimPayload {
  code: string;
  expiresAt: number;
  nonce: string;
}

export interface PendingClaim {
  code: string;
  idempotencyKey: string;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createPendingClaim(
  code: string,
  secret: string,
  now = new Date(),
) {
  const payload: PendingClaimPayload = {
    code: normalizeCode(code),
    expiresAt: now.getTime() + PENDING_CLAIM_TTL_SECONDS * 1000,
    nonce: randomUUID(),
  };
  const encoded = encode(JSON.stringify(payload));

  return `${encoded}.${signature(encoded, secret)}`;
}

export function readPendingClaim(
  value: string | undefined,
  secret: string,
  now = new Date(),
) {
  if (!value || value.length > 1024) {
    return null;
  }
  const [encoded, suppliedSignature, ...rest] = value.split(".");
  if (
    !encoded ||
    !suppliedSignature ||
    rest.length > 0 ||
    !safeEqual(signature(encoded, secret), suppliedSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<PendingClaimPayload>;
    if (
      typeof payload.code !== "string" ||
      typeof payload.expiresAt !== "number" ||
      !Number.isSafeInteger(payload.expiresAt) ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 1 ||
      payload.expiresAt <= now.getTime()
    ) {
      return null;
    }
    return {
      code: normalizeCode(payload.code),
      idempotencyKey: payload.nonce,
    };
  } catch {
    return null;
  }
}
