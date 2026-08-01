export type CampaignErrorCode =
  | "ABUSE_SIGNAL_INPUT_INVALID"
  | "ABUSE_SIGNAL_PURPOSE_INVALID"
  | "ABUSE_SIGNAL_SECRET_INVALID"
  | "ACCOUNT_ALREADY_REDEEMED"
  | "BATCH_INVALID"
  | "CODE_ALREADY_REDEEMED"
  | "CODE_EXPIRED"
  | "CODE_NOT_FOUND"
  | "CODE_REVOKED"
  | "CREDIT_BALANCE_INVALID"
  | "DUPLICATE_CODE"
  | "EVENT_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_INVALID"
  | "INSUFFICIENT_CREDITS"
  | "INVALID_CLAIM_FRAGMENT"
  | "INVALID_CLAIM_ORIGIN"
  | "INVALID_CLAIM_URL"
  | "INVALID_CODE"
  | "INVALID_CREDIT_AMOUNT"
  | "PARTNER_REWARD_EXPIRED"
  | "PARTNER_REWARD_NOT_FOUND"
  | "PARTNER_REWARD_REVOKED"
  | "PROVIDER_COST_INVALID"
  | "PROVIDER_COST_LIMIT_EXCEEDED"
  | "SESSION_INVALID"
  | "SPEND_NOT_FOUND"
  | "SPEND_STATE_INVALID"
  | "USER_INVALID"
  | "WALLET_EXPIRED"
  | "WALLET_NOT_FOUND";

export class CampaignDomainError extends Error {
  readonly code: CampaignErrorCode;

  constructor(code: CampaignErrorCode) {
    super(code);
    this.name = "CampaignDomainError";
    this.code = code;
  }
}

export function domainError(code: CampaignErrorCode): never {
  throw new CampaignDomainError(code);
}

export type CodeState =
  | "eligible"
  | "redeemed"
  | "expired"
  | "revoked";

export type SpendState = "reserved" | "committed" | "refunded";

export type TaskType = "study" | "coding" | "career" | "pick-my-bowl";

export const CAMPAIGN_EVENT_NAMES = [
  "batch_distributed",
  "code_validated",
  "code_redeemed",
  "task_started",
  "task_completed",
  "task_failed",
  "partner_cta_viewed",
  "partner_connected",
  "agent_key_created",
  "agent_call_completed",
  "agent_call_failed",
  "share_card_generated",
] as const;

export type CampaignEventName =
  (typeof CAMPAIGN_EVENT_NAMES)[number];

export const CAMPAIGN_EVENT_SOURCES = [
  "direct",
  "landing",
  "offer",
  "receipt-qr",
  "counter-card",
  "poster",
  "creator",
  "wallet",
  "task",
  "agent",
  "share",
  "admin",
  "staff",
] as const;

export type CampaignEventSource =
  (typeof CAMPAIGN_EVENT_SOURCES)[number];

export type CampaignEventOutcome =
  | "success"
  | "failure"
  | "invalid"
  | "expired"
  | "revoked"
  | "blocked"
  | "throttled";

export type CampaignLatencyBucket =
  | "under-30s"
  | "30-60s"
  | "60-90s"
  | "over-90s";

export type CampaignConnectionState =
  | "shown"
  | "started"
  | "connected"
  | "failed";

export interface CampaignEventMetadata {
  taskType?: TaskType;
  model?:
    | "balanced"
    | "fast"
    | "coding"
    | "reasoning"
    | "gpt-5.6-luna"
    | "gpt-5.6-terra"
    | "gpt-5.6-sol";
  outcome?: CampaignEventOutcome;
  count?: number;
  credits?: number;
  latencyBucket?: CampaignLatencyBucket;
  connectionState?: CampaignConnectionState;
  isReturning?: boolean;
}

export interface CreditWallet {
  id: string;
  userId: string;
  initialBalance: number;
  remainingBalance: number;
  reservedBalance: number;
  providerCommittedMicroUsd: number;
  providerReservedMicroUsd: number;
  createdAt: string;
  expiresAt: string;
}

export interface SpendReservation {
  id: string;
  walletId: string;
  userId: string;
  idempotencyKey: string;
  credits: number;
  providerReservedMicroUsd: number;
  providerCommittedMicroUsd: number;
  state: SpendState;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSession {
  id: string;
  userId: string;
  reservationId: string;
  taskType: TaskType;
  title: string;
  model: string;
  inputUnits: number;
  outputUnits: number;
  providerCostMicroUsd: number;
  status: "completed" | "failed";
  savedOutput?: string;
  createdAt: string;
}

export interface CampaignEvent {
  id: string;
  userId?: string;
  name: CampaignEventName;
  source?: CampaignEventSource;
  metadata?: Readonly<CampaignEventMetadata>;
  createdAt: string;
}
