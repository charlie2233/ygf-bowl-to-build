import {
  createAuthServerClient,
  createServiceRoleClient,
} from "@/lib/auth/server";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import {
  type CampaignEvent,
  type TaskSession,
  domainError,
} from "@/lib/campaign/types";
import { validateCampaignEventInput } from "@/lib/campaign/events";
import { getCampaignRepository } from "@/lib/repositories";
import type {
  CampaignRepository,
  CommitSpendInput,
  ListHistoryInput,
  RecordEventInput,
  RecordSessionInput,
  RefundSpendInput,
  ReserveSpendInput,
  SpendResult,
} from "@/lib/repositories/campaign-repository";

export interface CompactSpendResult {
  remainingCredits: number;
  reservationId: string;
}

type RepositorySpendResult = SpendResult | CompactSpendResult;

export interface SaveSessionOutputInput {
  output: string;
  sessionId: string;
  userId: string;
}

export type TaskExecutionState =
  | "owner"
  | "running"
  | "completed"
  | "failed"
  | "throttled";

export interface BeginTaskExecutionInput {
  idempotencyKey: string;
  modelId: string;
  ownerToken: string;
  providerCostCeilingMicroUsd: number;
  requestFingerprint: string;
  taskType: TaskSession["taskType"];
  userId: string;
}

export interface TaskExecutionResult {
  errorCode?: string;
  executionId?: string;
  leaseExpiresAt?: string;
  ownerToken?: string;
  remainingCredits?: number;
  resultExpiresAt?: string;
  resultPayload?: unknown;
  sessionId?: string;
  state: TaskExecutionState;
}

export interface TerminalizeTaskExecutionInput {
  errorCode?: "PROVIDER_UNAVAILABLE" | "TASK_UNAVAILABLE";
  executionId: string;
  inputUnits: number;
  ownerToken: string;
  outputUnits: number;
  providerCostMicroUsd: number;
  reservationId: string;
  resultPayload: Readonly<Record<string, unknown>>;
  savedOutput?: string;
  state: "completed" | "failed";
  taskTitle: string;
}

export interface TaskWorkflowRepository {
  beginTaskExecution?(
    input: BeginTaskExecutionInput,
  ): Promise<TaskExecutionResult>;
  commitSpend(input: CommitSpendInput): Promise<RepositorySpendResult>;
  terminalizeTaskExecution?(
    input: TerminalizeTaskExecutionInput,
  ): Promise<TaskExecutionResult>;
  getTaskExecutionOutput?(
    userId: string,
    sessionId: string,
  ): Promise<unknown | null>;
  getRemainingCredits?(userId: string): Promise<number>;
  listHistory(input: ListHistoryInput): Promise<readonly TaskSession[]>;
  recordEvent(input: RecordEventInput): Promise<CampaignEvent>;
  recordSession(input: RecordSessionInput): Promise<TaskSession>;
  refundSpend(input: RefundSpendInput): Promise<RepositorySpendResult>;
  reserveSpend(input: ReserveSpendInput): Promise<RepositorySpendResult>;
  saveSessionOutput?(
    input: SaveSessionOutputInput,
  ): Promise<TaskSession>;
}

interface SpendRpcRow {
  expires_at: string;
  ledger_entry_id: string;
  ledger_state: string;
  provider_committed_micro_usd: number;
  provider_reserved_micro_usd: number;
  remaining_balance: number;
  reserved_balance: number;
  wallet_id: string;
}

interface TaskSessionRow {
  created_at: string;
  id: string;
  input_units: number;
  model_id: string;
  output_units: number;
  provider_cost_micro_usd: number;
  reservation_id: string;
  saved_output: string | null;
  saved_output_retained: boolean;
  status: "completed" | "failed";
  task_type: TaskSession["taskType"];
  title: string;
  user_id: string;
}

