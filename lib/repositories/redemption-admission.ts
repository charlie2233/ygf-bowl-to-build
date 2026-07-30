import type {
  FinishRedemptionAttemptInput,
  RedemptionAdmission,
  RedemptionAdmissionInput,
  RedemptionAdmissionResult,
} from "@/lib/campaign/redemption-admission";
import { abuseSignalRetryAfterSeconds } from "@/lib/campaign/rate-limit";
import { createServiceRoleClient } from "@/lib/auth/server";
import { resolveAuthRuntime } from "@/lib/auth/runtime";

const USER_ATTEMPT_LIMIT = 5;
const SIGNAL_ATTEMPT_LIMIT = 200;
const SESSION_ATTEMPT_LIMIT = 5;
const CODE_ATTEMPT_LIMIT = 10;

interface StoredAttempt {
  allowed: boolean;
  codeKey: string;
  id: string;
  sessionKey: string;
  signalKey: string;
  userKey: string;
}

export class MemoryRedemptionAdmission implements RedemptionAdmission {
  readonly #attempts = new Map<string, StoredAttempt>();
  readonly #codeCounts = new Map<string, number>();
  readonly #sessionCounts = new Map<string, number>();
  readonly #signalCounts = new Map<string, number>();
  readonly #userCounts = new Map<string, number>();
  #sequence = 0;

  async admit({
    codeDigest,
    sessionDigest,
    signal,
    userId,
  }: RedemptionAdmissionInput): Promise<RedemptionAdmissionResult> {
    const userKey = `${userId}:${signal.bucket}`;
    const signalKey = `${signal.purpose}:${signal.digest}:${signal.bucket}`;
    const sessionKey = `${sessionDigest}:${signal.bucket}`;
    const codeKey = `${codeDigest}:${signal.bucket}`;
    const allowed =
      (this.#userCounts.get(userKey) ?? 0) < USER_ATTEMPT_LIMIT &&
      (this.#signalCounts.get(signalKey) ?? 0) < SIGNAL_ATTEMPT_LIMIT &&
      (this.#sessionCounts.get(sessionKey) ?? 0) <
        SESSION_ATTEMPT_LIMIT &&
      (this.#codeCounts.get(codeKey) ?? 0) < CODE_ATTEMPT_LIMIT;
    const attemptId = allowed
      ? `demo-attempt-${++this.#sequence}`
      : null;

    if (allowed && attemptId) {
      this.#userCounts.set(userKey, (this.#userCounts.get(userKey) ?? 0) + 1);
      this.#signalCounts.set(
        signalKey,
        (this.#signalCounts.get(signalKey) ?? 0) + 1,
      );
      this.#sessionCounts.set(
        sessionKey,
        (this.#sessionCounts.get(sessionKey) ?? 0) + 1,
      );
      this.#codeCounts.set(
        codeKey,
        (this.#codeCounts.get(codeKey) ?? 0) + 1,
      );
    }
    if (allowed && attemptId) {
      this.#attempts.set(attemptId, {
        allowed,
        codeKey,
        id: attemptId,
        sessionKey,
        signalKey,
        userKey,
      });
    }

    return allowed && attemptId
      ? { allowed: true, attemptId }
      : {
          allowed: false,
          retryAfterSeconds: abuseSignalRetryAfterSeconds(signal),
        };
  }

  async finish({ attemptId }: FinishRedemptionAttemptInput): Promise<void> {
    const attempt = this.#attempts.get(attemptId);
    if (!attempt) {
      throw new Error("REDEMPTION_ATTEMPT_NOT_FOUND");
    }
    if (!attempt.allowed) {
      throw new Error("REDEMPTION_ATTEMPT_FINALIZATION_BLOCKED");
    }
  }
}

export class SupabaseRedemptionAdmission implements RedemptionAdmission {
  async admit({
    codeDigest,
    sessionDigest,
    signal,
    userId,
  }: RedemptionAdmissionInput): Promise<RedemptionAdmissionResult> {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc(
      "admit_campaign_redemption_attempt_v2",
      {
        p_code_digest: codeDigest,
        p_session_digest: sessionDigest,
        p_signal_bucket: signal.bucket,
        p_signal_digest: signal.digest,
        p_signal_expires_at: signal.expiresAt,
        p_signal_purpose: signal.purpose,
        p_signal_version: signal.version,
        p_user_id: userId,
      },
    );
    const row = Array.isArray(data) ? data[0] : null;
    if (
      error ||
      typeof row?.allowed !== "boolean" ||
      (row.allowed && typeof row.attempt_id !== "string") ||
      (!row.allowed && row.attempt_id !== null)
    ) {
      throw new Error("REDEMPTION_ADMISSION_UNAVAILABLE");
    }
    return row.allowed
      ? {
          allowed: true,
          attemptId: row.attempt_id as string,
        }
      : {
          allowed: false,
          retryAfterSeconds: abuseSignalRetryAfterSeconds(signal),
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
