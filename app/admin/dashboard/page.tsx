import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MetricSummary } from "@/components/admin/metric-summary";
import { computeMetrics } from "@/lib/analytics/metrics";
import { getCampaignAdminAuthorization } from "@/lib/auth/admin";
import { getAdminCodeGateway } from "@/lib/repositories/supabase-admin-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Campaign dashboard",
};

function wholeNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function AdminDashboardPage() {
  const authorization = await getCampaignAdminAuthorization();
  if (authorization.kind === "unauthenticated") {
    redirect("/auth");
  }
  if (authorization.kind === "forbidden") {
    notFound();
  }

  const dashboard = await getAdminCodeGateway().getAnalyticsData();
  const metrics = computeMetrics(dashboard.events, {
    providerCostMicroUsd: dashboard.providerCostMicroUsd,
    remainingCredits: dashboard.remainingCredits,
  });

  return (
    <section className="admin-page">
      <div className="container admin-page__inner">
        <nav aria-label="Campaign administration">
          <Link aria-current="page" href="/admin/dashboard">
            Dashboard
          </Link>
          <Link href="/admin/codes">Code operations</Link>
        </nav>
        <header className="admin-page__header">
          <div>
            <p className="admin-page__kicker">Campaign operations</p>
            <h1>Beta funnel</h1>
            <p>
              Distinct-user activation, campaign inventory, provider
              spend, and source attribution from privacy-safe events.
            </p>
          </div>
          <Link className="button button--primary button--small" href="/admin/codes">
            Manage codes
          </Link>
        </header>

        <MetricSummary
          activeWalletCount={dashboard.activeWalletCount}
          metrics={metrics}
        />

        <section className="admin-table-card">
          <h2>Inventory</h2>
          <table>
            <caption>
              Current campaign inventory totals
            </caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Batches</th>
                <td>{wholeNumber(dashboard.batchCount)}</td>
              </tr>
              <tr>
                <th scope="row">Stored code digests</th>
                <td>{wholeNumber(dashboard.codeCount)}</td>
              </tr>
              <tr>
                <th scope="row">Privacy-safe events</th>
                <td>{wholeNumber(dashboard.events.length)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="admin-table-card">
          <h2>Agent model usage</h2>
          <table>
            <caption>
              Successful Agent calls by server-allowlisted model
            </caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Successful calls</th>
              </tr>
            </thead>
            <tbody>
              {metrics.modelUsage.length > 0 ? (
                metrics.modelUsage.map((row) => (
                  <tr key={row.model}>
                    <th scope="row">{row.model}</th>
                    <td>{wholeNumber(row.calls)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>
                    No successful Agent calls yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="admin-table-card">
          <h2>Redemptions by source</h2>
          <table>
            <caption>
              Distinct successful redemptions attributed to each
              recorded source
            </caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Redeemed users</th>
              </tr>
            </thead>
            <tbody>
              {metrics.sourceAttribution.length > 0 ? (
                metrics.sourceAttribution.map((row) => (
                  <tr key={row.source}>
                    <th scope="row">{row.source}</th>
                    <td>{wholeNumber(row.redeemed)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>
                    No successful redemption source events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}
