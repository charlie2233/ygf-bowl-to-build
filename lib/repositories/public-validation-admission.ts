import { createServiceRoleClient } from "@/lib/auth/server";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import type {
  PublicValidationAdmission,
  PublicValidationAdmissionInput,
} from "@/lib/campaign/public-validation-admission";

const SIGNAL_VALIDATION_LIMIT = 300;
const SESSION_VALIDATION_LIMIT = 12;
const CODE_VALIDATION_LIMIT = 20;
const ACCOUNT_VALIDATION_LIMIT = 10;

interface CountEntry {
  count: number;
  expiresAt: number;
}

function validDigest(value: string | undefined) {
  return value === undefined || /^[0-9a-f]{64}$/u.test(value);
}

export class MemoryPublicValidationAdmission
  implements PublicValidationAdmission
{
  readonly #counts = new Map<string, CountEntry>();
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  async admit({
    accountDigest,
    codeDigest,
    sessionDigest,
    signal,
  }: PublicValidationAdmissionInput) {
    const now = this.#now().getTime();
    for (const [key, entry] of this.#counts) {
      if (entry.expiresAt <= now) {
        this.#counts.delete(key);
      }
    }

    const expiresAt = new Date(signal.expiresAt).getTime();
    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      !validDigest(signal.digest) ||
      !validDigest(sessionDigest) ||
      !validDigest(codeDigest) ||
      !validDigest(accountDigest)
    ) {
      return false;
    }
    const signalKey =
      `${signal.version}:${signal.purpose}:` +
      `${signal.digest}:${signal.bucket}`;
    const sessionKey = `session:${sessionDigest}:${signal.bucket}`;
    const codeKey = codeDigest
      ? `code:${codeDigest}:${signal.bucket}`
      : null;
    const accountKey = accountDigest
      ? `account:${accountDigest}:${signal.bucket}`
      : null;
    const dimensions = [
      { key: signalKey, limit: SIGNAL_VALIDATION_LIMIT },
      { key: sessionKey, limit: SESSION_VALIDATION_LIMIT },
      ...(codeKey
        ? [{ key: codeKey, limit: CODE_VALIDATION_LIMIT }]
        : []),
      ...(accountKey
        ? [{ key: accountKey, limit: ACCOUNT_VALIDATION_LIMIT }]
        : []),
    ];
    if (
      dimensions.some(
        ({ key, limit }) => (this.#counts.get(key)?.count ?? 0) >= limit,
      )
    ) {
      return false;
    }
    for (const { key } of dimensions) {
      this.#counts.set(key, {
        count: (this.#counts.get(key)?.count ?? 0) + 1,
        expiresAt,
      });
    }
    return true;
  }
}

export class SupabasePublicValidationAdmission
  implements PublicValidationAdmission
{
  async admit({
    accountDigest,
    codeDigest,
    sessionDigest,
    signal,
  }: PublicValidationAdmissionInput) {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc(
      "admit_campaign_public_validation_v2",
      {
        p_account_digest: accountDigest ?? null,
        p_code_digest: codeDigest ?? null,
        p_session_digest: sessionDigest,
        p_signal_bucket: signal.bucket,
        p_signal_digest: signal.digest,
        p_signal_expires_at: signal.expiresAt,
        p_signal_purpose: signal.purpose,
        p_signal_version: signal.version,
      },
    );
    const allowed =
      typeof data === "boolean"
        ? data
        : Array.isArray(data)
          ? data[0]?.allowed
          : null;
    if (error || typeof allowed !== "boolean") {
      throw new Error("PUBLIC_VALIDATION_ADMISSION_UNAVAILABLE");
    }
    return allowed;
  }
}

const globalAdmissions = globalThis as typeof globalThis & {
  ygfPublicValidationAdmission?: MemoryPublicValidationAdmission;
};

export function getPublicValidationAdmission(): PublicValidationAdmission {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "supabase") {
    return new SupabasePublicValidationAdmission();
  }
  globalAdmissions.ygfPublicValidationAdmission ??=
    new MemoryPublicValidationAdmission();
  return globalAdmissions.ygfPublicValidationAdmission;
}

export function resetPublicValidationAdmissionForTests() {
  delete globalAdmissions.ygfPublicValidationAdmission;
}
