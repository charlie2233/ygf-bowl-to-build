import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createAuthServerClient } from "@/lib/auth/server";

export interface AuthenticatedCampaignUser {
  email?: string;
  id: string;
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
    };
  }

  const client = await createAuthServerClient();
  const { data, error } = await client.auth.getClaims();
  const subject = data?.claims?.sub;

  if (error && !isUnauthenticatedError(error)) {
    throw new Error("AUTHENTICATION_UNAVAILABLE");
  }
  if (typeof subject !== "string" || subject.length === 0) {
    return null;
  }

  return {
    email:
      typeof data?.claims?.email === "string"
        ? data.claims.email
        : undefined,
    id: subject,
  };
}
