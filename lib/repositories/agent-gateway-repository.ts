import { randomUUID } from "node:crypto";

import type {
  AgentApiKeyDescriptor,
  AgentApiKeyLimits,
  AgentApiKeyPersistence,
  AgentApiKeyScope,
  PersistedAgentApiKey,
} from "@/lib/agent/types";
import {
  AGENT_REQUEST_LIMITS,
  AGENT_WALLET_COST_CAP_MICRO_USD,
  DEFAULT_MAXIMUM_ACTIVE_KEYS_PER_WALLET,
} from "@/lib/agent/policy";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createServiceRoleClient } from "@/lib/auth/server";
import { getDemoCampaignRepository } from "@/lib/repositories";
import type { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";

export type AgentRequestState =
  | "owner"
  | "running"
  | "completed"
  | "failed";

export interface AgentKeySummary extends AgentApiKeyDescriptor {
  providerCommittedMicroUsd: number;
  remainingCredits: number;
}

export interface AgentPrincipal {
  concurrencyLimit: number;
  expiresAt: string;
  keyId: string;
  remainingCredits: number;
  rpmLimit: number;
  scopes: readonly AgentApiKeyScope[];
  userId: string;
  walletExpiresAt: string;
  walletId: string;
  walletProviderCommittedMicroUsd: number;
}

export interface CreateAgentKeyInput {
  createdAt: string;
  expiresAt: string;
  limits: AgentApiKeyLimits;
  persistence: AgentApiKeyPersistence;
  scopes: readonly AgentApiKeyScope[];
  userId: string;
  walletId: string;
}

export interface BeginAgentRequestInput {
  creditCeiling: number;
  idempotencyKey: string;
  keyDigest: string;
  leaseExpiresAt: string;
  modelId: string;
  ownerToken: string;
  providerCostCeilingMicroUsd: number;
  requestFingerprint: string;
}

export interface BeginAgentRequestResult {
  errorCode?: string;
  keyId: string;
  leaseExpiresAt?: string;
  ownerToken?: string;
  remainingCredits?: number;
  requestId: string;
  resultExpiresAt?: string;
  resultPayload?: Readonly<Record<string, unknown>>;
  state: AgentRequestState;
  userId: string;
  walletId: string;
}

export interface TerminalizeAgentRequestInput {
  creditsCharged: number;
  errorCode?: "PROVIDER_UNAVAILABLE" | "AGENT_UNAVAILABLE";
  inputUnits: number;
  outputUnits: number;
  ownerToken: string;
  providerCostMicroUsd: number;
  requestId: string;
  resultPayload: Readonly<Record<string, unknown>>;
  state: "completed" | "failed";
}

export interface TerminalizeAgentRequestResult {
  errorCode?: string;
  remainingCredits: number;
  requestId: string;
  resultExpiresAt: string;
  resultPayload: Readonly<Record<string, unknown>>;
  state: "completed" | "failed";
}

export interface AgentGatewayRepository {
  admitRequest(keyDigest: string): Promise<void>;
  authenticateKey(keyDigest: string): Promise<AgentPrincipal>;
  beginRequest(
    input: BeginAgentRequestInput,
  ): Promise<BeginAgentRequestResult>;
  createKey(input: CreateAgentKeyInput): Promise<AgentKeySummary>;
  listKeys(userId: string): Promise<readonly AgentKeySummary[]>;
  revokeKey(userId: string, keyId: string): Promise<AgentKeySummary>;
  rotateKey(
    userId: string,
    keyId: string,
    replacement: CreateAgentKeyInput,
  ): Promise<AgentKeySummary>;
  terminalizeRequest(
    input: TerminalizeAgentRequestInput,
  ): Promise<TerminalizeAgentRequestResult>;
}

export class AgentGatewayError extends Error {
  readonly code:
    | "AUTHENTICATION_FAILED"
    | "CONCURRENCY_LIMITED"
    | "IDEMPOTENCY_CONFLICT"
    | "INSUFFICIENT_CREDITS"
    | "KEY_INACTIVE"
    | "KEY_LIMIT_REACHED"
    | "KEY_NOT_FOUND"
    | "PROVIDER_LIMIT_REACHED"
    | "RATE_LIMITED"
    | "UNAVAILABLE"
    | "WALLET_EXPIRED"
    | "WALLET_NOT_FOUND";

  constructor(code: AgentGatewayError["code"]) {
    super(code);
    this.name = "AgentGatewayError";
    this.code = code;
  }
}

interface StoredMemoryKey extends PersistedAgentApiKey {
  providerCommittedMicroUsd: number;
  providerReservedMicroUsd: number;
}

interface StoredMemoryRequest {
  completedAt?: string;
  creditCeiling: number;
  creditsCharged?: number;
  errorCode?: string;
  id: string;
  idempotencyKey: string;
  keyId: string;
  leaseExpiresAt?: string;
  modelId: string;
  ownerToken: string;
  inputUnits?: number;
  outputUnits?: number;
  providerCostCeilingMicroUsd: number;
  providerCostMicroUsd?: number;
  remainingCredits?: number;
  requestFingerprint: string;
  resultExpiresAt?: string;
  resultPayload?: Readonly<Record<string, unknown>>;
  state: "running" | "completed" | "failed";
  userId: string;
  walletId: string;
  createdAt: string;
}

interface StoredMemoryUsageEntry {
  balanceAfter: number;
  createdAt: string;
  creditsDelta: number;
  entryKind: "reserve" | "commit" | "refund";
  id: string;
  keyId: string;
  providerCommittedAfterMicroUsd: number;
  providerCostMicroUsd: number;
  providerReservedAfterMicroUsd: number;
  requestId: string;
  reservedAfter: number;
  userId: string;
  walletId: string;
}

export interface MemoryAgentAccountingSnapshot {
  requests: readonly {
    completedAt: string | null;
    creditsCharged: number | null;
    inputUnits: number | null;
    outputUnits: number | null;
    providerCostCeilingMicroUsd: number;
    providerCostMicroUsd: number | null;
    requestId: string;
    state: "running" | "completed" | "failed";
  }[];
  usageEntries: readonly Readonly<StoredMemoryUsageEntry>[];
}

function cloneSummary(value: AgentKeySummary): AgentKeySummary {
  return {
    ...value,
    limits: { ...value.limits },
    scopes: [...value.scopes],
  };
}

function completedResponsePayload(
  resultPayload: Readonly<Record<string, unknown>>,
) {
  const response = resultPayload.response;
  if (
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response)
  ) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  const ygf = (response as Readonly<Record<string, unknown>>).ygf;
  if (
    typeof ygf !== "object" ||
    ygf === null ||
    Array.isArray(ygf)
  ) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  return {
    response: response as Readonly<Record<string, unknown>>,
    ygf: ygf as Readonly<Record<string, unknown>>,
  };
}

