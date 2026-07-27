import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createAuthServerClient } from "@/lib/auth/server";

export interface CampaignAdminUser {
  email?: string;
  id: string;
}

export type CampaignAdminAuthorization =
  | { kind: "authorized"; user: CampaignAdminUser }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" };

type Environment = Readonly<Record<string, string | undefined>>;

interface AdminClaimsInput {
  claims: unknown;
  environment?: Environment;
}

const EMAIL_PATTERN =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const DEMO_ADMIN_EMAIL = "demo@local.ygf";

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedEmail(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email)
    ? email
    : undefined;
}

export function parseAdminEmailAllowlist(
  environment: Environment = process.env,
): readonly string[] {
  const configured =
    environment.YGF_ADMIN_EMAIL_ALLOWLIST?.trim();
  if (!configured) {
    return [];
  }

  const entries = configured
    .split(",")
    .map((entry) => normalizedEmail(entry));
  if (
    entries.length > 100 ||
    entries.some((entry) => entry === undefined)
  ) {
    return [];
  }
  return [...new Set(entries as string[])];
}

export function authorizeCampaignAdminClaims({
  claims,
  environment = process.env,
}: AdminClaimsInput): CampaignAdminUser | null {
  const claimRecord = recordValue(claims);
  if (!claimRecord) {
    return null;
  }
  const subject = claimRecord.sub;
  if (
    typeof subject !== "string" ||
    subject.length === 0 ||
    subject.length > 128
  ) {
    return null;
  }

  const email = normalizedEmail(claimRecord.email);
  const appMetadata = recordValue(claimRecord.app_metadata);
  const hasAdminRole = appMetadata?.role === "admin";
  const isAllowlisted =
    email !== undefined &&
    parseAdminEmailAllowlist(environment).includes(email);

  if (!hasAdminRole && !isAllowlisted) {
    return null;
  }
  return {
    ...(email === undefined ? {} : { email }),
    id: subject,
  };
}

function isMissingSessionError(
  error: { name?: string; status?: number } | null,
): boolean {
  return (
    error === null ||
    error.name === "AuthSessionMissingError" ||
    error.status === 400 ||
    error.status === 401
  );
}

export async function getCampaignAdminAuthorization(
  environment: Environment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
): Promise<CampaignAdminAuthorization> {
  const runtime = resolveAuthRuntime(
    environment,
    nodeEnvironment,
  );
  if (runtime.mode === "demo") {
    return {
      kind: "authorized",
      user: {
        email: DEMO_ADMIN_EMAIL,
        id: "demo-user",
      },
    };
  }

  const client = await createAuthServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error) {
    if (isMissingSessionError(error)) {
      return { kind: "unauthenticated" };
    }
    throw new Error("ADMIN_AUTHENTICATION_UNAVAILABLE");
  }
  if (!data?.claims?.sub) {
    return { kind: "unauthenticated" };
  }

  const user = authorizeCampaignAdminClaims({
    claims: data.claims,
    environment,
  });
  return user
    ? { kind: "authorized", user }
    : { kind: "forbidden" };
}

export function isSameOriginMutation(
  request: Request,
  environment: Environment = process.env,
): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return false;
  }

  let expected: URL;
  let submitted: URL;
  try {
    expected = new URL(
      environment.YGF_PUBLIC_ORIGIN ?? request.url,
    );
    submitted = new URL(originHeader);
  } catch {
    return false;
  }

  return (
    submitted.origin === expected.origin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}

export const isSameOriginAdminMutation = isSameOriginMutation;
