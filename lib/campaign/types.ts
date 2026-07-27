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
  | "EVENT_METADATA_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_INVALID"
  | "INSUFFICIENT_CREDITS"
  | "INVALID_CLAIM_FRAGMENT"
  | "INVALID_CLAIM_ORIGIN"
  | "INVALID_CLAIM_URL"
  | "INVALID_CODE"
  | "INVALID_CREDIT_AMOUNT"
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
  name: string;
  source?: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
  createdAt: string;
}
