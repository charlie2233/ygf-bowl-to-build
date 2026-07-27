import { randomUUID } from "node:crypto";

import { validateCampaignEventInput } from "@/lib/campaign/events";
import {
  CAMPAIGN_EVENT_NAMES,
  type CampaignEvent,
  type CampaignEventSource,
} from "@/lib/campaign/types";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createServiceRoleClient } from "@/lib/auth/server";
import type { MetricEvent } from "@/lib/analytics/metrics";
import { getCampaignRepository } from "@/lib/repositories";
import type {
  CampaignRepository,
  RecordEventInput,
} from "@/lib/repositories/campaign-repository";

export const ADMIN_BATCH_SOURCES = [
  "receipt-insert",
  "scratch-card",
  "counter-card",
  "poster",
  "creator",
  "staff",
  "soft-test",
] as const;

export type AdminBatchSource =
  (typeof ADMIN_BATCH_SOURCES)[number];

export interface AdminBatchCreateInput {
  codeHashes: readonly string[];
  expiresAt?: string;
  name: string;
  operatorId: string;
  requestId: string;
  rowReferences: readonly string[];
  source: AdminBatchSource;
}

export interface AdminBatchRecord {
  activatedAt?: string;
  codeCount: number;
  createdAt: string;
  expiresAt?: string;
  id: string;
  name: string;
  source: AdminBatchSource;
  status: "active" | "pending";
}

export interface AdminBatchActivateInput {
  batchId: string;
  operatorId: string;
  requestId: string;
}

export interface AdminRevokeInput {
  operatorId: string;
  requestId: string;
  rowReference: string;
}

export interface AdminRevokeResult {
  codeId: string;
  revokedAt: string;
  rowReference: string;
}

export interface AdminAnalyticsData {
  activeWalletCount: number;
  batchCount: number;
  codeCount: number;
  events: readonly MetricEvent[];
  providerCostMicroUsd: number;
  remainingCredits: number;
}

export interface AdminCodeGateway {
  activateBatch(
    input: AdminBatchActivateInput,
  ): Promise<AdminBatchRecord>;
  createBatch(
    input: AdminBatchCreateInput,
  ): Promise<AdminBatchRecord>;
  getAnalyticsData(): Promise<AdminAnalyticsData>;
  recordEvent(input: RecordEventInput): Promise<unknown>;
  revokeCode(input: AdminRevokeInput): Promise<AdminRevokeResult>;
}

export type AdminGatewayErrorCode =
  | "FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_FOUND"
  | "NOT_ACTIVATABLE"
  | "NOT_REVOCABLE"
  | "UNAVAILABLE";

export class AdminGatewayError extends Error {
  readonly code: AdminGatewayErrorCode;

  constructor(code: AdminGatewayErrorCode) {
    super(`ADMIN_GATEWAY_${code}`);
    this.code = code;
    this.name = "AdminGatewayError";
  }
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
const PAGE_SIZE = 1_000;
const MAX_PAGES = 100;
const EVENT_NAMES = new Set<string>(CAMPAIGN_EVENT_NAMES);

function unavailable(): never {
  throw new AdminGatewayError("UNAVAILABLE");
}

function eventSourceForBatch(
  source: AdminBatchSource,
): CampaignEventSource {
  switch (source) {
    case "counter-card":
    case "poster":
    case "creator":
    case "staff":
      return source;
    case "receipt-insert":
      return "receipt-qr";
    case "scratch-card":
      return "staff";
    case "soft-test":
      return "admin";
  }
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(new Date(value).getTime())
  );
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128
  );
}

function rpcRow(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "object" &&
    value[0] !== null
    ? (value[0] as Record<string, unknown>)
    : null;
}

