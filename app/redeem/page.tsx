import type { Metadata } from "next";
import { cookies } from "next/headers";

import { RedeemPageContent } from "@/components/redeem-form";
import {
  PENDING_CLAIM_COOKIE,
  readPendingClaim,
} from "@/lib/auth/pending-claim";
import { serverSecret } from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unlock 3,000 AI Credits",
  description:
    "Scan the private QR on a YGF AI card or enter its eight-character code.",
};

export default async function RedeemPage() {
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

  return <RedeemPageContent pendingClaimReady={pendingClaimReady} />;
}
