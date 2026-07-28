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

function funnel(count: number, rate: number): string {
  return `${wholeNumber(count)} · ${percentage(rate)}`;
}

export function MetricSummary({
  activeWalletCount,
  metrics,
}: MetricSummaryProps) {
  const values = [
    ["Codes distributed", wholeNumber(metrics.distributed)],
    [
      "Redeemed · rate",
      funnel(metrics.redeemed, metrics.redemptionRate),
    ],
    [
      "First AI use · rate",
      funnel(metrics.activated, metrics.firstAiUseRate),
    ],
    ["Returned users", wholeNumber(metrics.returned)],
    [
      "7-day revisit / eligible · rate",
      `${wholeNumber(metrics.sevenDayReturned)} / ${wholeNumber(
        metrics.sevenDayEligible,
      )} · ${percentage(metrics.sevenDayReturnRate)}`,
    ],
    [
      "API key creators · rate",
      funnel(metrics.keyCreators, metrics.keyCreationRate),
    ],
    [
      "Agent first success · rate",
      funnel(metrics.agentActivated, metrics.agentActivationRate),
    ],
    [
      "Check-in creators · rate",
      funnel(metrics.shareCardCreators, metrics.shareCardRate),
    ],
    ["Active wallets", wholeNumber(activeWalletCount)],
    [
      "Build Credits remaining",
      wholeNumber(metrics.remainingCredits),
    ],
    [
      "Provider cost",
      providerDollars(metrics.providerCostMicroUsd),
    ],
    [
      "Average cost per redeemed card",
      providerDollars(
        metrics.averageProviderCostPerRedeemedCardMicroUsd,
      ),
    ],
    ["Task error rate", percentage(metrics.taskErrorRate)],
    ["Agent error rate", percentage(metrics.agentErrorRate)],
    ["Agent anomalies", wholeNumber(metrics.agentAnomalyCount)],
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