interface EventRow {
  created_at: string;
  id: string;
  metadata: CampaignEvent["metadata"] | null;
  name: CampaignEvent["name"];
  source: CampaignEvent["source"] | null;
  user_id: string | null;
}

interface TaskExecutionRpcRow {
  error_code: string | null;
  execution_id: string | null;
  execution_state: TaskExecutionState;
  lease_expires_at: string | null;
  owner_token: string | null;
  remaining_credits: number | null;
  result_expires_at: string | null;
  result_payload: unknown;
  session_id: string | null;
}

export class TaskWorkflowRepositoryUnavailableError extends Error {
  constructor() {
    super("TASK_WORKFLOW_REPOSITORY_UNAVAILABLE");
    this.name = "TaskWorkflowRepositoryUnavailableError";
  }
}

function unavailable(): never {
  throw new TaskWorkflowRepositoryUnavailableError();
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200
  );
}

function validInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(new Date(value).getTime())
  );
}

function parseSpendRow(value: unknown): SpendRpcRow {
  const row =
    Array.isArray(value) && value.length === 1 ? value[0] : null;
  if (typeof row !== "object" || row === null) {
    return unavailable();
  }
  const candidate = row as Partial<SpendRpcRow>;
  if (
    !validId(candidate.wallet_id) ||
    !validId(candidate.ledger_entry_id) ||
    !validTimestamp(candidate.expires_at) ||
    !validInteger(candidate.remaining_balance) ||
    !validInteger(candidate.reserved_balance) ||
    !validInteger(candidate.provider_committed_micro_usd) ||
    !validInteger(candidate.provider_reserved_micro_usd) ||
    !validId(candidate.ledger_state)
  ) {
    return unavailable();
  }
  return candidate as SpendRpcRow;
}

function mapDatabaseError(message: unknown): never {
  const codes = [
    "AUTHENTICATION_REQUIRED",
    "CREDIT_BALANCE_INVALID",
    "IDEMPOTENCY_CONFLICT",
    "INSUFFICIENT_CREDITS",
    "PROVIDER_COST_LIMIT_EXCEEDED",
    "SPEND_NOT_FOUND",
    "SPEND_STATE_INVALID",
    "WALLET_EXPIRED",
    "WALLET_NOT_FOUND",
  ] as const;
  const code =
    typeof message === "string"
      ? codes.find((candidate) => message.includes(candidate))
      : undefined;
  if (!code || code === "AUTHENTICATION_REQUIRED") {
    return unavailable();
  }
  return domainError(code);
}

function mapTaskSession(row: TaskSessionRow): TaskSession {
  if (
    !row ||
    !validId(row.id) ||
    !validId(row.user_id) ||
    !validId(row.reservation_id) ||
    !validId(row.model_id) ||
    !validTimestamp(row.created_at) ||
    !validInteger(row.input_units) ||
    !validInteger(row.output_units) ||
    !validInteger(row.provider_cost_micro_usd) ||
    (row.status !== "completed" && row.status !== "failed") ||
    (row.saved_output_retained !== (row.saved_output !== null))
  ) {
    return unavailable();
  }
  return {
    createdAt: row.created_at,
    id: row.id,
    inputUnits: row.input_units,
    model: row.model_id,
    outputUnits: row.output_units,
    providerCostMicroUsd: row.provider_cost_micro_usd,
    reservationId: row.reservation_id,
    ...(row.saved_output === null
      ? {}
      : { savedOutput: row.saved_output }),
    status: row.status,
    taskType: row.task_type,
    title: row.title,
    userId: row.user_id,
  };
}

function mapEvent(row: EventRow): CampaignEvent {
  if (!row || !validId(row.id) || !validTimestamp(row.created_at)) {
    return unavailable();
  }
  return {
    createdAt: row.created_at,
    id: row.id,
    ...(row.metadata ? { metadata: row.metadata } : {}),
    name: row.name,
    ...(row.source ? { source: row.source } : {}),
    ...(row.user_id ? { userId: row.user_id } : {}),
  };
}