function mapBatchRpcRow(
  value: unknown,
  expected: {
    name?: string;
    source?: AdminBatchSource;
    status?: "active" | "pending";
  } = {},
): AdminBatchRecord {
  const row = rpcRow(value);
  if (
    !row ||
    !validIdentifier(row.batch_id) ||
    typeof row.batch_name !== "string" ||
    row.batch_name.length < 1 ||
    row.batch_name.length > 120 ||
    typeof row.batch_source !== "string" ||
    !ADMIN_BATCH_SOURCES.includes(
      row.batch_source as AdminBatchSource,
    ) ||
    !Number.isSafeInteger(row.code_count) ||
    Number(row.code_count) < 1 ||
    Number(row.code_count) > 3_000 ||
    (row.batch_status !== "pending" &&
      row.batch_status !== "active") ||
    !validTimestamp(row.created_at) ||
    (row.expires_at !== null &&
      !validTimestamp(row.expires_at)) ||
    (row.activated_at !== null &&
      !validTimestamp(row.activated_at)) ||
    (row.batch_status === "pending" &&
      row.activated_at !== null) ||
    (row.batch_status === "active" &&
      !validTimestamp(row.activated_at)) ||
    (expected.name !== undefined &&
      row.batch_name !== expected.name) ||
    (expected.source !== undefined &&
      row.batch_source !== expected.source) ||
    (expected.status !== undefined &&
      row.batch_status !== expected.status)
  ) {
    return unavailable();
  }

  return {
    ...(validTimestamp(row.activated_at)
      ? { activatedAt: row.activated_at }
      : {}),
    codeCount: Number(row.code_count),
    createdAt: row.created_at,
    ...(validTimestamp(row.expires_at)
      ? { expiresAt: row.expires_at }
      : {}),
    id: row.batch_id,
    name: row.batch_name,
    source: row.batch_source as AdminBatchSource,
    status: row.batch_status,
  };
}

function mapRevokeRpcRow(
  value: unknown,
  expectedRowReference: string,
): AdminRevokeResult {
  const row = rpcRow(value);
  if (
    !row ||
    !validIdentifier(row.code_id) ||
    row.row_reference !== expectedRowReference ||
    !validTimestamp(row.revoked_at)
  ) {
    return unavailable();
  }
  return {
    codeId: row.code_id,
    revokedAt: row.revoked_at,
    rowReference: row.row_reference,
  };
}

function mapMutationError(message: unknown): never {
  const text = typeof message === "string" ? message : "";
  if (text.includes("IDEMPOTENCY_CONFLICT")) {
    throw new AdminGatewayError("IDEMPOTENCY_CONFLICT");
  }
  if (text.includes("ADMIN_REQUIRED")) {
    throw new AdminGatewayError("FORBIDDEN");
  }
  if (
    text.includes("ADMIN_BATCH_NOT_FOUND") ||
    text.includes("ADMIN_CODE_NOT_FOUND")
  ) {
    throw new AdminGatewayError("NOT_FOUND");
  }
  if (
    text.includes("ADMIN_BATCH_NOT_ACTIVATABLE") ||
    text.includes("ADMIN_BATCH_INVENTORY_INVALID")
  ) {
    throw new AdminGatewayError("NOT_ACTIVATABLE");
  }
  if (text.includes("ADMIN_CODE_NOT_REVOCABLE")) {
    throw new AdminGatewayError("NOT_REVOCABLE");
  }
  return unavailable();
}

async function fetchAllRows(
  client: ServiceClient,
  table: "events" | "wallets",
  columns: string,
): Promise<readonly Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) {
      return unavailable();
    }
    rows.push(
      ...(data as unknown as Record<string, unknown>[]),
    );
    if (data.length < PAGE_SIZE) {
      return rows;
    }
  }
  return unavailable();
}

function mapEventRow(
  row: Record<string, unknown>,
): MetricEvent | null {
  if (
    !validIdentifier(row.id) ||
    !validTimestamp(row.created_at) ||
    typeof row.name !== "string" ||
    !EVENT_NAMES.has(row.name)
  ) {
    return null;
  }
  let validated;
  try {
    validated = validateCampaignEventInput({
      metadata: row.metadata,
      name: row.name,
      source: row.source ?? undefined,
    });
  } catch {
    return null;
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    ...(validated.metadata === undefined
      ? {}
      : { metadata: validated.metadata }),
    name: validated.name,
    ...(validated.source === undefined
      ? {}
      : { source: validated.source }),
    ...(validIdentifier(row.user_id)
      ? { userId: row.user_id }
      : {}),
  };
}

export class SupabaseAdminCodeGateway implements AdminCodeGateway {
  readonly #clientFactory: () => ServiceClient;

  constructor(
    clientFactory: () => ServiceClient = createServiceRoleClient,
  ) {
    this.#clientFactory = clientFactory;
  }