function withAuthoritativeRemainingCredits(
  resultPayload: Readonly<Record<string, unknown>>,
  remainingCredits: number,
): Readonly<Record<string, unknown>> {
  const { response, ygf } = completedResponsePayload(resultPayload);
  return {
    ...resultPayload,
    response: {
      ...response,
      ygf: {
        ...ygf,
        remaining_credits: remainingCredits,
      },
    },
  };
}

function descriptorFor(
  key: StoredMemoryKey,
  remainingCredits: number,
): AgentKeySummary {
  return {
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    id: key.id,
    last4: key.last4,
    lastUsedAt: key.lastUsedAt,
    limits: { ...key.limits },
    ownerId: key.ownerId,
    prefix: key.prefix,
    providerCommittedMicroUsd: key.providerCommittedMicroUsd,
    remainingCredits,
    revokedAt: key.revokedAt,
    rotatedAt: key.rotatedAt,
    scopes: [...key.scopes],
    walletId: key.walletId,
  };
}

function genericAuthenticationFailure(): never {
  throw new AgentGatewayError("AUTHENTICATION_FAILED");
}

function validDate(value: string): number {
  const date = new Date(value).getTime();
  if (!Number.isFinite(date)) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  return date;
}

export class MemoryAgentGatewayRepository
  implements AgentGatewayRepository
{
  readonly #campaign: MemoryCampaignRepository;
  readonly #keys = new Map<string, StoredMemoryKey>();
  readonly #keyIdByDigest = new Map<string, string>();
  readonly #requests = new Map<string, StoredMemoryRequest>();
  readonly #requestIdByWalletIdempotency = new Map<string, string>();
  readonly #usageEntries = new Map<string, StoredMemoryUsageEntry>();
  readonly #admissions = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();
  readonly #now: () => Date;
  #queue: Promise<void> = Promise.resolve();

  constructor({
    campaign = getDemoCampaignRepository(),
    now = () => new Date(),
  }: {
    campaign?: MemoryCampaignRepository;
    now?: () => Date;
  } = {}) {
    this.#campaign = campaign;
    this.#now = now;
  }

  private currentTime() {
    const current = this.#now();
    if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    return new Date(current);
  }

  private withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private recordUsageEntry(
    input: Omit<StoredMemoryUsageEntry, "createdAt" | "id">,
    now: Date,
  ) {
    const mapKey = `${input.requestId}:${input.entryKind}`;
    const prior = this.#usageEntries.get(mapKey);
    if (prior) {
      const comparable: Partial<StoredMemoryUsageEntry> = {
        ...prior,
      };
      delete comparable.createdAt;
      delete comparable.id;
      if (JSON.stringify(comparable) !== JSON.stringify(input)) {
        throw new AgentGatewayError("UNAVAILABLE");
      }
      return;
    }
    this.#usageEntries.set(mapKey, {
      ...input,
      createdAt: now.toISOString(),
      id: randomUUID(),
    });
  }

  /** Test/demo-only accounting view. Never includes key material or payloads. */
  inspectAccountingForTests(): MemoryAgentAccountingSnapshot {
    return {
      requests: [...this.#requests.values()].map((request) => ({
        completedAt: request.completedAt ?? null,
        creditsCharged: request.creditsCharged ?? null,
        inputUnits: request.inputUnits ?? null,
        outputUnits: request.outputUnits ?? null,
        providerCostCeilingMicroUsd:
          request.providerCostCeilingMicroUsd,
        providerCostMicroUsd: request.providerCostMicroUsd ?? null,
        requestId: request.id,
        state: request.state,
      })),
      usageEntries: [...this.#usageEntries.values()].map((entry) => ({
        ...entry,
      })),
    };
  }

  private activeKey(
    key: StoredMemoryKey | undefined,
    now: Date,
  ): StoredMemoryKey {
    if (
      !key ||
      key.revokedAt !== null ||
      validDate(key.expiresAt) <= now.getTime()
    ) {
      return genericAuthenticationFailure();
    }
    return key;
  }

  private async cleanupExpiredRequests(walletId: string, now: Date) {
    for (const request of this.#requests.values()) {
      if (
        request.walletId === walletId &&
        request.state === "completed" &&
        request.resultExpiresAt !== undefined &&
        validDate(request.resultExpiresAt) <= now.getTime()
      ) {
        this.#requests.set(request.id, {
          ...request,
          resultPayload: { error: "REPLAY_EXPIRED" },
        });
      }
    }
    const stale = [...this.#requests.values()]
      .filter(
        (request) =>
          request.walletId === walletId &&
          request.state === "running" &&
          request.leaseExpiresAt !== undefined &&
          validDate(request.leaseExpiresAt) <= now.getTime(),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const request of stale) {
      const wallet = await this.#campaign.terminalizeAgentUsage({
        creditCeiling: request.creditCeiling,
        creditsCharged: 0,
        providerCostCeilingMicroUsd:
          request.providerCostCeilingMicroUsd,
        providerCostMicroUsd:
          request.providerCostCeilingMicroUsd,
        userId: request.userId,
      });
      const key = this.#keys.get(request.keyId);
      if (!key) {
        throw new AgentGatewayError("UNAVAILABLE");
      }
      this.#keys.set(key.id, {
        ...key,
        providerCommittedMicroUsd:
          key.providerCommittedMicroUsd +
          request.providerCostCeilingMicroUsd,
        providerReservedMicroUsd:
          key.providerReservedMicroUsd -
          request.providerCostCeilingMicroUsd,
      });
      this.recordUsageEntry(
        {
          balanceAfter: wallet.remainingBalance,
          creditsDelta: request.creditCeiling,
          entryKind: "refund",
          keyId: request.keyId,
          providerCommittedAfterMicroUsd:
            wallet.providerCommittedMicroUsd,
          providerCostMicroUsd:
            request.providerCostCeilingMicroUsd,
          providerReservedAfterMicroUsd:
            wallet.providerReservedMicroUsd,
          requestId: request.id,
          reservedAfter: wallet.reservedBalance,
          userId: request.userId,
          walletId: request.walletId,
        },
        now,
      );
      const resultExpiresAt = new Date(
        now.getTime() + 15 * 60 * 1_000,
      ).toISOString();
      this.#requests.set(request.id, {
        ...request,
        completedAt: now.toISOString(),
        creditsCharged: 0,
        errorCode: "REQUEST_EXPIRED",
        inputUnits: 0,
        leaseExpiresAt: undefined,
        outputUnits: 0,
        providerCostMicroUsd:
          request.providerCostCeilingMicroUsd,
        remainingCredits: wallet.remainingBalance,
        resultExpiresAt,
        resultPayload: { error: "AGENT_UNAVAILABLE" },
        state: "failed",
      });
    }
  }

  async createKey(
    input: CreateAgentKeyInput,
  ): Promise<AgentKeySummary> {
    return this.withLock(async () => {
      const now = this.currentTime();
      const wallet = await this.#campaign.getWallet({
        userId: input.userId,
      });
      if (wallet.id !== input.walletId) {
        throw new AgentGatewayError("WALLET_NOT_FOUND");
      }
      if (validDate(wallet.expiresAt) <= now.getTime()) {
        throw new AgentGatewayError("WALLET_EXPIRED");
      }
      const activeCount = [...this.#keys.values()].filter(
        (key) =>
          key.walletId === wallet.id &&
          key.revokedAt === null &&
          validDate(key.expiresAt) > now.getTime(),
      ).length;
      if (activeCount >= DEFAULT_MAXIMUM_ACTIVE_KEYS_PER_WALLET) {
        throw new AgentGatewayError("KEY_LIMIT_REACHED");
      }
      const lifecycleCount = [...this.#keys.values()].filter(
        (key) =>
          key.walletId === wallet.id &&
          validDate(key.createdAt) > now.getTime() - 24 * 60 * 60 * 1_000,
      ).length;
      if (lifecycleCount >= 10) {
        throw new AgentGatewayError("KEY_LIMIT_REACHED");
      }
      if (this.#keyIdByDigest.has(input.persistence.digest)) {
        throw new AgentGatewayError("UNAVAILABLE");
      }

      const key: StoredMemoryKey = {
        createdAt: input.createdAt,
        digest: input.persistence.digest,
        digestVersion: input.persistence.digestVersion,
        expiresAt: input.expiresAt,
        id: randomUUID(),
        last4: input.persistence.last4,
        lastUsedAt: null,
        limits: { ...input.limits },
        ownerId: input.userId,
        prefix: input.persistence.prefix,
        providerCommittedMicroUsd: 0,
        providerReservedMicroUsd: 0,
        revokedAt: null,
        rotatedAt: null,
        scopes: [...input.scopes],
        walletId: input.walletId,
      };
      this.#keys.set(key.id, key);
      this.#keyIdByDigest.set(key.digest, key.id);
      return descriptorFor(key, wallet.remainingBalance);
    });
  }

  async listKeys(
    userId: string,
  ): Promise<readonly AgentKeySummary[]> {
    return this.withLock(async () => {
      const wallet = await this.#campaign.getWallet({ userId });
      return [...this.#keys.values()]
        .filter((key) => key.ownerId === userId)
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        )
        .map((key) =>
          cloneSummary(descriptorFor(key, wallet.remainingBalance)),
        );
    });
  }

  async revokeKey(
    userId: string,
    keyId: string,
  ): Promise<AgentKeySummary> {
    return this.withLock(async () => {
      const key = this.#keys.get(keyId);
      if (!key || key.ownerId !== userId) {
        throw new AgentGatewayError("KEY_NOT_FOUND");
      }
      const wallet = await this.#campaign.getWallet({ userId });
      const revoked =
        key.revokedAt === null
          ? {
              ...key,
              revokedAt: this.currentTime().toISOString(),
            }
          : key;
      this.#keys.set(key.id, revoked);
      return descriptorFor(revoked, wallet.remainingBalance);
    });
  }

  async rotateKey(
    userId: string,
    keyId: string,
    replacement: CreateAgentKeyInput,
  ): Promise<AgentKeySummary> {
    return this.withLock(async () => {
      const now = this.currentTime();
      const old = this.#keys.get(keyId);
      if (
        !old ||
        old.ownerId !== userId ||
        old.revokedAt !== null ||
        validDate(old.expiresAt) <= now.getTime()
      ) {
        throw new AgentGatewayError("KEY_NOT_FOUND");
      }
      const wallet = await this.#campaign.getWallet({ userId });
      if (
        replacement.userId !== userId ||
        replacement.walletId !== wallet.id ||
        this.#keyIdByDigest.has(replacement.persistence.digest)
      ) {
        throw new AgentGatewayError("UNAVAILABLE");
      }
      const lifecycleCount = [...this.#keys.values()].filter(
        (key) =>
          key.walletId === wallet.id &&
          validDate(key.createdAt) > now.getTime() - 24 * 60 * 60 * 1_000,
      ).length;
      if (lifecycleCount >= 10) {
        throw new AgentGatewayError("KEY_LIMIT_REACHED");
      }
      const rotatedAt = now.toISOString();
      this.#keys.set(old.id, {
        ...old,
        revokedAt: rotatedAt,
        rotatedAt,
      });
      const created: StoredMemoryKey = {
        createdAt: replacement.createdAt,
        digest: replacement.persistence.digest,
        digestVersion: replacement.persistence.digestVersion,
        expiresAt: replacement.expiresAt,
        id: randomUUID(),
        last4: replacement.persistence.last4,
        lastUsedAt: null,
        limits: { ...old.limits },
        ownerId: userId,
        prefix: replacement.persistence.prefix,
        providerCommittedMicroUsd: 0,
        providerReservedMicroUsd: 0,
        revokedAt: null,
        rotatedAt: null,
        scopes: [...old.scopes],
        walletId: wallet.id,
      };
      this.#keys.set(created.id, created);
      this.#keyIdByDigest.set(created.digest, created.id);
      return descriptorFor(created, wallet.remainingBalance);
    });
  }

  async authenticateKey(keyDigest: string): Promise<AgentPrincipal> {
    return this.withLock(async () => {
      const now = this.currentTime();
      const keyId = this.#keyIdByDigest.get(keyDigest);
      const key = this.activeKey(
        keyId ? this.#keys.get(keyId) : undefined,
        now,
      );
      const wallet = await this.#campaign.getWallet({
        userId: key.ownerId,
      });
      if (
        wallet.id !== key.walletId ||
        validDate(wallet.expiresAt) <= now.getTime()
      ) {
        return genericAuthenticationFailure();
      }
      const updated = {
        ...key,
        lastUsedAt: now.toISOString(),
      };
      this.#keys.set(key.id, updated);
      return {
        concurrencyLimit: key.limits.maximumConcurrentRequests,
        expiresAt: key.expiresAt,
        keyId: key.id,
        remainingCredits: wallet.remainingBalance,
        rpmLimit: key.limits.maximumRequestsPerMinute,
        scopes: [...key.scopes],
        userId: key.ownerId,
        walletExpiresAt: wallet.expiresAt,
        walletId: wallet.id,
        walletProviderCommittedMicroUsd:
          wallet.providerCommittedMicroUsd,
      };
    });
  }

  async admitRequest(keyDigest: string): Promise<void> {
    return this.withLock(async () => {
      const now = this.currentTime();
      const keyId = this.#keyIdByDigest.get(keyDigest);
      const key = this.activeKey(
        keyId ? this.#keys.get(keyId) : undefined,
        now,
      );
      const wallet = await this.#campaign.getWallet({
        userId: key.ownerId,
      });
      if (
        wallet.id !== key.walletId ||
        validDate(wallet.expiresAt) <= now.getTime()
      ) {
        return genericAuthenticationFailure();
      }
      const nowMs = now.getTime();
      const prior = this.#admissions.get(key.id);
      const bucket =
        !prior || prior.windowStartedAt + 60_000 <= nowMs
          ? { count: 0, windowStartedAt: nowMs }
          : prior;
      if (bucket.count >= key.limits.maximumRequestsPerMinute) {
        throw new AgentGatewayError("RATE_LIMITED");
      }
      this.#admissions.set(key.id, {
        ...bucket,
        count: bucket.count + 1,
      });
    });
  }

  async beginRequest(
    input: BeginAgentRequestInput,
  ): Promise<BeginAgentRequestResult> {
    return this.withLock(async () => {
      if (!/^idem_[0-9a-f]{64}$/u.test(input.idempotencyKey)) {
        throw new AgentGatewayError("UNAVAILABLE");
      }
      const now = this.currentTime();
      const keyId = this.#keyIdByDigest.get(input.keyDigest);
      let key = this.activeKey(
        keyId ? this.#keys.get(keyId) : undefined,
        now,
      );
      if (!key.scopes.includes("chat:completions")) {
        return genericAuthenticationFailure();
      }
      await this.cleanupExpiredRequests(key.walletId, now);
      key = this.activeKey(this.#keys.get(key.id), now);

      const priorId = this.#requestIdByWalletIdempotency.get(
        `${key.walletId}:${input.idempotencyKey}`,
      );
      if (priorId) {
        const prior = this.#requests.get(priorId);
        if (
          !prior ||
          prior.requestFingerprint !== input.requestFingerprint ||
          prior.modelId !== input.modelId ||
          prior.providerCostCeilingMicroUsd !==
            input.providerCostCeilingMicroUsd ||
          prior.creditCeiling !== input.creditCeiling
        ) {
          throw new AgentGatewayError("IDEMPOTENCY_CONFLICT");
        }
        return this.beginResult(prior, false);
      }

      const runningForKey = [...this.#requests.values()].filter(
        (request) =>
          request.keyId === key.id &&
          request.state === "running" &&
          request.leaseExpiresAt !== undefined &&
          validDate(request.leaseExpiresAt) > now.getTime(),
      ).length;
      const runningForWallet = [...this.#requests.values()].filter(
        (request) =>
          request.walletId === key.walletId &&
          request.state === "running" &&
          request.leaseExpiresAt !== undefined &&
          validDate(request.leaseExpiresAt) > now.getTime(),
      ).length;
      if (
        runningForKey >= key.limits.maximumConcurrentRequests ||
        runningForWallet >=
          AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerWallet
      ) {
        throw new AgentGatewayError("CONCURRENCY_LIMITED");
      }
      if (
        key.providerCommittedMicroUsd +
          key.providerReservedMicroUsd +
          input.providerCostCeilingMicroUsd >
        AGENT_WALLET_COST_CAP_MICRO_USD
      ) {
        throw new AgentGatewayError("PROVIDER_LIMIT_REACHED");
      }

      let wallet;
      try {
        wallet = await this.#campaign.reserveAgentUsage({
          creditCeiling: input.creditCeiling,
          providerCostCeilingMicroUsd:
            input.providerCostCeilingMicroUsd,
          userId: key.ownerId,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "INSUFFICIENT_CREDITS"
        ) {
          throw new AgentGatewayError("INSUFFICIENT_CREDITS");
        }
        if (
          error instanceof Error &&
          error.message === "PROVIDER_COST_LIMIT_EXCEEDED"
        ) {
          throw new AgentGatewayError("PROVIDER_LIMIT_REACHED");
        }
        throw error;
      }
      key = {
        ...key,
        lastUsedAt: now.toISOString(),
        providerReservedMicroUsd:
          key.providerReservedMicroUsd +
          input.providerCostCeilingMicroUsd,
      };
      this.#keys.set(key.id, key);
      const request: StoredMemoryRequest = {
        createdAt: now.toISOString(),
        creditCeiling: input.creditCeiling,
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        keyId: key.id,
        leaseExpiresAt: input.leaseExpiresAt,
        modelId: input.modelId,
        ownerToken: input.ownerToken,
        providerCostCeilingMicroUsd:
          input.providerCostCeilingMicroUsd,
        requestFingerprint: input.requestFingerprint,
        state: "running",
        userId: key.ownerId,
        walletId: key.walletId,
      };
      this.#requests.set(request.id, request);
      this.#requestIdByWalletIdempotency.set(
        `${request.walletId}:${request.idempotencyKey}`,
        request.id,
      );
      this.recordUsageEntry(
        {
          balanceAfter: wallet.remainingBalance,
          creditsDelta: -request.creditCeiling,
          entryKind: "reserve",
          keyId: request.keyId,
          providerCommittedAfterMicroUsd:
            wallet.providerCommittedMicroUsd,
          providerCostMicroUsd:
            request.providerCostCeilingMicroUsd,
          providerReservedAfterMicroUsd:
            wallet.providerReservedMicroUsd,
          requestId: request.id,
          reservedAfter: wallet.reservedBalance,
          userId: request.userId,
          walletId: request.walletId,
        },
        now,
      );
      return {
        ...this.beginResult(request, true),
        remainingCredits: wallet.remainingBalance,
      };
    });
  }

  private beginResult(
    request: StoredMemoryRequest,
    isOwner: boolean,
  ): BeginAgentRequestResult {
    return {
      ...(request.errorCode ? { errorCode: request.errorCode } : {}),
      keyId: request.keyId,
      ...(request.leaseExpiresAt
        ? { leaseExpiresAt: request.leaseExpiresAt }
        : {}),
      ...(isOwner && request.state === "running"
        ? { ownerToken: request.ownerToken }
        : {}),
      ...(request.remainingCredits === undefined
        ? {}
        : { remainingCredits: request.remainingCredits }),
      requestId: request.id,
      ...(request.resultExpiresAt
        ? { resultExpiresAt: request.resultExpiresAt }
        : {}),
      ...(request.resultPayload
        ? { resultPayload: request.resultPayload }
        : {}),
      state:
        request.state === "running" && isOwner
          ? "owner"
          : request.state,
      userId: request.userId,
      walletId: request.walletId,
    };
  }

  async terminalizeRequest(
    input: TerminalizeAgentRequestInput,
  ): Promise<TerminalizeAgentRequestResult> {
    return this.withLock(async () => {
      const now = this.currentTime();
      const request = this.#requests.get(input.requestId);
      if (!request) {
        throw new AgentGatewayError("UNAVAILABLE");
      }
      if (request.state !== "running") {
        if (
          !request.resultPayload ||
          !request.resultExpiresAt ||
          request.remainingCredits === undefined
        ) {
          throw new AgentGatewayError("UNAVAILABLE");
        }
        return {
          ...(request.errorCode
            ? { errorCode: request.errorCode }
            : {}),
          remainingCredits: request.remainingCredits,
          requestId: request.id,
          resultExpiresAt: request.resultExpiresAt,
          resultPayload: request.resultPayload,
          state: request.state,
        };
      }
      if (
        request.ownerToken !== input.ownerToken ||
        !request.leaseExpiresAt ||
        validDate(request.leaseExpiresAt) <= now.getTime() ||
        input.providerCostMicroUsd >
          request.providerCostCeilingMicroUsd ||
        input.creditsCharged > request.creditCeiling ||
        (input.state === "failed" &&
          (input.creditsCharged !== 0 ||
            input.providerCostMicroUsd !==
              request.providerCostCeilingMicroUsd ||
            !input.errorCode))
      ) {
        throw new AgentGatewayError("UNAVAILABLE");
      }
      const validatedResultPayload =
        input.state === "completed"
          ? withAuthoritativeRemainingCredits(
              input.resultPayload,
              0,
            )
          : input.resultPayload;

      const wallet = await this.#campaign.terminalizeAgentUsage({
        creditCeiling: request.creditCeiling,
        creditsCharged: input.creditsCharged,
        providerCostCeilingMicroUsd:
          request.providerCostCeilingMicroUsd,
        providerCostMicroUsd: input.providerCostMicroUsd,
        userId: request.userId,
      });
      const key = this.#keys.get(request.keyId);
      if (!key) {
        throw new AgentGatewayError("UNAVAILABLE");
      }
      this.#keys.set(key.id, {
        ...key,
        lastUsedAt: now.toISOString(),
        providerCommittedMicroUsd:
          key.providerCommittedMicroUsd +
          input.providerCostMicroUsd,
        providerReservedMicroUsd:
          key.providerReservedMicroUsd -
          request.providerCostCeilingMicroUsd,
      });
      this.recordUsageEntry(
        {
          balanceAfter: wallet.remainingBalance,
          creditsDelta:
            request.creditCeiling - input.creditsCharged,
          entryKind:
            input.state === "completed" ? "commit" : "refund",
          keyId: request.keyId,
          providerCommittedAfterMicroUsd:
            wallet.providerCommittedMicroUsd,
          providerCostMicroUsd: input.providerCostMicroUsd,
          providerReservedAfterMicroUsd:
            wallet.providerReservedMicroUsd,
          requestId: request.id,
          reservedAfter: wallet.reservedBalance,
          userId: request.userId,
          walletId: request.walletId,
        },
        now,
      );
      const resultExpiresAt = new Date(
        now.getTime() + 15 * 60 * 1_000,
      ).toISOString();
      const resultPayload =
        input.state === "completed"
          ? withAuthoritativeRemainingCredits(
              validatedResultPayload,
              wallet.remainingBalance,
            )
          : validatedResultPayload;
      const terminal: StoredMemoryRequest = {
        ...request,
        completedAt: now.toISOString(),
        creditsCharged: input.creditsCharged,
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
        inputUnits: input.inputUnits,
        leaseExpiresAt: undefined,
        outputUnits: input.outputUnits,
        providerCostMicroUsd: input.providerCostMicroUsd,
        remainingCredits: wallet.remainingBalance,
        resultExpiresAt,
        resultPayload,
        state: input.state,
      };
      this.#requests.set(request.id, terminal);
      return {
        ...(terminal.errorCode
          ? { errorCode: terminal.errorCode }
          : {}),
        remainingCredits: wallet.remainingBalance,
        requestId: terminal.id,
        resultExpiresAt,
        resultPayload: terminal.resultPayload!,
        state: input.state,
      };
    });
  }
}

