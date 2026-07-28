import type { Metadata } from "next";

import { AuthPanel } from "@/components/auth-panel";
import { safeAuthNextPath } from "@/lib/auth/redirect";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";
import type { AuthMessageKey } from "@/lib/i18n/customer-pages";

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
  const initialMessageKey: AuthMessageKey | undefined =
    error === "callback"
      ? "callbackError"
      : error === "anonymous"
        ? "anonymousError"
        : undefined;

  return (
    <section className="auth-page">
      <AuthPanel
        initialMessageKey={initialMessageKey}
        isAnonymous={runtime.mode === "supabase" && user?.isAnonymous === true}
        mode={runtime.mode}
        nextPath={safeAuthNextPath(parameters.next)}
      />
    </section>
  );
}
