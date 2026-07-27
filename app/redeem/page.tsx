import { ArrowLeft, Clock3, Laptop } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { RedeemForm } from "@/components/redeem-form";
import {
  PENDING_CLAIM_COOKIE,
  readPendingClaim,
} from "@/lib/auth/pending-claim";
import { serverSecret } from "@/lib/auth/runtime";
import { getAuthenticatedUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim Build Credits",
  description:
    "Scan a receipt QR or enter an eight-character YGF claim code.",
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

  return (
    <section className="redeem-page">
      <div className="redeem-page__inner container">
        <Link className="redeem-page__back" href="/offer">
          <ArrowLeft aria-hidden="true" />
          Back to offer
        </Link>

        <div className="redeem-page__grid">
          <div className="redeem-card">
            <h1>Claim your Build Credits</h1>
            <p>
              Scan the receipt QR or enter the 8-character code. That’s it.
            </p>
            <RedeemForm pendingClaimReady={pendingClaimReady} />
          </div>

          <aside className="redeem-page__aside">
            <div
              aria-label="Illustrative qualifying YGF receipt"
              className="redeem-receipt"
              role="img"
            >
              <strong>YGF Malatang</strong>
              <span>Qualifying purchase</span>
              <dl>
                <div>
                  <dt>Total</dt>
                  <dd>$16+</dd>
                </div>
                <div>
                  <dt>Build code</dt>
                  <dd>A7K3B9Q2</dd>
                </div>
              </dl>
              <small>
                <Clock3 aria-hidden="true" />
                Example only — enter the code on your own receipt
              </small>
            </div>
            <div className="redeem-next">
              <Laptop aria-hidden="true" />
              <h2>What happens next</h2>
              <p>
                Sign in if needed, confirm the claim, and choose your first AI
                task.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
