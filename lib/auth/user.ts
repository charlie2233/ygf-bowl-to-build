import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createAuthServerClient } from "@/lib/auth/server";

export interface AuthenticatedCampaignUser {
  email?: string;
  id: string;
  isAnonymous: boolean;
}

function isUnauthenticatedError(
  error: { name?: string; status?: number } | null,
) {
  return (
    error === null ||
    error.name === "AuthSessionMissingError" ||
    error.status === 400 ||
    error.status === 401
  );
}

export async function getAuthenticatedUser(): Promise<AuthenticatedCampaignUser | null> {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "demo") {
    return {
      email: "demo@local.ygf",
      id: "demo-user",
      isAnonymous: false,
    };
  }

  const client = await createAuthServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error && !isUnauthenticatedError(error)) {
    throw new Error("AUTHENTICATION_UNAVAILABLE");
  }
  return authenticatedCampaignUserFromClaims(data?.claims);
}

export function authenticatedCampaignUserFromClaims(
  claims: unknown,
): AuthenticatedCampaignUser | null {
  if (
    typeof claims !== "object" ||
    claims === null ||
    Array.isArray(claims)
  ) {
    return null;
  }
  const record = claims as Record<string, unknown>;
  if (typeof record.sub !== "string" || record.sub.length === 0) {
    return null;
  }

  return {
    ...(typeof record.email === "string"
      ? { email: record.email }
      : {}),
    id: record.sub,
    isAnonymous: record.is_anonymous === true,
  };
}
