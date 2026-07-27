import type {
  CampaignEvent,
  CampaignEventMetadata,
  CampaignEventName,
  CampaignEventSource,
  CreditWallet,
  SpendReservation,
  TaskSession,
  TaskType,
} from "@/lib/campaign/types";

export interface ValidateCodeInput {
  code: string;
}

export interface ValidateCodeResult {
  eligible: boolean;
}

export interface RedeemCodeInput {
  code: string;
  /**
   * Authenticated account identity derived by the trusted server adapter.
   * Never populate this field from a browser-controlled request body.
   */
  userId: string;
  idempotencyKey: string;
}

export interface RedemptionResult {
  codeId: string;
  wallet: CreditWallet;
  redeemedAt: string;
}

export interface GetWalletInput {
  userId: string;
}

export interface ReserveSpendInput {
  userId: string;
  idempotencyKey: string;
  providerCostMicroUsd: number;
}

export interface CommitSpendInput {
  userId: string;
  reservationId: string;
  providerCostMicroUsd: number;
  idempotencyKey: string;
}

export interface RefundSpendInput {
  userId: string;
  reservationId: string;
  idempotencyKey: string;
}

export interface SpendResult {
  reservation: SpendReservation;
  wallet: CreditWallet;
}

export interface RecordSessionInput {
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
}

export interface ListHistoryInput {
  userId: string;
}

export interface RecordEventInput {
  userId?: string;
  name: CampaignEventName;
  source?: CampaignEventSource;
  metadata?: Readonly<CampaignEventMetadata>;
}

export interface DashboardSnapshot {
  batchCount: number;
  codeCount: number;
  redeemedCount: number;
  activeWalletCount: number;
  sessionCount: number;
  eventCount: number;
  remainingCredits: number;
  providerCostMicroUsd: number;
}

export interface CreateBatchInput {
  name: string;
  codeHashes: readonly string[];
  expiresAt?: string;
}

export interface PromoBatch {
  id: string;
  name: string;
  codeCount: number;
  expiresAt?: string;
  createdAt: string;
}

export type RevokeCodeInput =
  | { code: string; codeHash?: never }
  | { code?: never; codeHash: string };

export interface RevokedCode {
  codeId: string;
  state: "revoked";
  revokedAt: string;
}

export interface CampaignRepository {
  validateCode(input: ValidateCodeInput): Promise<ValidateCodeResult>;
  redeemCode(input: RedeemCodeInput): Promise<RedemptionResult>;
  getWallet(input: GetWalletInput): Promise<CreditWallet>;
  reserveSpend(input: ReserveSpendInput): Promise<SpendResult>;
  commitSpend(input: CommitSpendInput): Promise<SpendResult>;
  refundSpend(input: RefundSpendInput): Promise<SpendResult>;
  recordSession(input: RecordSessionInput): Promise<TaskSession>;
  listHistory(input: ListHistoryInput): Promise<readonly TaskSession[]>;
  recordEvent(input: RecordEventInput): Promise<CampaignEvent>;
  getDashboard(): Promise<DashboardSnapshot>;
  createBatch(input: CreateBatchInput): Promise<PromoBatch>;
  revokeCode(input: RevokeCodeInput): Promise<RevokedCode>;
}
