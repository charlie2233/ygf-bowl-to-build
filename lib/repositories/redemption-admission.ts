import type {
  FinishRedemptionAttemptInput,
  RedemptionAdmission,
  RedemptionAdmissionInput,
  RedemptionAdmissionResult,
} from "@/lib/campaign/redemption-admission";
import { createServiceRoleClient } from "@/lib/auth/server";
import { resolveAuthRuntime } from "@/lib/auth/runtime";

const USER_ATTEMPT_LIMIT = 5;
const SIGNAL_ATTEMPT_LIMIT = 20;

interface StoredAttempt {
  id: string;
  signalKey: string;
  userKey: string;
}

export class MemoryRedemptionAdmission implements RedemptionAdmission {
  readonly #attempts = new Map<string, StoredAttempt>();
  readonly #signalCounts = new Map<string, number>();
  readonly #userCounts = new Map<string, number>();
  #sequence = 0;

  async admit({
    signal,
    userId,
  }: RedemptionAdmissionInput): Promise<RedemptionAdmissionResult> {
    const userKey = `${userId}:${signal.bucket}`;
    const signalKey = `${signal.purpose}:${signal.digest}:${signal.bucket}`;
    const allowed =
      (this.#userCounts.get(userKey) ?? 0) < USER_ATTEMPT_LIMIT &&
      (this.#signalCounts.get(signalKey) ?? 0) < SIGNAL_ATTEMPT_LIMIT;
    const attemptId = `demo-attempt-${++this.#sequence}`;

    if (allowed) {
      this.#userCounts.set(userKey, (this.#userCounts.get(userKey) ?? 0) + 1);
      this.#signalCounts.set(
        signalKey,
        (this.#signalCounts.get(signalKey) ?? 0) + 1,
      );
    }
    this.#attempts.set(attemptId, { id: attemptId, signalKey, userKey });

    return { allowed, attemptId };
  }

  async finish({ attemptId }: FinishRedemptionAttemptInput): Promise<void> {
    if (!this.#attempts.has(attemptId)) {
      throw new Error("REDEMPTION_ATTEMPT_NOT_FOUND");
    }
  }
}

export class SupabaseRedemptionAdmission implements RedemptionAdmission {
  async admit({
    signal,
    userId,
  }: RedemptionAdmissionInput): Promise<RedemptionAdmissionResult> {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc(
      "admit_campaign_redemption_attempt",
      {
        p_signal_bucket: signal.bucket,
        p_signal_digest: signal.digest,
        p_signal_expires_at: signal.expiresAt,
        p_signal_purpose: signal.purpose,
        p_signal_version: signal.version,
        p_user_id: userId,
      },
    );
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row?.attempt_id || typeof row.allowed !== "boolean") {
      throw new Error("REDEMPTION_ADMISSION_UNAVAILABLE");
    }
    return {
      allowed: row.allowed,
      attemptId: row.attempt_id,
    };
  }

  async finish({
    attemptId,
    outcome,
  }: FinishRedemptionAttemptInput): Promise<void> {
    const client = createServiceRoleClient();
    const { error } = await client.rpc(
      "finish_campaign_redemption_attempt",
      {
        p_attempt_id: attemptId,
        p_outcome: outcome,
      },
    );
    if (error) {
      throw new Error("REDEMPTION_ATTEMPT_FINALIZATION_FAILED");
    }
  }
}

const globalAdmissions = globalThis as typeof globalThis & {
  ygfDemoAdmission?: MemoryRedemptionAdmission;
};

export function getRedemptionAdmission(): RedemptionAdmission {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "supabase") {
    return new SupabaseRedemptionAdmission();
  }
  globalAdmissions.ygfDemoAdmission ??= new MemoryRedemptionAdmission();
  return globalAdmissions.ygfDemoAdmission;
}
