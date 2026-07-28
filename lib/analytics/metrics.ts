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

export interface ModelUsage {
  calls: number;
  model: NonNullable<CampaignEventMetadata["model"]>;
}

export interface CampaignMetrics {
  activated: number;
  agentActivated: number;
  agentActivationRate: number;
  agentAnomalyCount: number;
  agentErrorRate: number;
  averageProviderCostPerRedeemedCardMicroUsd: number;
  connected: number;
  distributed: number;
  firstAiUseRate: number;
  keyCreationRate: number;
  keyCreators: number;
  modelUsage: readonly ModelUsage[];
  providerCostMicroUsd: number;
  providerCostUsd: number;
  redeemed: number;
  redemptionRate: number;
  remainingCredits: number;
  returned: number;
  sevenDayReturnRate: number;
  sevenDayReturned: number;
  shareCardCreators: number;
  shareCardRate: number;
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

function rate(numerator: number, denominator: number) {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function eventTimestamp(event: MetricEvent): number | undefined {
  const timestamp = new Date(event.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function computeMetrics(
  events: readonly MetricEvent[],
  totals: MetricTotals = {},
): CampaignMetrics {
  const redeemedUsers = new Set<string>();
  const activatedUsers = new Set<string>();
  const agentActivatedUsers = new Set<string>();
  const keyCreators = new Set<string>();
  const shareCardCreators = new Set<string>();
  const connectedUsers = new Set<string>();
  const successfulTasksByUser = new Map<string, number>();
  const firstRedemptionAt = new Map<string, number>();
  const successfulActivityAt = new Map<string, number[]>();
  const firstRedemptionSource = new Map<
    string,
    CampaignEventSource | "unknown"
  >();
  let distributed = 0;
  let completedTasks = 0;
  let failedTasks = 0;
  let completedAgentCalls = 0;
  let failedAgentCalls = 0;
  let agentAnomalyCount = 0;
  const modelUsage = new Map<
    NonNullable<CampaignEventMetadata["model"]>,
    number
  >();

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
    if (isSuccessfulRedemption && event.userId) {
      const timestamp = eventTimestamp(event);
      const existing = firstRedemptionAt.get(event.userId);
      if (
        timestamp !== undefined &&
        (existing === undefined || timestamp < existing)
      ) {
        firstRedemptionAt.set(event.userId, timestamp);
      }
    }

    const isSuccessfulTask =
      event.name === "task_completed" &&
      event.metadata?.outcome === "success";
    const isSuccessfulAgentCall =
      event.name === "agent_call_completed" &&
      event.metadata?.outcome === "success";
    const isSuccessfulAiUse =
      isSuccessfulTask || isSuccessfulAgentCall;
    addUser(activatedUsers, event, isSuccessfulAiUse);
    addUser(agentActivatedUsers, event, isSuccessfulAgentCall);
    addUser(
      keyCreators,
      event,
      event.name === "agent_key_created" &&
        event.metadata?.outcome === "success",
    );
    addUser(
      shareCardCreators,
      event,
      event.name === "share_card_generated" &&
        event.metadata?.outcome === "success",
    );
    if (isSuccessfulAiUse && event.userId) {
      successfulTasksByUser.set(
        event.userId,
        (successfulTasksByUser.get(event.userId) ?? 0) + 1,
      );
      const timestamp = eventTimestamp(event);
      if (timestamp !== undefined) {
        const timestamps =
          successfulActivityAt.get(event.userId) ?? [];
        timestamps.push(timestamp);
        successfulActivityAt.set(event.userId, timestamps);
      }
    }
    if (isSuccessfulAgentCall) {
      completedAgentCalls += 1;
      if (event.metadata?.model) {
        modelUsage.set(
          event.metadata.model,
          (modelUsage.get(event.metadata.model) ?? 0) + 1,
        );
      }
    }
    if (event.name === "agent_call_failed") {
      failedAgentCalls += 1;
      if (
        event.metadata?.outcome === "blocked" ||
        event.metadata?.outcome === "throttled"
      ) {
        agentAnomalyCount += 1;
      }
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
  const agentAttempts = completedAgentCalls + failedAgentCalls;
  const returned = [...successfulTasksByUser.values()].filter(
    (successfulTaskCount) => successfulTaskCount >= 2,
  ).length;
  const sevenDayReturned = [...redeemedUsers].filter((userId) => {
    const redeemedAt = firstRedemptionAt.get(userId);
    if (redeemedAt === undefined) {
      return false;
    }
    const oneDayLater = redeemedAt + 24 * 60 * 60 * 1_000;
    const sevenDaysLater = redeemedAt + 7 * 24 * 60 * 60 * 1_000;
    return (successfulActivityAt.get(userId) ?? []).some(
      (timestamp) =>
        timestamp >= oneDayLater && timestamp <= sevenDaysLater,
    );
  }).length;

  return {
    activated: activatedUsers.size,
    agentActivated: agentActivatedUsers.size,
    agentActivationRate: rate(
      agentActivatedUsers.size,
      keyCreators.size,
    ),
    agentAnomalyCount,
    agentErrorRate: rate(failedAgentCalls, agentAttempts),
    averageProviderCostPerRedeemedCardMicroUsd: rate(
      providerCostMicroUsd,
      redeemedUsers.size,
    ),
    connected: connectedUsers.size,
    distributed,
    firstAiUseRate: rate(
      activatedUsers.size,
      redeemedUsers.size,
    ),
    keyCreationRate: rate(
      keyCreators.size,
      redeemedUsers.size,
    ),
    keyCreators: keyCreators.size,
    modelUsage: [...modelUsage.entries()]
      .map(([model, calls]) => ({ calls, model }))
      .sort((left, right) => left.model.localeCompare(right.model)),
    providerCostMicroUsd,
    providerCostUsd: providerCostMicroUsd / 1_000_000,
    redeemed: redeemedUsers.size,
    redemptionRate: rate(redeemedUsers.size, distributed),
    remainingCredits: boundedTotal(totals.remainingCredits),
    returned,
    sevenDayReturnRate: rate(
      sevenDayReturned,
      redeemedUsers.size,
    ),
    sevenDayReturned,
    shareCardCreators: shareCardCreators.size,
    shareCardRate: rate(
      shareCardCreators.size,
      redeemedUsers.size,
    ),
    sourceAttribution: [...sourceCounts.entries()]
      .map(([source, redeemed]) => ({ redeemed, source }))
      .sort((left, right) => left.source.localeCompare(right.source)),
    taskErrorRate:
      taskAttempts === 0 ? 0 : failedTasks / taskAttempts,
  };
}