  async activateBatch(
    input: AdminBatchActivateInput,
  ): Promise<AdminBatchRecord> {
    const client = this.#clientFactory();
    let response: Awaited<ReturnType<ServiceClient["rpc"]>>;
    try {
      response = await client.rpc(
        "activate_campaign_admin_batch",
        {
          p_batch_id: input.batchId,
          p_operator_id: input.operatorId,
          p_request_id: input.requestId,
        },
      );
    } catch {
      return unavailable();
    }
    if (response.error) {
      return mapMutationError(response.error.message);
    }
    const batch = mapBatchRpcRow(response.data, {
      status: "active",
    });
    if (batch.id !== input.batchId) {
      return unavailable();
    }
    return batch;
  }

  async createBatch(
    input: AdminBatchCreateInput,
  ): Promise<AdminBatchRecord> {
    const client = this.#clientFactory();
    let response: Awaited<ReturnType<ServiceClient["rpc"]>>;
    try {
      response = await client.rpc(
        "create_campaign_admin_batch",
        {
          p_code_hashes: [...input.codeHashes],
          p_expires_at: input.expiresAt ?? null,
          p_name: input.name,
          p_operator_id: input.operatorId,
          p_request_id: input.requestId,
          p_row_references: [...input.rowReferences],
          p_source: input.source,
        },
      );
    } catch {
      return unavailable();
    }
    if (response.error) {
      return mapMutationError(response.error.message);
    }
    const batch = mapBatchRpcRow(response.data, {
      name: input.name,
      source: input.source,
      status: "pending",
    });
    if (batch.codeCount !== input.codeHashes.length) {
      return unavailable();
    }
    return batch;
  }

  async revokeCode(
    input: AdminRevokeInput,
  ): Promise<AdminRevokeResult> {
    const client = this.#clientFactory();
    let response: Awaited<ReturnType<ServiceClient["rpc"]>>;
    try {
      response = await client.rpc(
        "revoke_campaign_admin_code",
        {
          p_operator_id: input.operatorId,
          p_request_id: input.requestId,
          p_row_reference: input.rowReference,
        },
      );
    } catch {
      return unavailable();
    }
    if (response.error) {
      return mapMutationError(response.error.message);
    }
    return mapRevokeRpcRow(response.data, input.rowReference);
  }

  async recordEvent(input: RecordEventInput): Promise<void> {
    const validated = validateCampaignEventInput({
      metadata: input.metadata,
      name: input.name,
      source: input.source,
    });
    const client = this.#clientFactory();
    const { error } = await client.from("events").insert({
      metadata: validated.metadata ?? {},
      name: validated.name,
      source: validated.source ?? null,
      user_id: input.userId ?? null,
    });
    if (error) {
      return unavailable();
    }
  }

  async getAnalyticsData(): Promise<AdminAnalyticsData> {
    const client = this.#clientFactory();
    const [
      events,
      wallets,
      batchCountResult,
      codeCountResult,
    ] = await Promise.all([
      fetchAllRows(
        client,
        "events",
        "id,user_id,name,source,metadata,created_at",
      ),
      fetchAllRows(
        client,
        "wallets",
        "remaining_balance,provider_committed_micro_usd,expires_at",
      ),
      client
        .from("promo_batches")
        .select("*", { count: "exact", head: true }),
      client
        .from("promo_codes")
        .select("*", { count: "exact", head: true }),
    ]);

    if (
      batchCountResult.error ||
      codeCountResult.error ||
      batchCountResult.count === null ||
      codeCountResult.count === null
    ) {
      return unavailable();
    }

    const now = Date.now();
    let activeWalletCount = 0;
    let remainingCredits = 0;
    let providerCostMicroUsd = 0;
    for (const wallet of wallets) {
      const remaining = wallet.remaining_balance;
      const providerCost = wallet.provider_committed_micro_usd;
      if (
        !Number.isSafeInteger(remaining) ||
        Number(remaining) < 0 ||
        !Number.isSafeInteger(providerCost) ||
        Number(providerCost) < 0 ||
        !validTimestamp(wallet.expires_at)
      ) {
        return unavailable();
      }
      remainingCredits += Number(remaining);
      providerCostMicroUsd += Number(providerCost);
      if (new Date(wallet.expires_at).getTime() > now) {
        activeWalletCount += 1;
      }
    }

    return {
      activeWalletCount,
      batchCount: batchCountResult.count,
      codeCount: codeCountResult.count,
      events: events
        .map(mapEventRow)
        .filter((event): event is MetricEvent => event !== null),
      providerCostMicroUsd,
      remainingCredits,
    };
  }
}

