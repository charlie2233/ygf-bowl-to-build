import { hashCode } from "@/lib/campaign/code";
import {
  BUILD_CREDIT_GRANT,
  PROVIDER_COST_CAP_MICRO_USD,
  TASK_CREDIT_COST,
  createCreditWallet,
  refundCredits,
  reserveCredits,
  reserveProviderCost,
} from "@/lib/campaign/credits";
import { validateCampaignEventInput } from "@/lib/campaign/events";
import {
  type CampaignEvent,
  type CodeState,
  type CreditWallet,
  type SpendReservation,
  type TaskSession,
  domainError,
} from "@/lib/campaign/types";
import type {
  CampaignRepository,
  CommitSpendInput,
  CreateBatchInput,
  DashboardSnapshot,
  GetPartnerRewardInput,
  GetWalletInput,
  ListHistoryInput,
  PromoBatch,
  RecordEventInput,
  RecordSessionInput,
  RedeemCodeInput,
  RedemptionResult,
  RevealPartnerRewardInput,
  RefundSpendInput,
  ReserveSpendInput,
  RevokedCode,
  RevokeCodeInput,
  SettleFailedSpendInput,
  SpendResult,
  ValidateCodeInput,
  ValidateCodeResult,
} from "@/lib/repositories/campaign-repository";
import { isPartnerRewardSecretEnvelope } from "@/lib/rewards/secret";
import type {
  PartnerRewardReveal,
  PartnerRewardSecretEnvelope,
  PartnerRewardState,
  PartnerRewardSummary,
} from "@/lib/rewards/types";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DEMO_CODE_HASH =
  "98fad4549c16908f2b2ed175655e5e17982a0331665fe45fef8885e3d39bbbbb";
const DEMO_CLAUDE_CODE_HASH =
  "c8404c77a1a90d62a01ba3f673837f04d432936b98b9d67e50865e3ed069b885";

interface StoredCode {
  id: string;
  batchId: string;
  codeHash: string;
  state: CodeState;
  expiresAt?: string;
  redeemedBy?: string;
  redeemedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

interface StoredPartnerReward {
  codeId: string;
  expiresAt: string;
  id: string;
  kind: "claude-pro-gift";
  revealedAt?: string;
  revealedBy?: string;
  secret: PartnerRewardSecretEnvelope;
  state: PartnerRewardState;
}

type StoredBatch = PromoBatch;

interface IdempotentResult<T> {
  fingerprint: string;
  result: T;
}

export interface MemoryCampaignRepositoryOptions {
  demoPartnerReward?: {
    expiresAt: string;
    secret: PartnerRewardSecretEnvelope;
  };
  demoMode?: boolean;
  now?: () => Date;
}

export interface AssignMemoryPartnerRewardInput {
  codeHash: string;
  expiresAt: string;
  secret: PartnerRewardSecretEnvelope;
}

/**
 * Narrow demo-admin seam used only by RepositoryAdminCodeGateway. It accepts a
 * stored code hash, never a bearer link, and returns metadata only.
 */
export interface RevokeMemoryPartnerRewardInput {
  codeHash: string;
}

export interface MemoryAgentReserveInput {
  creditCeiling: number;
  providerCostCeilingMicroUsd: number;
  userId: string;
}

export interface MemoryAgentTerminalInput
  extends MemoryAgentReserveInput {
  creditsCharged: number;
  providerCostMicroUsd: number;
}

function cloneWallet(wallet: CreditWallet): CreditWallet {
  return { ...wallet };
}

function cloneReservation(
  reservation: SpendReservation,
): SpendReservation {
  return { ...reservation };
}

function cloneSpendResult(result: SpendResult): SpendResult {
  return {
    reservation: cloneReservation(result.reservation),
    wallet: cloneWallet(result.wallet),
  };
}

function cloneRedemption(result: RedemptionResult): RedemptionResult {
  return {
    ...result,
    wallet: cloneWallet(result.wallet),
  };
}

function cloneSession(session: TaskSession): TaskSession {
  return { ...session };
}

function cloneReward(
  reward: StoredPartnerReward,
): PartnerRewardSummary {
  return {
    expiresAt: reward.expiresAt,
    id: reward.id,
    kind: reward.kind,
    ...(reward.revealedAt === undefined
      ? {}
      : { revealedAt: reward.revealedAt }),
    state: reward.state,
  };
}

function validIdentifier(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function validateUserId(userId: string): void {
  if (!validIdentifier(userId)) {
    domainError("USER_INVALID");
  }
}

function validateIdempotencyKey(idempotencyKey: string): void {
  if (!validIdentifier(idempotencyKey)) {
    domainError("IDEMPOTENCY_INVALID");
  }
}

function validateProviderCost(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    domainError("PROVIDER_COST_INVALID");
  }
}

export class MemoryCampaignRepository implements CampaignRepository {
  readonly #now: () => Date;
  readonly #batches = new Map<string, StoredBatch>();
  readonly #codes = new Map<string, StoredCode>();
  readonly #partnerRewards = new Map<string, StoredPartnerReward>();
  readonly #wallets = new Map<string, CreditWallet>();
  readonly #reservations = new Map<string, SpendReservation>();
  readonly #redemptions = new Map<
    string,
    IdempotentResult<RedemptionResult>
  >();
  readonly #reserveResults = new Map<
    string,
    IdempotentResult<SpendResult>
  >();
  readonly #commitResults = new Map<
    string,
    IdempotentResult<SpendResult>
  >();
  readonly #refundResults = new Map<
    string,
    IdempotentResult<SpendResult>
  >();
  readonly #failedSpendResults = new Map<
    string,
    IdempotentResult<SpendResult>
  >();
  readonly #sessions: TaskSession[] = [];
  readonly #sessionByReservation = new Map<string, TaskSession>();
  readonly #events: CampaignEvent[] = [];
  #sequence = 0;