function mapTaskExecution(value: unknown): TaskExecutionResult {
  const row =
    Array.isArray(value) && value.length === 1 ? value[0] : null;
  if (typeof row !== "object" || row === null) {
    return unavailable();
  }
  const candidate = row as Partial<TaskExecutionRpcRow>;
  if (
    ![
      "owner",
      "running",
      "completed",
      "failed",
      "throttled",
    ].includes(String(candidate.execution_state))
  ) {
    return unavailable();
  }
  const optionalId = (value: unknown) =>
    value === null || value === undefined || validId(value);
  const optionalTimestamp = (value: unknown) =>
    value === null || value === undefined || validTimestamp(value);
  if (
    !optionalId(candidate.execution_id) ||
    !optionalId(candidate.owner_token) ||
    !optionalId(candidate.session_id) ||
    !optionalTimestamp(candidate.lease_expires_at) ||
    !optionalTimestamp(candidate.result_expires_at) ||
    !(
      candidate.remaining_credits === null ||
      candidate.remaining_credits === undefined ||
      validInteger(candidate.remaining_credits)
    ) ||
    !(
      candidate.error_code === null ||
      candidate.error_code === undefined ||
      candidate.error_code === "PROVIDER_UNAVAILABLE" ||
      candidate.error_code === "TASK_UNAVAILABLE"
    )
  ) {
    return unavailable();
  }
  const state = candidate.execution_state as TaskExecutionState;
  const validShape =
    state === "owner"
      ? validId(candidate.execution_id) &&
        validId(candidate.owner_token) &&
        validTimestamp(candidate.lease_expires_at) &&
        candidate.result_payload === null &&
        candidate.remaining_credits === null &&
        candidate.session_id === null &&
        candidate.error_code === null
      : state === "running"
        ? validId(candidate.execution_id) &&
          candidate.owner_token === null &&
          validTimestamp(candidate.lease_expires_at) &&
          candidate.result_payload === null &&
          candidate.remaining_credits === null &&
          candidate.session_id === null &&
          candidate.error_code === null
        : state === "throttled"
          ? candidate.execution_id === null &&
            candidate.owner_token === null &&
            candidate.lease_expires_at === null &&
            candidate.result_payload === null &&
            candidate.remaining_credits === null &&
            candidate.session_id === null &&
            candidate.error_code === null
          : validId(candidate.execution_id) &&
            candidate.owner_token === null &&
            candidate.lease_expires_at === null &&
            validTimestamp(candidate.result_expires_at) &&
            validInteger(candidate.remaining_credits) &&
            validId(candidate.session_id) &&
            (state === "completed"
              ? candidate.error_code === null
              : candidate.error_code === "PROVIDER_UNAVAILABLE" ||
                candidate.error_code === "TASK_UNAVAILABLE");
  if (!validShape) {
    return unavailable();
  }
  return {
    ...(candidate.error_code
      ? { errorCode: candidate.error_code }
      : {}),
    ...(candidate.execution_id
      ? { executionId: candidate.execution_id }
      : {}),
    ...(candidate.lease_expires_at
      ? { leaseExpiresAt: candidate.lease_expires_at }
      : {}),
    ...(candidate.owner_token
      ? { ownerToken: candidate.owner_token }
      : {}),
    ...(candidate.remaining_credits === null ||
    candidate.remaining_credits === undefined
      ? {}
      : { remainingCredits: candidate.remaining_credits }),
    ...(candidate.result_expires_at
      ? { resultExpiresAt: candidate.result_expires_at }
      : {}),
    ...(candidate.result_payload === null ||
    candidate.result_payload === undefined
      ? {}
      : { resultPayload: candidate.result_payload }),
    ...(candidate.session_id
      ? { sessionId: candidate.session_id }
      : {}),
    state,
  };
}