interface SerializableRepository {
  toJSON(): unknown;
}

function memoryEvents(repository: CampaignRepository): MetricEvent[] {
  const serializable = repository as CampaignRepository &
    Partial<SerializableRepository>;
  const snapshot = serializable.toJSON?.();
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    !Array.isArray(
      (snapshot as { events?: unknown }).events,
    )
  ) {
    return [];
  }

  return (
    (snapshot as { events: readonly Record<string, unknown>[] })
      .events ?? []
  )
    .map((row) =>
      mapEventRow({
        created_at: row.createdAt,
        id: row.id,
        metadata: row.metadata,
        name: row.name,
        source: row.source,
        user_id: row.userId,
      }),
    )
    .filter((event): event is MetricEvent => event !== null);
}

interface DemoInventoryBatch {
  codeHashes: readonly string[];
  record: AdminBatchRecord;
  revokedRows: Set<string>;
  rowReferences: readonly string[];
}

interface DemoInventoryMutation {
  fingerprint: string;
  operation: "activate" | "create" | "revoke";
  result: AdminBatchRecord | AdminRevokeResult;
}

interface DemoInventoryStore {
  batches: Map<string, DemoInventoryBatch>;
  mutations: Map<string, DemoInventoryMutation>;
}

const demoInventoryStores = new WeakMap<
  CampaignRepository,
  DemoInventoryStore
>();

function demoStoreFor(
  repository: CampaignRepository,
): DemoInventoryStore {
  let store = demoInventoryStores.get(repository);
  if (!store) {
    store = {
      batches: new Map(),
      mutations: new Map(),
    };
    demoInventoryStores.set(repository, store);
  }
  return store;
}

function demoFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function replayDemoMutation<T>(
  store: DemoInventoryStore,
  requestId: string,
  operation: DemoInventoryMutation["operation"],
  fingerprint: string,
): T | undefined {
  const prior = store.mutations.get(requestId);
  if (!prior) {
    return undefined;
  }
  if (
    prior.operation !== operation ||
    prior.fingerprint !== fingerprint
  ) {
    throw new AdminGatewayError("IDEMPOTENCY_CONFLICT");
  }
  return prior.result as T;
}

