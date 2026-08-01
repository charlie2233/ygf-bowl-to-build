import {
  CAMPAIGN_EVENT_NAMES,
  CAMPAIGN_EVENT_SOURCES,
  type CampaignConnectionState,
  type CampaignEventMetadata,
  type CampaignEventName,
  type CampaignEventOutcome,
  type CampaignEventSource,
  type CampaignLatencyBucket,
  type TaskType,
  domainError,
} from "@/lib/campaign/types";

const EVENT_NAMES = new Set<string>(CAMPAIGN_EVENT_NAMES);
const EVENT_SOURCES = new Set<string>(CAMPAIGN_EVENT_SOURCES);
const TASK_TYPES = new Set<TaskType>([
  "study",
  "coding",
  "career",
  "pick-my-bowl",
]);
const AGENT_MODELS = new Set<
  NonNullable<CampaignEventMetadata["model"]>
>([
  "balanced",
  "fast",
  "coding",
  "reasoning",
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
]);
const OUTCOMES = new Set<CampaignEventOutcome>([
  "success",
  "failure",
  "invalid",
  "expired",
  "revoked",
  "blocked",
  "throttled",
]);
const LATENCY_BUCKETS = new Set<CampaignLatencyBucket>([
  "under-30s",
  "30-60s",
  "60-90s",
  "over-90s",
]);
const CONNECTION_STATES = new Set<CampaignConnectionState>([
  "shown",
  "started",
  "connected",
  "failed",
]);
const ALLOWED_KEYS_BY_EVENT: Readonly<
  Record<CampaignEventName, ReadonlySet<keyof CampaignEventMetadata>>
> = {
  batch_distributed: new Set(["count"]),
  code_validated: new Set(["outcome"]),
  code_redeemed: new Set([
    "outcome",
    "credits",
    "isReturning",
  ]),
  task_started: new Set(["taskType", "isReturning"]),
  task_completed: new Set([
    "taskType",
    "outcome",
    "credits",
    "latencyBucket",
    "isReturning",
  ]),
  task_failed: new Set([
    "taskType",
    "outcome",
    "latencyBucket",
  ]),
  partner_cta_viewed: new Set(["connectionState"]),
  partner_connected: new Set(["connectionState"]),
  agent_key_created: new Set(["outcome"]),
  agent_call_completed: new Set(["outcome", "credits", "model"]),
  agent_call_failed: new Set(["outcome", "model"]),
  share_card_generated: new Set(["outcome", "taskType"]),
};
const SENSITIVE_KEY =
  /(code|claim|promo|prompt|input|ip|device|email|secret|token|address)/i;
const CLAIM_LIKE = /^[a-z0-9]{8}$/i;
const IPV4_LIKE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export interface UntrustedCampaignEventInput {
  name: unknown;
  source?: unknown;
  metadata?: unknown;
}

export interface ValidatedCampaignEventInput {
  name: CampaignEventName;
  source?: CampaignEventSource;
  metadata?: CampaignEventMetadata;
}

function unsafeString(value: string): boolean {
  return (
    value.length > 32 ||
    CLAIM_LIKE.test(value) ||
    IPV4_LIKE.test(value) ||
    value.includes(":")
  );
}

function validateInteger(
  value: unknown,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > maximum
  ) {
    return domainError("EVENT_INVALID");
  }
  return value as number;
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T {
  if (
    typeof value !== "string" ||
    unsafeString(value) ||
    !allowed.has(value as T)
  ) {
    return domainError("EVENT_INVALID");
  }
  return value as T;
}

export function validateCampaignEventInput(
  input: UntrustedCampaignEventInput,
): ValidatedCampaignEventInput {
  if (
    typeof input.name !== "string" ||
    !EVENT_NAMES.has(input.name)
  ) {
    return domainError("EVENT_INVALID");
  }
  const name = input.name as CampaignEventName;

  let source: CampaignEventSource | undefined;
  if (input.source !== undefined) {
    if (
      typeof input.source !== "string" ||
      unsafeString(input.source) ||
      !EVENT_SOURCES.has(input.source)
    ) {
      return domainError("EVENT_INVALID");
    }
    source = input.source as CampaignEventSource;
  }

  if (
    input.metadata === undefined ||
    (typeof input.metadata === "object" &&
      input.metadata !== null &&
      !Array.isArray(input.metadata) &&
      Object.keys(input.metadata).length === 0)
  ) {
    return { name, ...(source === undefined ? {} : { source }) };
  }
  if (
    typeof input.metadata !== "object" ||
    input.metadata === null ||
    Array.isArray(input.metadata)
  ) {
    return domainError("EVENT_INVALID");
  }

  const entries = Object.entries(input.metadata);
  if (entries.length > 7) {
    return domainError("EVENT_INVALID");
  }
  const allowedKeys = ALLOWED_KEYS_BY_EVENT[name];
  const metadata: CampaignEventMetadata = {};

  for (const [key, value] of entries) {
    if (
      SENSITIVE_KEY.test(key) ||
      !allowedKeys.has(key as keyof CampaignEventMetadata)
    ) {
      return domainError("EVENT_INVALID");
    }
    switch (key as keyof CampaignEventMetadata) {
      case "taskType":
        metadata.taskType = validateEnum(value, TASK_TYPES);
        break;
      case "model":
        metadata.model = validateEnum(value, AGENT_MODELS);
        break;
      case "outcome":
        metadata.outcome = validateEnum(value, OUTCOMES);
        break;
      case "count":
        metadata.count = validateInteger(value, 10_000);
        break;
      case "credits":
        metadata.credits = validateInteger(value, 3_000);
        break;
      case "latencyBucket":
        metadata.latencyBucket = validateEnum(
          value,
          LATENCY_BUCKETS,
        );
        break;
      case "connectionState":
        metadata.connectionState = validateEnum(
          value,
          CONNECTION_STATES,
        );
        break;
      case "isReturning":
        if (typeof value !== "boolean") {
          return domainError("EVENT_INVALID");
        }
        metadata.isReturning = value;
        break;
      default:
        return domainError("EVENT_INVALID");
    }
  }

  return {
    name,
    ...(source === undefined ? {} : { source }),
    metadata,
  };
}
