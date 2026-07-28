import type { Metadata } from "next";

import { AuthPanel } from "@/components/auth-panel";
import { safeAuthNextPath } from "@/lib/auth/redirect";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to claim and use YGF Build Credits.",
};

function singleParameter(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : undefined;
  }
  return value;
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
    upgrade?: string | string[];
  }>;
}) {
  const parameters = await searchParams;
  const runtime = resolveAuthRuntime();
  const user = await getAuthenticatedUser();
  const error = singleParameter(parameters.error);
  const initialError =
    error === "callback"
      ? "We couldn’t complete sign-in. Please try again."
      : error === "anonymous"
        ? "Quick guest access is temporarily unavailable. Your secured claim is still waiting."
        : undefined;

  return (
    <section className="auth-page">
      <AuthPanel
        initialError={initialError}
        isAnonymous={runtime.mode === "supabase" && user?.isAnonymous === true}
        mode={runtime.mode}
        nextPath={safeAuthNextPath(parameters.next)}
      />
    </section>
  );
}