  constructor({
    demoPartnerReward,
    demoMode = false,
    now = () => new Date(),
  }: MemoryCampaignRepositoryOptions = {}) {
    this.#now = now;

    if (demoMode) {
      const createdAt = this.currentTime().toISOString();
      this.#batches.set("batch-demo", {
        id: "batch-demo",
        name: "Development demo",
        codeCount: demoPartnerReward ? 2 : 1,
        createdAt,
      });
      this.#codes.set(DEMO_CODE_HASH, {
        id: "code-demo",
        batchId: "batch-demo",
        codeHash: DEMO_CODE_HASH,
        state: "eligible",
        createdAt,
      });
      if (demoPartnerReward) {
        const expiresAt = new Date(demoPartnerReward.expiresAt);
        if (
          !Number.isFinite(expiresAt.getTime()) ||
          expiresAt.getTime() <= this.currentTime().getTime() ||
          !isPartnerRewardSecretEnvelope(
            demoPartnerReward.secret,
          )
        ) {
          domainError("BATCH_INVALID");
        }
        const codeId = "code-demo-claude";
        this.#codes.set(DEMO_CLAUDE_CODE_HASH, {
          id: codeId,
          batchId: "batch-demo",
          codeHash: DEMO_CLAUDE_CODE_HASH,
          state: "eligible",
          createdAt,
        });
        this.#partnerRewards.set(codeId, {
          codeId,
          expiresAt: expiresAt.toISOString(),
          id: "reward-demo-claude",
          kind: "claude-pro-gift",
          secret: { ...demoPartnerReward.secret },
          state: "assigned",
        });
      }
    }
  }

  private currentTime(): Date {
    const current = this.#now();
    if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
      domainError("BATCH_INVALID");
    }
    return new Date(current);
  }

  private nextId(prefix: string): string {
    this.#sequence += 1;
    return `${prefix}-${this.#sequence}`;
  }

  private codeState(code: StoredCode, now: Date): CodeState {
    if (
      code.state === "eligible" &&
      code.expiresAt &&
      new Date(code.expiresAt).getTime() <= now.getTime()
    ) {
      code.state = "expired";
    }
    return code.state;
  }

  private requireWallet(userId: string): CreditWallet {
    const wallet = this.#wallets.get(userId);
    if (!wallet) {
      return domainError("WALLET_NOT_FOUND");
    }
    return wallet;
  }

  private requireReservation(
    userId: string,
    reservationId: string,
  ): SpendReservation {
    const reservation = this.#reservations.get(reservationId);
    if (!reservation || reservation.userId !== userId) {
      return domainError("SPEND_NOT_FOUND");
    }
    return reservation;
  }

  async validateCode({
    code,
    userId,
  }: ValidateCodeInput): Promise<ValidateCodeResult> {
    const codeHash = await hashCode(code);
    const stored = this.#codes.get(codeHash);
    const state =
      stored === undefined
        ? undefined
        : this.codeState(stored, this.currentTime());
    const eligible =
      stored !== undefined &&
      (state === "eligible" ||
        (state === "redeemed" &&
          typeof userId === "string" &&
          stored.redeemedBy === userId));

    return { eligible };
  }

  async redeemCode(input: RedeemCodeInput): Promise<RedemptionResult> {
    validateUserId(input.userId);
    validateIdempotencyKey(input.idempotencyKey);
    const codeHash = await hashCode(input.code);
    const idempotencyMapKey = `${input.userId}:${input.idempotencyKey}`;
    const fingerprint = `${input.userId}:${codeHash}`;
    const prior = this.#redemptions.get(idempotencyMapKey);

    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return domainError("IDEMPOTENCY_CONFLICT");
      }
      const currentWallet = this.#wallets.get(input.userId);
      if (!currentWallet) {
        return domainError("WALLET_NOT_FOUND");
      }
      return {
        ...cloneRedemption(prior.result),
        wallet: cloneWallet(currentWallet),
      };
    }

    const stored = this.#codes.get(codeHash);
    if (!stored) {
      return domainError("CODE_NOT_FOUND");
    }

    const now = this.currentTime();
    const state = this.codeState(stored, now);
    if (state === "redeemed") {
      if (stored.redeemedBy === input.userId && stored.redeemedAt) {
        const currentWallet = this.#wallets.get(input.userId);
        if (!currentWallet) {
          return domainError("WALLET_NOT_FOUND");
        }
        const result: RedemptionResult = {
          codeId: stored.id,
          redeemedAt: stored.redeemedAt,
          wallet: cloneWallet(currentWallet),
        };
        this.#redemptions.set(idempotencyMapKey, {
          fingerprint,
          result: cloneRedemption(result),
        });
        return result;
      }
      return domainError("CODE_ALREADY_REDEEMED");
    }
    if (state === "expired") {
      return domainError("CODE_EXPIRED");
    }
    if (state === "revoked") {
      return domainError("CODE_REVOKED");
    }
    if (this.#wallets.has(input.userId)) {
      return domainError("ACCOUNT_ALREADY_REDEEMED");
    }

    const seed = createCreditWallet(now);
    const wallet: CreditWallet = {
      id: this.nextId("wallet"),
      userId: input.userId,
      initialBalance: seed.initial,
      remainingBalance: seed.remaining,
      reservedBalance: 0,
      providerCommittedMicroUsd: 0,
      providerReservedMicroUsd: 0,
      createdAt: seed.createdAt,
      expiresAt: seed.expiresAt,
    };
    stored.state = "redeemed";
    stored.redeemedBy = input.userId;
    stored.redeemedAt = seed.createdAt;
    this.#wallets.set(input.userId, wallet);

    const result: RedemptionResult = {
      codeId: stored.id,
      wallet: cloneWallet(wallet),
      redeemedAt: seed.createdAt,
    };
    this.#redemptions.set(idempotencyMapKey, {
      fingerprint,
      result: cloneRedemption(result),
    });
    return result;
  }

  async getWallet({ userId }: GetWalletInput): Promise<CreditWallet> {
    validateUserId(userId);
    return cloneWallet(this.requireWallet(userId));
  }

  private rewardState(
    reward: StoredPartnerReward,
    now: Date,
  ): PartnerRewardState {
    if (
      (reward.state === "assigned" ||
        reward.state === "revealed") &&
      new Date(reward.expiresAt).getTime() <= now.getTime()
    ) {
      reward.state = "expired";
    }
    return reward.state;
  }

  async assignPartnerReward(
    input: AssignMemoryPartnerRewardInput,
  ): Promise<PartnerRewardSummary> {
    const codeHash = input.codeHash.toLowerCase();
    const code = this.#codes.get(codeHash);
    const expiresAt = new Date(input.expiresAt);
    if (
      !HASH_PATTERN.test(codeHash) ||
      !code ||
      this.codeState(code, this.currentTime()) !== "eligible" ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= this.currentTime().getTime() ||
      !isPartnerRewardSecretEnvelope(input.secret)
    ) {
      throw new Error("PARTNER_REWARD_NOT_ASSIGNABLE");
    }
    if (
      this.#partnerRewards.has(code.id) ||
      [...this.#partnerRewards.values()].some(
        (reward) =>
          reward.secret.digest === input.secret.digest,
      )
    ) {
      throw new Error("PARTNER_REWARD_ALREADY_ASSIGNED");
    }

    const reward: StoredPartnerReward = {
      codeId: code.id,
      expiresAt: expiresAt.toISOString(),
      id: this.nextId("reward"),
      kind: "claude-pro-gift",
      secret: { ...input.secret },
      state: "assigned",
    };
    this.#partnerRewards.set(code.id, reward);
    return cloneReward(reward);
  }

  async revokePartnerRewardByCodeHash({
    codeHash: untrustedCodeHash,
  }: RevokeMemoryPartnerRewardInput): Promise<PartnerRewardSummary> {
    const codeHash = untrustedCodeHash.toLowerCase();
    if (!HASH_PATTERN.test(codeHash)) {
      throw new Error("PARTNER_REWARD_NOT_FOUND");
    }
    const code = this.#codes.get(codeHash);
    const reward = code
      ? this.#partnerRewards.get(code.id)
      : undefined;
    if (!reward) {
      throw new Error("PARTNER_REWARD_NOT_FOUND");
    }

    const state = this.rewardState(reward, this.currentTime());
    if (state === "assigned" || state === "revealed") {
      reward.state = "revoked";
    }
    return cloneReward(reward);
  }

  async getPartnerReward({
    userId,
  }: GetPartnerRewardInput): Promise<PartnerRewardSummary | null> {
    validateUserId(userId);
    const code = [...this.#codes.values()].find(
      (candidate) =>
        candidate.state === "redeemed" &&
        candidate.redeemedBy === userId,
    );
    if (!code) {
      return null;
    }
    const reward = this.#partnerRewards.get(code.id);
    if (!reward) {
      return null;
    }
    this.rewardState(reward, this.currentTime());
    return cloneReward(reward);
  }

  async revealPartnerReward({
    userId,
  }: RevealPartnerRewardInput): Promise<PartnerRewardReveal> {
    validateUserId(userId);
    const code = [...this.#codes.values()].find(
      (candidate) =>
        candidate.state === "redeemed" &&
        candidate.redeemedBy === userId,
    );
    const reward =
      code === undefined
        ? undefined
        : this.#partnerRewards.get(code.id);
    if (!reward) {
      return domainError("PARTNER_REWARD_NOT_FOUND");
    }

    const state = this.rewardState(reward, this.currentTime());
    if (state === "expired") {
      return domainError("PARTNER_REWARD_EXPIRED");
    }
    if (state === "revoked") {
      return domainError("PARTNER_REWARD_REVOKED");
    }
    if (
      reward.revealedBy !== undefined &&
      reward.revealedBy !== userId
    ) {
      return domainError("PARTNER_REWARD_NOT_FOUND");
    }
    if (state === "assigned") {
      reward.state = "revealed";
      reward.revealedAt = this.currentTime().toISOString();
      reward.revealedBy = userId;
    }

    return {
      reward: cloneReward(reward),
      secret: { ...reward.secret },
    };
  }

  /**
   * Demo-only variable-cost accounting for the Agent gateway. Production uses
   * the wallet-first Postgres RPCs in the Agent repository.
   */
  async reserveAgentUsage(
    input: MemoryAgentReserveInput,
  ): Promise<CreditWallet> {
    validateUserId(input.userId);
    validateProviderCost(input.providerCostCeilingMicroUsd);
    if (
      !Number.isSafeInteger(input.creditCeiling) ||
      input.creditCeiling < 1 ||
      input.creditCeiling > BUILD_CREDIT_GRANT
    ) {
      domainError("INVALID_CREDIT_AMOUNT");
    }

    const wallet = this.requireWallet(input.userId);
    if (
      new Date(wallet.expiresAt).getTime() <=
      this.currentTime().getTime()
    ) {
      domainError("WALLET_EXPIRED");
    }
    if (wallet.remainingBalance < input.creditCeiling) {
      domainError("INSUFFICIENT_CREDITS");
    }
    const totalProviderCost =
      wallet.providerCommittedMicroUsd +
      wallet.providerReservedMicroUsd +
      input.providerCostCeilingMicroUsd;
    if (
      !Number.isSafeInteger(totalProviderCost) ||
      totalProviderCost > PROVIDER_COST_CAP_MICRO_USD
    ) {
      domainError("PROVIDER_COST_LIMIT_EXCEEDED");
    }

    wallet.remainingBalance -= input.creditCeiling;
    wallet.reservedBalance += input.creditCeiling;
    wallet.providerReservedMicroUsd +=
      input.providerCostCeilingMicroUsd;
    return cloneWallet(wallet);
  }

  async terminalizeAgentUsage(
    input: MemoryAgentTerminalInput,
  ): Promise<CreditWallet> {
    validateUserId(input.userId);
    validateProviderCost(input.providerCostCeilingMicroUsd);
    validateProviderCost(input.providerCostMicroUsd);
    if (
      !Number.isSafeInteger(input.creditCeiling) ||
      input.creditCeiling < 1 ||
      input.creditCeiling > BUILD_CREDIT_GRANT ||
      !Number.isSafeInteger(input.creditsCharged) ||
      input.creditsCharged < 0 ||
      input.creditsCharged > input.creditCeiling ||
      input.providerCostMicroUsd >
        input.providerCostCeilingMicroUsd
    ) {
      domainError("INVALID_CREDIT_AMOUNT");
    }

    const wallet = this.requireWallet(input.userId);
    if (
      wallet.reservedBalance < input.creditCeiling ||
      wallet.providerReservedMicroUsd <
        input.providerCostCeilingMicroUsd
    ) {
      domainError("SPEND_STATE_INVALID");
    }
    const committedProviderCost =
      wallet.providerCommittedMicroUsd +
      input.providerCostMicroUsd;
    if (
      !Number.isSafeInteger(committedProviderCost) ||
      committedProviderCost > PROVIDER_COST_CAP_MICRO_USD
    ) {
      domainError("PROVIDER_COST_LIMIT_EXCEEDED");
    }

    wallet.remainingBalance +=
      input.creditCeiling - input.creditsCharged;
    wallet.reservedBalance -= input.creditCeiling;
    wallet.providerReservedMicroUsd -=
      input.providerCostCeilingMicroUsd;
    wallet.providerCommittedMicroUsd =
      committedProviderCost;
    return cloneWallet(wallet);
  }

  async reserveSpend(input: ReserveSpendInput): Promise<SpendResult> {
    validateUserId(input.userId);
    validateIdempotencyKey(input.idempotencyKey);
    validateProviderCost(input.providerCostMicroUsd);

    const idempotencyMapKey = `${input.userId}:${input.idempotencyKey}`;
    const fingerprint = `${input.userId}:${input.providerCostMicroUsd}`;
    const prior = this.#reserveResults.get(idempotencyMapKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return domainError("IDEMPOTENCY_CONFLICT");
      }
      return cloneSpendResult(prior.result);
    }

    const wallet = this.requireWallet(input.userId);
    const creditResult = reserveCredits({
      remaining: wallet.remainingBalance,
      amount: TASK_CREDIT_COST,
      expiresAt: wallet.expiresAt,
      now: this.currentTime(),
    });
    const providerResult = reserveProviderCost({
      committedMicroUsd: wallet.providerCommittedMicroUsd,
      reservedMicroUsd: wallet.providerReservedMicroUsd,
      amountMicroUsd: input.providerCostMicroUsd,
    });
    const createdAt = this.currentTime().toISOString();
    const reservation: SpendReservation = {
      id: this.nextId("spend"),
      walletId: wallet.id,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      credits: creditResult.reserved,
      providerReservedMicroUsd: input.providerCostMicroUsd,
      providerCommittedMicroUsd: 0,
      state: "reserved",
      createdAt,
      updatedAt: createdAt,
    };

    wallet.remainingBalance = creditResult.remaining;
    wallet.reservedBalance += creditResult.reserved;
    wallet.providerReservedMicroUsd =
      providerResult.reservedMicroUsd;
    this.#reservations.set(reservation.id, reservation);

    const result = {
      reservation: cloneReservation(reservation),
      wallet: cloneWallet(wallet),
    };
    this.#reserveResults.set(idempotencyMapKey, {
      fingerprint,
      result: cloneSpendResult(result),
    });
    return result;
  }

  async commitSpend(input: CommitSpendInput): Promise<SpendResult> {
    validateUserId(input.userId);
    validateIdempotencyKey(input.idempotencyKey);
    validateProviderCost(input.providerCostMicroUsd);
    const idempotencyMapKey = `${input.userId}:${input.idempotencyKey}`;
    const fingerprint =
      `${input.reservationId}:${input.providerCostMicroUsd}`;
    const prior = this.#commitResults.get(idempotencyMapKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return domainError("IDEMPOTENCY_CONFLICT");
      }
      return cloneSpendResult(prior.result);
    }

    const reservation = this.requireReservation(
      input.userId,
      input.reservationId,
    );

    if (reservation.state === "committed") {
      return domainError("IDEMPOTENCY_CONFLICT");
    }
    if (reservation.state !== "reserved") {
      return domainError("SPEND_STATE_INVALID");
    }
    if (
      input.providerCostMicroUsd >
      reservation.providerReservedMicroUsd
    ) {
      return domainError("PROVIDER_COST_LIMIT_EXCEEDED");
    }

    const wallet = this.requireWallet(input.userId);
    if (
      wallet.reservedBalance < reservation.credits ||
      wallet.providerReservedMicroUsd <
        reservation.providerReservedMicroUsd
    ) {
      return domainError("CREDIT_BALANCE_INVALID");
    }

    wallet.reservedBalance -= reservation.credits;
    wallet.providerReservedMicroUsd -=
      reservation.providerReservedMicroUsd;
    wallet.providerCommittedMicroUsd +=
      input.providerCostMicroUsd;
    reservation.state = "committed";
    reservation.providerCommittedMicroUsd =
      input.providerCostMicroUsd;
    reservation.updatedAt = this.currentTime().toISOString();

    const result = {
      reservation: cloneReservation(reservation),
      wallet: cloneWallet(wallet),
    };
    this.#commitResults.set(idempotencyMapKey, {
      fingerprint,
      result: cloneSpendResult(result),
    });
    return result;
  }

  async refundSpend(input: RefundSpendInput): Promise<SpendResult> {
    validateUserId(input.userId);
    validateIdempotencyKey(input.idempotencyKey);
    const idempotencyMapKey = `${input.userId}:${input.idempotencyKey}`;
    const fingerprint = input.reservationId;
    const prior = this.#refundResults.get(idempotencyMapKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return domainError("IDEMPOTENCY_CONFLICT");
      }
      return cloneSpendResult(prior.result);
    }

    const reservation = this.requireReservation(
      input.userId,
      input.reservationId,
    );

    if (reservation.state === "refunded") {
      return domainError("IDEMPOTENCY_CONFLICT");
    }
    if (reservation.state !== "reserved") {
      return domainError("SPEND_STATE_INVALID");
    }

    const wallet = this.requireWallet(input.userId);
    if (
      wallet.reservedBalance < reservation.credits ||
      wallet.providerReservedMicroUsd <
        reservation.providerReservedMicroUsd
    ) {
      return domainError("CREDIT_BALANCE_INVALID");
    }
    const refund = refundCredits({
      remaining: wallet.remainingBalance,
      amount: reservation.credits,
      maximum: BUILD_CREDIT_GRANT,
    });

    wallet.remainingBalance = refund.remaining;
    wallet.reservedBalance -= reservation.credits;
    wallet.providerReservedMicroUsd -=
      reservation.providerReservedMicroUsd;
    reservation.state = "refunded";
    reservation.updatedAt = this.currentTime().toISOString();

    const result = {
      reservation: cloneReservation(reservation),
      wallet: cloneWallet(wallet),
    };
    this.#refundResults.set(idempotencyMapKey, {
      fingerprint,
      result: cloneSpendResult(result),
    });
    return result;
  }

  async settleFailedSpend(
    input: SettleFailedSpendInput,
  ): Promise<SpendResult> {
    validateUserId(input.userId);
    validateIdempotencyKey(input.idempotencyKey);
    validateProviderCost(input.providerCostMicroUsd);
    const idempotencyMapKey = `${input.userId}:${input.idempotencyKey}`;
    const fingerprint =
      `${input.reservationId}:${input.providerCostMicroUsd}`;
    const prior = this.#failedSpendResults.get(idempotencyMapKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return domainError("IDEMPOTENCY_CONFLICT");
      }
      return cloneSpendResult(prior.result);
    }

    const reservation = this.requireReservation(
      input.userId,
      input.reservationId,
    );
    if (reservation.state !== "reserved") {
      return domainError("SPEND_STATE_INVALID");
    }
    if (
      input.providerCostMicroUsd !==
      reservation.providerReservedMicroUsd
    ) {
      return domainError("SPEND_STATE_INVALID");
    }
    const wallet = this.requireWallet(input.userId);
    if (
      wallet.reservedBalance < reservation.credits ||
      wallet.providerReservedMicroUsd <
        reservation.providerReservedMicroUsd
    ) {
      return domainError("CREDIT_BALANCE_INVALID");
    }
    const refund = refundCredits({
      remaining: wallet.remainingBalance,
      amount: reservation.credits,
      maximum: BUILD_CREDIT_GRANT,
    });
    wallet.remainingBalance = refund.remaining;
    wallet.reservedBalance -= reservation.credits;
    wallet.providerReservedMicroUsd -=
      reservation.providerReservedMicroUsd;
    wallet.providerCommittedMicroUsd += input.providerCostMicroUsd;
    reservation.state = "refunded";
    reservation.providerCommittedMicroUsd =
      input.providerCostMicroUsd;
    reservation.updatedAt = this.currentTime().toISOString();

    const result = {
      reservation: cloneReservation(reservation),
      wallet: cloneWallet(wallet),
    };
    this.#failedSpendResults.set(idempotencyMapKey, {
      fingerprint,
      result: cloneSpendResult(result),
    });
    return result;
  }

  async recordSession(input: RecordSessionInput): Promise<TaskSession> {
    validateUserId(input.userId);
    const reservation = this.requireReservation(
      input.userId,
      input.reservationId,
    );
    const expectedState =
      input.status === "completed" ? "committed" : "refunded";
    const validSavedOutput =
      input.savedOutput === undefined ||
      (typeof input.savedOutput === "string" &&
        input.savedOutput.length > 0 &&
        input.savedOutput.length <= 50_000);

    if (
      reservation.state !== expectedState ||
      typeof input.title !== "string" ||
      input.title.trim().length === 0 ||
      input.title.length > 200 ||
      typeof input.model !== "string" ||
      input.model.length === 0 ||
      input.model.length > 200 ||
      !Number.isSafeInteger(input.inputUnits) ||
      input.inputUnits < 0 ||
      !Number.isSafeInteger(input.outputUnits) ||
      input.outputUnits < 0 ||
      !Number.isSafeInteger(input.providerCostMicroUsd) ||
      input.providerCostMicroUsd < 0 ||
      (input.status === "completed" &&
        input.providerCostMicroUsd !==
          reservation.providerCommittedMicroUsd) ||
      (input.status === "failed" &&
        input.providerCostMicroUsd !==
          reservation.providerCommittedMicroUsd) ||
      !validSavedOutput
    ) {
      return domainError("SESSION_INVALID");
    }

    const prior = this.#sessionByReservation.get(reservation.id);
    if (prior) {
      const comparablePrior = JSON.stringify({
        ...prior,
        id: undefined,
        createdAt: undefined,
      });
      const comparableInput = JSON.stringify({
        userId: input.userId,
        reservationId: input.reservationId,
        taskType: input.taskType,
        title: input.title.trim(),
        model: input.model,
        inputUnits: input.inputUnits,
        outputUnits: input.outputUnits,
        providerCostMicroUsd: input.providerCostMicroUsd,
        status: input.status,
        ...(input.savedOutput === undefined
          ? {}
          : { savedOutput: input.savedOutput }),
      });
      if (comparablePrior !== comparableInput) {
        return domainError("IDEMPOTENCY_CONFLICT");
      }
      return cloneSession(prior);
    }

    const session: TaskSession = {
      id: this.nextId("session"),
      userId: input.userId,
      reservationId: input.reservationId,
      taskType: input.taskType,
      title: input.title.trim(),
      model: input.model,
      inputUnits: input.inputUnits,
      outputUnits: input.outputUnits,
      providerCostMicroUsd: input.providerCostMicroUsd,
      status: input.status,
      ...(input.savedOutput === undefined
        ? {}
        : { savedOutput: input.savedOutput }),
      createdAt: this.currentTime().toISOString(),
    };
    this.#sessions.push(session);
    this.#sessionByReservation.set(reservation.id, session);
    return cloneSession(session);
  }

  async listHistory({
    userId,
  }: ListHistoryInput): Promise<readonly TaskSession[]> {
    validateUserId(userId);
    return this.#sessions
      .filter((session) => session.userId === userId)
      .map(cloneSession);
  }

  async getEarliestCompletedTask({
    userId,
  }: ListHistoryInput): Promise<TaskSession | null> {
    validateUserId(userId);
    let earliest: TaskSession | null = null;
    for (const session of this.#sessions) {
      if (session.userId !== userId || session.status !== "completed") {
        continue;
      }
      if (!earliest) {
        earliest = session;
        continue;
      }
      const sessionTime = new Date(session.createdAt).getTime();
      const earliestTime = new Date(earliest.createdAt).getTime();
      if (
        sessionTime < earliestTime ||
        (sessionTime === earliestTime && session.id < earliest.id)
      ) {
        earliest = session;
      }
    }
    return earliest ? cloneSession(earliest) : null;
  }

  async recordEvent(input: RecordEventInput): Promise<CampaignEvent> {
    if (input.userId !== undefined) {
      validateUserId(input.userId);
    }
    const validated = validateCampaignEventInput(
      input as unknown as {
        name: unknown;
        source?: unknown;
        metadata?: unknown;
      },
    );

    const event: CampaignEvent = {
      id: this.nextId("event"),
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      name: validated.name,
      ...(validated.source === undefined
        ? {}
        : { source: validated.source }),
      ...(validated.metadata === undefined
        ? {}
        : { metadata: validated.metadata }),
      createdAt: this.currentTime().toISOString(),
    };
    this.#events.push(event);
    return {
      ...event,
      ...(event.metadata ? { metadata: { ...event.metadata } } : {}),
    };
  }

  async getDashboard(): Promise<DashboardSnapshot> {
    const now = this.currentTime().getTime();
    const wallets = [...this.#wallets.values()];
    return {
      batchCount: this.#batches.size,
      codeCount: this.#codes.size,
      redeemedCount: [...this.#codes.values()].filter(
        (code) => code.state === "redeemed",
      ).length,
      activeWalletCount: wallets.filter(
        (wallet) => new Date(wallet.expiresAt).getTime() > now,
      ).length,
      sessionCount: this.#sessions.length,
      eventCount: this.#events.length,
      remainingCredits: wallets.reduce(
        (sum, wallet) => sum + wallet.remainingBalance,
        0,
      ),
      providerCostMicroUsd: wallets.reduce(
        (sum, wallet) =>
          sum + wallet.providerCommittedMicroUsd,
        0,
      ),
    };
  }

  async createBatch(input: CreateBatchInput): Promise<PromoBatch> {
    const name = input.name?.trim();
    const hashes = [...input.codeHashes].map((hash) =>
      hash.toLowerCase(),
    );
    const duplicateHashes = new Set(hashes).size !== hashes.length;
    const expiry =
      input.expiresAt === undefined
        ? undefined
        : new Date(input.expiresAt);
    const expiryIsValid =
      expiry === undefined || Number.isFinite(expiry.getTime());

    if (
      !name ||
      name.length > 120 ||
      hashes.length === 0 ||
      hashes.length > 10_000 ||
      duplicateHashes ||
      hashes.some((hash) => !HASH_PATTERN.test(hash)) ||
      hashes.some((hash) => this.#codes.has(hash)) ||
      !expiryIsValid ||
      (expiry !== undefined &&
        expiry.getTime() <= this.currentTime().getTime())
    ) {
      if (
        duplicateHashes ||
        hashes.some((hash) => this.#codes.has(hash))
      ) {
        return domainError("DUPLICATE_CODE");
      }
      return domainError("BATCH_INVALID");
    }

    const expiresAt = expiry?.toISOString();
    const createdAt = this.currentTime().toISOString();
    const batch: StoredBatch = {
      id: this.nextId("batch"),
      name,
      codeCount: hashes.length,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      createdAt,
    };
    this.#batches.set(batch.id, batch);
    for (const codeHash of hashes) {
      this.#codes.set(codeHash, {
        id: this.nextId("code"),
        batchId: batch.id,
        codeHash,
        state: "eligible",
        ...(expiresAt === undefined ? {} : { expiresAt }),
        createdAt,
      });
    }

    return { ...batch };
  }

  async revokeCode(input: RevokeCodeInput): Promise<RevokedCode> {
    const codeHash =
      input.codeHash === undefined
        ? await hashCode(input.code)
        : input.codeHash.toLowerCase();
    if (!HASH_PATTERN.test(codeHash)) {
      return domainError("INVALID_CODE");
    }

    const code = this.#codes.get(codeHash);
    if (!code) {
      return domainError("CODE_NOT_FOUND");
    }
    const state = this.codeState(code, this.currentTime());
    if (state === "redeemed") {
      return domainError("CODE_ALREADY_REDEEMED");
    }
    if (state === "expired") {
      return domainError("CODE_EXPIRED");
    }
    if (state === "revoked") {
      return {
        codeId: code.id,
        state: "revoked",
        revokedAt:
          code.revokedAt ?? this.currentTime().toISOString(),
      };
    }

    code.state = "revoked";
    code.revokedAt = this.currentTime().toISOString();
    return {
      codeId: code.id,
      state: "revoked",
      revokedAt: code.revokedAt,
    };
  }

  toJSON(): unknown {
    return {
      batches: [...this.#batches.values()].map((batch) => ({
        ...batch,
      })),
      codes: [...this.#codes.values()].map((code) => ({
        id: code.id,
        batchId: code.batchId,
        state: code.state,
        ...(code.expiresAt === undefined
          ? {}
          : { expiresAt: code.expiresAt }),
        ...(code.redeemedAt === undefined
          ? {}
          : { redeemedAt: code.redeemedAt }),
        ...(code.revokedAt === undefined
          ? {}
          : { revokedAt: code.revokedAt }),
        createdAt: code.createdAt,
      })),
      partnerRewards: [...this.#partnerRewards.values()].map(
        cloneReward,
      ),
      wallets: [...this.#wallets.values()].map(cloneWallet),
      ledgerEntries: [...this.#reservations.values()].map(
        cloneReservation,
      ),
      taskSessions: this.#sessions.map(cloneSession),
      events: this.#events.map((event) => ({
        ...event,
        ...(event.metadata
          ? { metadata: { ...event.metadata } }
          : {}),
      })),
    };
  }
}
