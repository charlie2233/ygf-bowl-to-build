import { normalizeCode } from "@/lib/campaign/code";
import { domainError } from "@/lib/campaign/types";

export interface ClaimUrlPolicy {
  allowedOrigins?: readonly string[];
  allowInsecureLocalhost?: boolean;
}

function isLocalhost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function parseOrigin(
  origin: string,
  { allowInsecureLocalhost = false }: ClaimUrlPolicy,
): URL {
  let parsed: URL;

  try {
    parsed = new URL(origin);
  } catch {
    return domainError("INVALID_CLAIM_ORIGIN");
  }

  const secure = parsed.protocol === "https:";
  const explicitLocalDevelopment =
    allowInsecureLocalhost &&
    parsed.protocol === "http:" &&
    isLocalhost(parsed.hostname);

  if (
    (!secure && !explicitLocalDevelopment) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return domainError("INVALID_CLAIM_ORIGIN");
  }

  return parsed;
}

function assertAllowedOrigin(
  parsed: URL,
  policy: ClaimUrlPolicy,
): void {
  parseOrigin(parsed.origin, policy);

  if (!policy.allowedOrigins) {
    return;
  }

  const allowed = policy.allowedOrigins.map(
    (origin) => parseOrigin(origin, policy).origin,
  );

  if (!allowed.includes(parsed.origin)) {
    domainError("INVALID_CLAIM_ORIGIN");
  }
}

export function buildClaimUrl(
  origin: string,
  code: string,
  policy: ClaimUrlPolicy = {},
): string {
  const parsed = parseOrigin(origin, policy);
  assertAllowedOrigin(parsed, policy);
  parsed.pathname = "/redeem";
  parsed.hash = `code=${normalizeCode(code)}`;
  return parsed.toString();
}

function parseStrictFragment(fragment: string): string {
  const match = /^#code=([A-Z0-9]{8})$/.exec(fragment);

  if (!match?.[1]) {
    return domainError("INVALID_CLAIM_FRAGMENT");
  }

  const normalized = normalizeCode(match[1]);
  if (normalized !== match[1]) {
    return domainError("INVALID_CLAIM_FRAGMENT");
  }

  return normalized;
}

export function parseClaimFragment(
  input: string | URL,
  policy: ClaimUrlPolicy = {},
): string {
  if (typeof input === "string" && input.startsWith("#")) {
    return parseStrictFragment(input);
  }

  let parsed: URL;
  try {
    parsed = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch {
    return domainError("INVALID_CLAIM_FRAGMENT");
  }

  assertAllowedOrigin(parsed, policy);

  if (
    parsed.pathname !== "/redeem" ||
    parsed.search !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return domainError("INVALID_CLAIM_URL");
  }

  return parseStrictFragment(parsed.hash);
}
