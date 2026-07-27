import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CodeBatchForm } from "@/components/admin/code-batch-form";
import { getCampaignAdminAuthorization } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Code operations",
};

export default async function AdminCodesPage() {
  const authorization = await getCampaignAdminAuthorization();
  if (authorization.kind === "unauthenticated") {
    redirect("/auth");
  }
  if (authorization.kind === "forbidden") {
    notFound();
  }

  return (
    <section className="admin-page">
      <div className="container admin-page__inner">
        <nav aria-label="Campaign administration">
          <Link href="/admin/dashboard">Dashboard</Link>
          <Link aria-current="page" href="/admin/codes">
            Code operations
          </Link>
        </nav>
        <header className="admin-page__header">
          <div>
            <p className="admin-page__kicker">Campaign operations</p>
            <h1>Private code batches</h1>
            <p>
              Generate claim inventory, download plaintext once, and
              revoke by non-secret row reference without exposing a
              claim in logs or browser history.
            </p>
          </div>
          <p className="admin-page__operator">
            Signed in as{" "}
            {authorization.user.email ?? "campaign administrator"}
          </p>
        </header>
        <aside className="admin-notice" aria-label="Private file notice">
          <strong>Private means private.</strong> If this checkout holds
          the downloaded CSV, place it under <code>private/</code>;
          that path is ignored by Git. Do not upload the file to
          GitHub, shared chat, analytics, or a support ticket.
        </aside>
        <CodeBatchForm />
      </div>
    </section>
  );
}
