import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { RedeemPageContent } from "@/components/redeem-form";
import {
  PENDING_CLAIM_COOKIE,
  readPendingClaim,
} from "@/lib/auth/pending-claim";
import { serverSecret } from "@/lib/auth/runtime";
import {
  resolveTurnstileConfiguration,
  turnstileClientConfiguration,
} from "@/lib/auth/turnstile";
import { getAuthenticatedUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unlock 3,000 AI Credits",
  description:
    "Scan the private QR on a YGF AI card or enter its eight-character code.",
  referrer: "no-referrer",
};

export default async function RedeemPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const query = await searchParams;
  const sensitiveQueryKeys = new Set([
    "claim",
    "code",
    "termsaccepted",
    "token",
  ]);
  if (
    Object.keys(query).some((key) =>
      sensitiveQueryKeys.has(key.toLowerCase()),
    )
  ) {
    redirect("/redeem");
  }

  const [cookieStore, user] = await Promise.all([
    cookies(),
    getAuthenticatedUser(),
  ]);
  const pendingClaimReady = Boolean(
    user &&
      readPendingClaim(
        cookieStore.get(PENDING_CLAIM_COOKIE)?.value,
        serverSecret("YGF_CLAIM_COOKIE_SECRET"),
      ),
  );
  const turnstile = turnstileClientConfiguration(
    resolveTurnstileConfiguration(),
  );

  return (
    <RedeemPageContent
      pendingClaimReady={pendingClaimReady}
      turnstileRequired={turnstile.required}
      turnstileSiteKey={turnstile.siteKey}
    />
  );
}