export class RepositoryAdminCodeGateway
  implements AdminCodeGateway
{
  readonly #repository: CampaignRepository;
  readonly #store: DemoInventoryStore;

  constructor(repository: CampaignRepository) {
    this.#repository = repository;
    this.#store = demoStoreFor(repository);
  }

  async activateBatch(
    input: AdminBatchActivateInput,
  ): Promise<AdminBatchRecord> {
    const fingerprint = demoFingerprint({
      batchId: input.batchId,
      operation: "activate",
      operatorId: input.operatorId,
    });
    const replay = replayDemoMutation<AdminBatchRecord>(
      this.#store,
      input.requestId,
      "activate",
      fingerprint,
    );
    if (replay) {
      return { ...replay };
    }

    const stored = this.#store.batches.get(input.batchId);
    if (!stored) {
      throw new AdminGatewayError("NOT_FOUND");
    }
    if (
      stored.record.status !== "pending" ||
      stored.revokedRows.size > 0 ||
      (stored.record.expiresAt !== undefined &&
        new Date(stored.record.expiresAt).getTime() <= Date.now())
    ) {
      throw new AdminGatewayError("NOT_ACTIVATABLE");
    }

    await this.#repository.createBatch({
      codeHashes: stored.codeHashes,
      ...(stored.record.expiresAt === undefined
        ? {}
        : { expiresAt: stored.record.expiresAt }),
      name: stored.record.name,
    });
    await this.#repository.recordEvent({
      metadata: { count: stored.codeHashes.length },
      name: "batch_distributed",
      source: eventSourceForBatch(stored.record.source),
      userId: input.operatorId,
    });

    const result: AdminBatchRecord = {
      ...stored.record,
      activatedAt: new Date().toISOString(),
      status: "active",
    };
    stored.record = result;
    this.#store.mutations.set(input.requestId, {
      fingerprint,
      operation: "activate",
      result,
    });
    return { ...result };
  }

  async createBatch(
    input: AdminBatchCreateInput,
  ): Promise<AdminBatchRecord> {
    const fingerprint = demoFingerprint({
      codeHashes: input.codeHashes,
      expiresAt: input.expiresAt ?? null,
      name: input.name,
      operation: "create",
      operatorId: input.operatorId,
      rowReferences: input.rowReferences,
      source: input.source,
    });
    const replay = replayDemoMutation<AdminBatchRecord>(
      this.#store,
      input.requestId,
      "create",
      fingerprint,
    );
    if (replay) {
      return { ...replay };
    }

    if (
      input.codeHashes.length === 0 ||
      input.codeHashes.length !== input.rowReferences.length ||
      new Set(input.codeHashes).size !== input.codeHashes.length ||
      new Set(input.rowReferences).size !==
        input.rowReferences.length ||
      [...this.#store.batches.values()].some(
        (batch) =>
          batch.codeHashes.some((hash) =>
            input.codeHashes.includes(hash),
          ) ||
          batch.rowReferences.some((rowReference) =>
            input.rowReferences.includes(rowReference),
          ),
      )
    ) {
      return unavailable();
    }

    const result: AdminBatchRecord = {
      codeCount: input.codeHashes.length,
      createdAt: new Date().toISOString(),
      ...(input.expiresAt === undefined
        ? {}
        : { expiresAt: input.expiresAt }),
      id: randomUUID(),
      name: input.name,
      source: input.source,
      status: "pending",
    };
    this.#store.batches.set(result.id, {
      codeHashes: [...input.codeHashes],
      record: result,
      revokedRows: new Set(),
      rowReferences: [...input.rowReferences],
    });
    this.#store.mutations.set(input.requestId, {
      fingerprint,
      operation: "create",
      result,
    });
    return { ...result };
  }

  async revokeCode(
    input: AdminRevokeInput,
  ): Promise<AdminRevokeResult> {
    const fingerprint = demoFingerprint({
      operation: "revoke",
      operatorId: input.operatorId,
      rowReference: input.rowReference,
    });
    const replay = replayDemoMutation<AdminRevokeResult>(
      this.#store,
      input.requestId,
      "revoke",
      fingerprint,
    );
    if (replay) {
      return { ...replay };
    }

    let stored: DemoInventoryBatch | undefined;
    let rowIndex = -1;
    for (const candidate of this.#store.batches.values()) {
      rowIndex = candidate.rowReferences.indexOf(
        input.rowReference,
      );
      if (rowIndex >= 0) {
        stored = candidate;
        break;
      }
    }
    if (!stored || rowIndex < 0) {
      throw new AdminGatewayError("NOT_FOUND");
    }
    if (stored.revokedRows.has(input.rowReference)) {
      throw new AdminGatewayError("NOT_REVOCABLE");
    }

    let codeId = `demo-${input.rowReference}`;
    let revokedAt = new Date().toISOString();
    if (stored.record.status === "active") {
      const repositoryResult = await this.#repository.revokeCode({
        codeHash: stored.codeHashes[rowIndex]!,
      });
      codeId = repositoryResult.codeId;
      revokedAt = repositoryResult.revokedAt;
    }
    await this.#repository.recordEvent({
      metadata: { outcome: "revoked" },
      name: "code_validated",
      source: "admin",
      userId: input.operatorId,
    });
    stored.revokedRows.add(input.rowReference);

    const result: AdminRevokeResult = {
      codeId,
      revokedAt,
      rowReference: input.rowReference,
    };
    this.#store.mutations.set(input.requestId, {
      fingerprint,
      operation: "revoke",
      result,
    });
    return { ...result };
  }

  recordEvent(input: RecordEventInput): Promise<CampaignEvent> {
    return this.#repository.recordEvent(input);
  }

  async getAnalyticsData(): Promise<AdminAnalyticsData> {
    const dashboard = await this.#repository.getDashboard();
    return {
      activeWalletCount: dashboard.activeWalletCount,
      batchCount: dashboard.batchCount,
      codeCount: dashboard.codeCount,
      events: memoryEvents(this.#repository),
      providerCostMicroUsd: dashboard.providerCostMicroUsd,
      remainingCredits: dashboard.remainingCredits,
    };
  }
}

export function getAdminCodeGateway(): AdminCodeGateway {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "supabase") {
    return new SupabaseAdminCodeGateway();
  }
  return new RepositoryAdminCodeGateway(
    getCampaignRepository() as unknown as CampaignRepository,
  );
}
