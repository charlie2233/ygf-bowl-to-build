import type { CampaignMetrics } from "@/lib/analytics/metrics";

interface MetricSummaryProps {
  activeWalletCount: number;
  metrics: CampaignMetrics;
}

function wholeNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function providerDollars(microUsd: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(microUsd / 1_000_000);
}

function percentage(rate: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(rate);
}

export function MetricSummary({
  activeWalletCount,
  metrics,
}: MetricSummaryProps) {
  const values = [
    ["Codes distributed", wholeNumber(metrics.distributed)],
    ["Distinct users redeemed", wholeNumber(metrics.redeemed)],
    ["First-task activated", wholeNumber(metrics.activated)],
    ["Returned users", wholeNumber(metrics.returned)],
    ["Partner connected", wholeNumber(metrics.connected)],
    ["Active wallets", wholeNumber(activeWalletCount)],
    [
      "Build Credits remaining",
      wholeNumber(metrics.remainingCredits),
    ],
    [
      "Provider cost",
      providerDollars(metrics.providerCostMicroUsd),
    ],
    ["Task error rate", percentage(metrics.taskErrorRate)],
  ] as const;

  return (
    <dl
      aria-label="Campaign metric summary"
      className="admin-metrics"
    >
      {values.map(([label, value]) => (
        <div className="admin-metric" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