async function authenticatedClientFor(userId: string) {
  const client = await createAuthServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || data?.claims?.sub !== userId) {
    return unavailable();
  }
  return client;
}

export class SupabaseTaskWorkflowRepository
  implements TaskWorkflowRepository
{
  async beginTaskExecution(input: BeginTaskExecutionInput) {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc(
      "begin_campaign_task_execution",
      {
        p_idempotency_key: input.idempotencyKey,
        p_model_id: input.modelId,
        p_owner_token: input.ownerToken,
        p_provider_cost_ceiling_micro_usd:
          input.providerCostCeilingMicroUsd,
        p_request_fingerprint: input.requestFingerprint,
        p_task_type: input.taskType,
        p_user_id: input.userId,
      },
    );
    if (error) {
      return mapDatabaseError(error.message);
    }
    return mapTaskExecution(data);
  }

  async terminalizeTaskExecution(
    input: TerminalizeTaskExecutionInput,
  ) {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc(
      "terminalize_campaign_task_execution",
      {
        p_error_code: input.errorCode ?? null,
        p_execution_id: input.executionId,
        p_input_units: input.inputUnits,
        p_owner_token: input.ownerToken,
        p_output_units: input.outputUnits,
        p_provider_cost_micro_usd: input.providerCostMicroUsd,
        p_reservation_id: input.reservationId,
        p_result_payload: input.resultPayload,
        p_saved_output: input.savedOutput ?? null,
        p_state: input.state,
        p_task_title: input.taskTitle,
      },
    );
    if (error) {
      return mapDatabaseError(error.message);
    }
    return mapTaskExecution(data);
  }

  async getRemainingCredits(userId: string) {
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("wallets")
      .select("remaining_balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (
      error ||
      !data ||
      !validInteger(data.remaining_balance)
    ) {
      return unavailable();
    }
    return data.remaining_balance;
  }

  async getTaskExecutionOutput(
    userId: string,
    sessionId: string,
  ) {
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("task_executions")
      .select("result_payload,result_expires_at")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("state", "completed")
      .gt("result_expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) {
      return unavailable();
    }
    if (!data) {
      return null;
    }
    const payload = data.result_payload;
    if (
      typeof payload !== "object" ||
      payload === null ||
      !Object.hasOwn(payload, "output")
    ) {
      return null;
    }
    return (payload as { output: unknown }).output;
  }

  async reserveSpend(
    input: ReserveSpendInput,
  ): Promise<CompactSpendResult> {
    const client = await authenticatedClientFor(input.userId);
    const { data, error } = await client.rpc(
      "reserve_campaign_spend",
      {
        p_idempotency_key: input.idempotencyKey,
        p_provider_cost_micro_usd: input.providerCostMicroUsd,
      },
    );
    if (error) {
      return mapDatabaseError(error.message);
    }
    const row = parseSpendRow(data);
    if (row.ledger_state !== "reserved") {
      return unavailable();
    }
    return {
      remainingCredits: row.remaining_balance,
      reservationId: row.ledger_entry_id,
    };
  }

  async commitSpend(
    input: CommitSpendInput,
  ): Promise<CompactSpendResult> {
    const client = await authenticatedClientFor(input.userId);
    const { data, error } = await client.rpc(
      "commit_campaign_spend",
      {
        p_idempotency_key: input.idempotencyKey,
        p_provider_cost_micro_usd: input.providerCostMicroUsd,
        p_reservation_id: input.reservationId,
      },
    );
    if (error) {
      return mapDatabaseError(error.message);
    }
    const row = parseSpendRow(data);
    if (row.ledger_state !== "committed") {
      return unavailable();
    }
    return {
      remainingCredits: row.remaining_balance,
      reservationId: input.reservationId,
    };
  }

  async refundSpend(
    input: RefundSpendInput,
  ): Promise<CompactSpendResult> {
    const client = await authenticatedClientFor(input.userId);
    const { data, error } = await client.rpc(
      "refund_campaign_spend",
      {
        p_idempotency_key: input.idempotencyKey,
        p_reservation_id: input.reservationId,
      },
    );
    if (error) {
      return mapDatabaseError(error.message);
    }
    const row = parseSpendRow(data);
    if (row.ledger_state !== "refunded") {
      return unavailable();
    }
    return {
      remainingCredits: row.remaining_balance,
      reservationId: input.reservationId,
    };
  }

  async recordSession(input: RecordSessionInput) {
    const service = createServiceRoleClient();
    const { data: reservation, error: reservationError } =
      await service
        .from("ledger_entries")
        .select("id,user_id,state")
        .eq("id", input.reservationId)
        .eq("user_id", input.userId)
        .eq("entry_kind", "reserve")
        .eq(
          "state",
          input.status === "completed" ? "committed" : "refunded",
        )
        .maybeSingle();
    if (reservationError || !reservation) {
      return unavailable();
    }

    const terminalKind =
      input.status === "completed" ? "commit" : "refund";
    const { data: terminal, error: terminalError } = await service
      .from("ledger_entries")
      .select("provider_cost_micro_usd")
      .eq("reservation_id", input.reservationId)
      .eq("user_id", input.userId)
      .eq("entry_kind", terminalKind)
      .maybeSingle();
    if (
      terminalError ||
      !terminal ||
      terminal.provider_cost_micro_usd !== input.providerCostMicroUsd
    ) {
      return unavailable();
    }

    const row = {
      input_units: input.inputUnits,
      model_id: input.model,
      output_units: input.outputUnits,
      provider_cost_micro_usd: input.providerCostMicroUsd,
      reservation_id: input.reservationId,
      saved_output: input.savedOutput ?? null,
      saved_output_retained: input.savedOutput !== undefined,
      status: input.status,
      task_type: input.taskType,
      title: input.title,
      user_id: input.userId,
    };
    const { data, error } = await service
      .from("task_sessions")
      .insert(row)
      .select(
        "id,user_id,reservation_id,task_type,title,model_id,input_units,output_units,provider_cost_micro_usd,status,saved_output,saved_output_retained,created_at",
      )
      .maybeSingle();
    if (!error && data) {
      return mapTaskSession(data as TaskSessionRow);
    }
    if (error?.code !== "23505") {
      return unavailable();
    }

    const { data: prior, error: priorError } = await service
      .from("task_sessions")
      .select(
        "id,user_id,reservation_id,task_type,title,model_id,input_units,output_units,provider_cost_micro_usd,status,saved_output,saved_output_retained,created_at",
      )
      .eq("reservation_id", input.reservationId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (priorError || !prior) {
      return unavailable();
    }
    const session = mapTaskSession(prior as TaskSessionRow);
    const comparable = {
      inputUnits: session.inputUnits,
      model: session.model,
      outputUnits: session.outputUnits,
      providerCostMicroUsd: session.providerCostMicroUsd,
      reservationId: session.reservationId,
      savedOutput: session.savedOutput,
      status: session.status,
      taskType: session.taskType,
      title: session.title,
      userId: session.userId,
    };
    if (
      JSON.stringify(comparable) !==
      JSON.stringify({
        inputUnits: input.inputUnits,
        model: input.model,
        outputUnits: input.outputUnits,
        providerCostMicroUsd: input.providerCostMicroUsd,
        reservationId: input.reservationId,
        savedOutput: input.savedOutput,
        status: input.status,
        taskType: input.taskType,
        title: input.title.trim(),
        userId: input.userId,
      })
    ) {
      return domainError("IDEMPOTENCY_CONFLICT");
    }
    return session;
  }

  async listHistory({ userId }: ListHistoryInput) {
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("task_sessions")
      .select(
        "id,user_id,reservation_id,task_type,title,model_id,input_units,output_units,provider_cost_micro_usd,status,saved_output,saved_output_retained,created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !Array.isArray(data)) {
      return unavailable();
    }
    return data.map((row) => mapTaskSession(row as TaskSessionRow));
  }

  async saveSessionOutput({
    output,
    sessionId,
    userId,
  }: SaveSessionOutputInput) {
    if (
      typeof output !== "string" ||
      output.length < 1 ||
      output.length > 50_000
    ) {
      return domainError("SESSION_INVALID");
    }
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("task_sessions")
      .update({
        saved_output: output,
        saved_output_retained: true,
      })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("status", "completed")
      .select(
        "id,user_id,reservation_id,task_type,title,model_id,input_units,output_units,provider_cost_micro_usd,status,saved_output,saved_output_retained,created_at",
      )
      .maybeSingle();
    if (error || !data) {
      return unavailable();
    }
    return mapTaskSession(data as TaskSessionRow);
  }

  async recordEvent(input: RecordEventInput) {
    const validated = validateCampaignEventInput({
      metadata: input.metadata,
      name: input.name,
      source: input.source,
    });
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("events")
      .insert({
        metadata: validated.metadata ?? {},
        name: validated.name,
        source: validated.source ?? null,
        user_id: input.userId ?? null,
      })
      .select("id,user_id,name,source,metadata,created_at")
      .maybeSingle();
    if (error || !data) {
      return unavailable();
    }
    return mapEvent(data as EventRow);
  }
}

class DemoTaskWorkflowRepository implements TaskWorkflowRepository {
  readonly #repository: CampaignRepository;
  readonly #savedOutputs = new Map<string, string>();

  constructor(repository: CampaignRepository) {
    this.#repository = repository;
  }

  reserveSpend(input: ReserveSpendInput) {
    return this.#repository.reserveSpend(input);
  }

  commitSpend(input: CommitSpendInput) {
    return this.#repository.commitSpend(input);
  }

  refundSpend(input: RefundSpendInput) {
    return this.#repository.refundSpend(input);
  }

  recordSession(input: RecordSessionInput) {
    return this.#repository.recordSession(input);
  }

  recordEvent(input: RecordEventInput) {
    return this.#repository.recordEvent(input);
  }

  async getRemainingCredits(userId: string) {
    return (await this.#repository.getWallet({ userId }))
      .remainingBalance;
  }

  async listHistory(input: ListHistoryInput) {
    const sessions = await this.#repository.listHistory(input);
    return sessions.map((session) => {
      const savedOutput = this.#savedOutputs.get(session.id);
      return savedOutput === undefined
        ? session
        : { ...session, savedOutput };
    });
  }

  async saveSessionOutput({
    output,
    sessionId,
    userId,
  }: SaveSessionOutputInput) {
    const session = (await this.#repository.listHistory({ userId })).find(
      (candidate) =>
        candidate.id === sessionId &&
        candidate.status === "completed",
    );
    if (!session) {
      return domainError("SESSION_INVALID");
    }
    this.#savedOutputs.set(sessionId, output);
    return { ...session, savedOutput: output };
  }
}

const globalWorkflowRepositories = globalThis as typeof globalThis & {
  ygfDemoTaskWorkflowRepository?: DemoTaskWorkflowRepository;
};

export function getTaskWorkflowRepository(): TaskWorkflowRepository {
  if (resolveAuthRuntime().mode === "supabase") {
    return new SupabaseTaskWorkflowRepository();
  }
  globalWorkflowRepositories.ygfDemoTaskWorkflowRepository ??=
    new DemoTaskWorkflowRepository(
      getCampaignRepository() as CampaignRepository,
    );
  return globalWorkflowRepositories.ygfDemoTaskWorkflowRepository;
}

export function compactSpendResult(result: RepositorySpendResult) {
  if ("remainingCredits" in result) {
    return result;
  }
  return {
    remainingCredits: result.wallet.remainingBalance,
    reservationId: result.reservation.id,
  };
}
