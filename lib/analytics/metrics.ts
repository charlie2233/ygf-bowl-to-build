import type {
  CampaignEventMetadata,
  CampaignEventName,
  CampaignEventSource,
} from "@/lib/campaign/types";

export interface MetricEvent {
  createdAt: string;
  id: string;
  metadata?: Readonly<CampaignEventMetadata>;
  name: CampaignEventName;
  source?: CampaignEventSource;
  userId?: string;
}

export interface MetricTotals {
  providerCostMicroUsd?: number;
  remainingCredits?: number;
}

export interface SourceAttribution {
  redeemed: number;
  source: CampaignEventSource | "unknown";
}

export interface CampaignMetrics {
  activated: number;
  connected: number;
  distributed: number;
  providerCostMicroUsd: number;
  providerCostUsd: number;
  redeemed: number;
  remainingCredits: number;
  returned: number;
  sourceAttribution: readonly SourceAttribution[];
  taskErrorRate: number;
}

function boundedTotal(value: number | undefined): number {
  if (
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return 0;
  }
  return value;
}

function addUser(
  users: Set<string>,
  event: MetricEvent,
  condition: boolean,
): void {
  if (
    condition &&
    typeof event.userId === "string" &&
    event.userId.length > 0
  ) {
    users.add(event.userId);
  }
}

export function computeMetrics(
  events: readonly MetricEvent[],
  totals: MetricTotals = {},
): CampaignMetrics {
  const redeemedUsers = new Set<string>();
  const activatedUsers = new Set<string>();
  const connectedUsers = new Set<string>();
  const successfulTasksByUser = new Map<string, number>();
  const firstRedemptionSource = new Map<
    string,
    CampaignEventSource | "unknown"
  >();
  let distributed = 0;
  let completedTasks = 0;
  let failedTasks = 0;

  for (const event of events) {
    if (
      event.name === "batch_distributed" &&
      Number.isSafeInteger(event.metadata?.count) &&
      Number(event.metadata?.count) >= 0
    ) {
      distributed += Number(event.metadata?.count);
    }

    const isSuccessfulRedemption =
      event.name === "code_redeemed" &&
      event.metadata?.outcome === "success";
    addUser(redeemedUsers, event, isSuccessfulRedemption);
    if (
      isSuccessfulRedemption &&
      event.userId &&
      !firstRedemptionSource.has(event.userId)
    ) {
      firstRedemptionSource.set(
        event.userId,
        event.source ?? "unknown",
      );
    }

    const isSuccessfulTask =
      event.name === "task_completed" &&
      event.metadata?.outcome === "success";
    addUser(activatedUsers, event, isSuccessfulTask);
    if (isSuccessfulTask && event.userId) {
      successfulTasksByUser.set(
        event.userId,
        (successfulTasksByUser.get(event.userId) ?? 0) + 1,
      );
    }

    addUser(
      connectedUsers,
      event,
      event.name === "partner_connected" &&
        event.metadata?.connectionState === "connected",
    );

    if (
      event.name === "task_failed" &&
      event.metadata?.outcome === "failure"
    ) {
      failedTasks += 1;
    } else if (event.name === "task_completed") {
      if (event.metadata?.outcome === "success") {
        completedTasks += 1;
      } else if (event.metadata?.outcome === "failure") {
        failedTasks += 1;
      }
    }
  }

  const sourceCounts = new Map<
    CampaignEventSource | "unknown",
    number
  >();
  for (const source of firstRedemptionSource.values()) {
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }

  const providerCostMicroUsd = boundedTotal(
    totals.providerCostMicroUsd,
  );
  const taskAttempts = completedTasks + failedTasks;
  const returned = [...successfulTasksByUser.values()].filter(
    (successfulTaskCount) => successfulTaskCount >= 2,
  ).length;

  return {
    activated: activatedUsers.size,
    connected: connectedUsers.size,
    distributed,
    providerCostMicroUsd,
    providerCostUsd: providerCostMicroUsd / 1_000_000,
    redeemed: redeemedUsers.size,
    remainingCredits: boundedTotal(totals.remainingCredits),
    returned,
    sourceAttribution: [...sourceCounts.entries()]
      .map(([source, redeemed]) => ({ redeemed, source }))
      .sort((left, right) => left.source.localeCompare(right.source)),
    taskErrorRate:
      taskAttempts === 0 ? 0 : failedTasks / taskAttempts,
  };
}