type RpcRow = Record<string, unknown>;

function firstRow(value: unknown): RpcRow {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  return row as RpcRow;
}

function requiredString(
  row: RpcRow,
  key: string,
): string {
  const value = row[key];
  if (typeof value !== "string" || value.length < 1) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  return value;
}

function optionalString(
  row: RpcRow,
  key: string,
): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) {
    return undefined;
  }
  return requiredString(row, key);
}

function safeInteger(row: RpcRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  return value;
}

function safeScopes(value: unknown): readonly AgentApiKeyScope[] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value[0] !== "models:read" ||
    value[1] !== "chat:completions"
  ) {
    throw new AgentGatewayError("UNAVAILABLE");
  }
  return ["models:read", "chat:completions"];
}

function mapRpcError(message: unknown): never {
  const text = typeof message === "string" ? message : "";
  if (text.includes("AGENT_AUTHENTICATION_FAILED")) {
    throw new AgentGatewayError("AUTHENTICATION_FAILED");
  }
  if (text.includes("AGENT_KEY_LIMIT_REACHED")) {
    throw new AgentGatewayError("KEY_LIMIT_REACHED");
  }
  if (
    text.includes("AGENT_KEY_NOT_FOUND") ||
    text.includes("AGENT_KEY_INACTIVE")
  ) {
    throw new AgentGatewayError("KEY_NOT_FOUND");
  }
  if (text.includes("WALLET_NOT_FOUND")) {
    throw new AgentGatewayError("WALLET_NOT_FOUND");
  }
  if (text.includes("WALLET_EXPIRED")) {
    throw new AgentGatewayError("WALLET_EXPIRED");
  }
  if (text.includes("INSUFFICIENT_CREDITS")) {
    throw new AgentGatewayError("INSUFFICIENT_CREDITS");
  }
  if (text.includes("PROVIDER_COST_LIMIT_EXCEEDED")) {
    throw new AgentGatewayError("PROVIDER_LIMIT_REACHED");
  }
  if (text.includes("AGENT_RATE_LIMITED")) {
    throw new AgentGatewayError("RATE_LIMITED");
  }
  if (text.includes("AGENT_CONCURRENCY_LIMITED")) {
    throw new AgentGatewayError("CONCURRENCY_LIMITED");
  }
  if (text.includes("IDEMPOTENCY_CONFLICT")) {
    throw new AgentGatewayError("IDEMPOTENCY_CONFLICT");
  }
  throw new AgentGatewayError("UNAVAILABLE");
}

