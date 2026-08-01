import { createHash, randomBytes } from "node:crypto";

import type { NextResponse } from "next/server";

export const ACCOUNT_MERGE_COOKIE = "ygf_account_merge";
export const ACCOUNT_MERGE_TTL_SECONDS = 10 * 60;

const ACCOUNT_MERGE_VERSION = "v1";
const ACCOUNT_MERGE_TOKEN_BYTES = 32;
const ACCOUNT_MERGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAXIMUM_COOKIE_BYTES = 128;

export type AccountMergeProvider = "apple" | "google";

export interface AccountMergeIntentSecret {
  digest: string;
  provider: AccountMergeProvider;
  value: string;
}

export interface AnonymousAccountMergeSource {
  id: string;
  isAnonymous: true;
  sessionId: string;
}

export function isAccountMergeProvider(
  value: unknown,
): value is AccountMergeProvider {
  return value === "apple" || value === "google";
}

export function anonymousAccountMergeSourceFromClaims(
  claims: unknown,
): AnonymousAccountMergeSource | null {
  if (
    typeof claims !== "object" ||
    claims === null ||
    Array.isArray(claims)
  ) {
    return null;
  }
  const record = claims as Record<string, unknown>;
  if (
    typeof record.sub !== "string" ||
    record.sub.length < 1 ||
    record.sub.length > 128 ||
    record.is_anonymous !== true ||
    typeof record.session_id !== "string" ||
    record.session_id.length < 1 ||
    record.session_id.length > 36 ||
    !SESSION_ID_PATTERN.test(record.session_id)
  ) {
    return null;
  }
  return {
    id: record.sub,
    isAnonymous: true,
    sessionId: record.session_id,
  };
}

export function digestAccountMergeToken(token: string) {
  if (!ACCOUNT_MERGE_TOKEN_PATTERN.test(token)) {
    throw new Error("ACCOUNT_MERGE_TOKEN_INVALID");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createAccountMergeIntentSecret(
  provider: AccountMergeProvider,
  randomToken: () => Buffer = () =>
    randomBytes(ACCOUNT_MERGE_TOKEN_BYTES),
): AccountMergeIntentSecret {
  const bytes = randomToken();
  if (bytes.byteLength !== ACCOUNT_MERGE_TOKEN_BYTES) {
    throw new Error("ACCOUNT_MERGE_RANDOM_INVALID");
  }
  const token = bytes.toString("base64url");
  return {
    digest: digestAccountMergeToken(token),
    provider,
    value: `${ACCOUNT_MERGE_VERSION}.${provider}.${token}`,
  };
}

export function readAccountMergeIntentSecret(
  value: string | null | undefined,
): AccountMergeIntentSecret | null {
  if (
    !value ||
    Buffer.byteLength(value, "utf8") > MAXIMUM_COOKIE_BYTES
  ) {
    return null;
  }
  const [version, provider, token, ...rest] = value.split(".");
  if (
    version !== ACCOUNT_MERGE_VERSION ||
    !isAccountMergeProvider(provider) ||
    !token ||
    rest.length > 0 ||
    !ACCOUNT_MERGE_TOKEN_PATTERN.test(token)
  ) {
    return null;
  }
  return {
    digest: digestAccountMergeToken(token),
    provider,
    value,
  };
}

export function applyAccountMergeCookie(
  response: NextResponse,
  value: string,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
) {
  response.cookies.set(ACCOUNT_MERGE_COOKIE, value, {
    httpOnly: true,
    maxAge: ACCOUNT_MERGE_TTL_SECONDS,
    path: "/auth",
    sameSite: "lax",
    secure: nodeEnvironment === "production",
  });
  return response;
}

export function clearAccountMergeCookie(response: NextResponse) {
  response.cookies.set(ACCOUNT_MERGE_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/auth",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