function mapKeyRow(row: RpcRow, userId: string): AgentKeySummary {
  return {
    createdAt: requiredString(row, "created_at"),
    expiresAt: requiredString(row, "expires_at"),
    id: requiredString(row, "key_id"),
    last4: requiredString(row, "key_last4"),
    lastUsedAt: optionalString(row, "last_used_at") ?? null,
    limits: {
      maximumConcurrentRequests: safeInteger(
        row,
        "concurrency_limit",
      ),
      maximumRequestsPerMinute: safeInteger(row, "rpm_limit"),
    },
    ownerId: userId,
    prefix: requiredString(row, "key_prefix"),
    providerCommittedMicroUsd:
      row.provider_committed_micro_usd === undefined
        ? 0
        : safeInteger(row, "provider_committed_micro_usd"),
    remainingCredits: safeInteger(row, "remaining_credits"),
    revokedAt: optionalString(row, "revoked_at") ?? null,
    rotatedAt: null,
    scopes: safeScopes(row.scopes),
    walletId: requiredString(row, "wallet_id"),
  };
}

export class SupabaseAgentGatewayRepository
  implements AgentGatewayRepository
{
  private async rpc(
    name: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const { data, error } = await createServiceRoleClient().rpc(
      name,
      parameters,
    );
    if (error) {
      return mapRpcError(error.message);
    }
    return data;
  }

  async admitRequest(keyDigest: string): Promise<void> {
    await this.rpc("admit_agent_api_key_request", {
      p_key_hash: keyDigest,
    });
  }

  async createKey(
    input: CreateAgentKeyInput,
  ): Promise<AgentKeySummary> {
    const row = firstRow(
      await this.rpc("create_agent_api_key", {
        p_concurrency_limit:
          input.limits.maximumConcurrentRequests,
        p_expires_at: input.expiresAt,
        p_hash_version: 1,
        p_key_hash: input.persistence.digest,
        p_key_last4: input.persistence.last4,
        p_key_prefix: input.persistence.prefix,
        p_rpm_limit: input.limits.maximumRequestsPerMinute,
        p_user_id: input.userId,
      }),
    );
    const key = mapKeyRow(row, input.userId);
    if (key.walletId !== input.walletId) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    return key;
  }

  async listKeys(
    userId: string,
  ): Promise<readonly AgentKeySummary[]> {
    const value = await this.rpc("list_agent_api_keys", {
      p_user_id: userId,
    });
    if (!Array.isArray(value)) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    return value.map((item) => mapKeyRow(firstRow(item), userId));
  }

  async revokeKey(
    userId: string,
    keyId: string,
  ): Promise<AgentKeySummary> {
    await this.rpc("revoke_agent_api_key", {
      p_key_id: keyId,
      p_user_id: userId,
    });
    const key = (await this.listKeys(userId)).find(
      (candidate) => candidate.id === keyId,
    );
    if (!key) {
      throw new AgentGatewayError("KEY_NOT_FOUND");
    }
    return key;
  }

  async rotateKey(
    userId: string,
    keyId: string,
    replacement: CreateAgentKeyInput,
  ): Promise<AgentKeySummary> {
    const row = firstRow(
      await this.rpc("rotate_agent_api_key", {
        p_expires_at: replacement.expiresAt,
        p_hash_version: 1,
        p_key_id: keyId,
        p_new_key_hash: replacement.persistence.digest,
        p_new_key_last4: replacement.persistence.last4,
        p_new_key_prefix: replacement.persistence.prefix,
        p_user_id: userId,
      }),
    );
    const key = mapKeyRow(row, userId);
    if (key.walletId !== replacement.walletId) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    return key;
  }

  async authenticateKey(keyDigest: string): Promise<AgentPrincipal> {
    const row = firstRow(
      await this.rpc("authenticate_agent_api_key", {
        p_key_hash: keyDigest,
      }),
    );
    return {
      concurrencyLimit: safeInteger(row, "concurrency_limit"),
      expiresAt: requiredString(row, "expires_at"),
      keyId: requiredString(row, "key_id"),
      remainingCredits: safeInteger(row, "remaining_credits"),
      rpmLimit: safeInteger(row, "rpm_limit"),
      scopes: safeScopes(row.scopes),
      userId: requiredString(row, "user_id"),
      walletExpiresAt: requiredString(row, "wallet_expires_at"),
      walletId: requiredString(row, "wallet_id"),
      walletProviderCommittedMicroUsd: safeInteger(
        row,
        "provider_committed_micro_usd",
      ),
    };
  }

  async beginRequest(
    input: BeginAgentRequestInput,
  ): Promise<BeginAgentRequestResult> {
    const row = firstRow(
      await this.rpc("begin_agent_request", {
        p_credit_ceiling: input.creditCeiling,
        p_idempotency_key: input.idempotencyKey,
        p_key_hash: input.keyDigest,
        p_lease_expires_at: input.leaseExpiresAt,
        p_model_id: input.modelId,
        p_owner_token: input.ownerToken,
        p_provider_cost_ceiling_micro_usd:
          input.providerCostCeilingMicroUsd,
        p_request_fingerprint: input.requestFingerprint,
      }),
    );
    const state = requiredString(row, "request_state");
    if (
      state !== "running" &&
      state !== "completed" &&
      state !== "failed"
    ) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    const ownerToken = optionalString(row, "request_owner_token");
    return {
      ...(optionalString(row, "error_code")
        ? { errorCode: optionalString(row, "error_code") }
        : {}),
      keyId: requiredString(row, "key_id"),
      ...(optionalString(row, "lease_expires_at")
        ? { leaseExpiresAt: optionalString(row, "lease_expires_at") }
        : {}),
      ...(ownerToken ? { ownerToken } : {}),
      ...(row.remaining_credits === null
        ? {}
        : { remainingCredits: safeInteger(row, "remaining_credits") }),
      requestId: requiredString(row, "request_id"),
      ...(optionalString(row, "result_expires_at")
        ? { resultExpiresAt: optionalString(row, "result_expires_at") }
        : {}),
      ...(row.result_payload &&
      typeof row.result_payload === "object" &&
      !Array.isArray(row.result_payload)
        ? {
            resultPayload: row.result_payload as Readonly<
              Record<string, unknown>
            >,
          }
        : {}),
      state: state === "running" && ownerToken ? "owner" : state,
      userId: requiredString(row, "user_id"),
      walletId: requiredString(row, "wallet_id"),
    };
  }

  async terminalizeRequest(
    input: TerminalizeAgentRequestInput,
  ): Promise<TerminalizeAgentRequestResult> {
    const row = firstRow(
      await this.rpc("terminalize_agent_request", {
        p_credits_charged: input.creditsCharged,
        p_error_code: input.errorCode ?? null,
        p_input_units: input.inputUnits,
        p_output_units: input.outputUnits,
        p_owner_token: input.ownerToken,
        p_provider_cost_micro_usd: input.providerCostMicroUsd,
        p_request_id: input.requestId,
        p_result_payload: input.resultPayload,
        p_state: input.state,
      }),
    );
    const state = requiredString(row, "request_state");
    if (state !== "completed" && state !== "failed") {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    if (
      !row.result_payload ||
      typeof row.result_payload !== "object" ||
      Array.isArray(row.result_payload)
    ) {
      throw new AgentGatewayError("UNAVAILABLE");
    }
    return {
      ...(optionalString(row, "error_code")
        ? { errorCode: optionalString(row, "error_code") }
        : {}),
      remainingCredits: safeInteger(row, "remaining_credits"),
      requestId: requiredString(row, "request_id"),
      resultExpiresAt: requiredString(row, "result_expires_at"),
      resultPayload: row.result_payload as Readonly<
        Record<string, unknown>
      >,
      state,
    };
  }
}

const globalAgentRepository = globalThis as typeof globalThis & {
  ygfAgentGatewayRepository?: MemoryAgentGatewayRepository;
};

export function getAgentGatewayRepository(): AgentGatewayRepository {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "supabase") {
    return new SupabaseAgentGatewayRepository();
  }
  globalAgentRepository.ygfAgentGatewayRepository ??=
    new MemoryAgentGatewayRepository();
  return globalAgentRepository.ygfAgentGatewayRepository;
}

export function resetAgentGatewayRepositoryForTests() {
  delete globalAgentRepository.ygfAgentGatewayRepository;
}
