import { createServiceRoleClient } from "@/lib/auth/server";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import type { AbuseSignal } from "@/lib/campaign/rate-limit";
import type { PublicValidationAdmission } from "@/lib/campaign/public-validation-admission";

const PUBLIC_VALIDATION_LIMIT = 30;

interface CountEntry {
  count: number;
  expiresAt: number;
}

export class MemoryPublicValidationAdmission
  implements PublicValidationAdmission
{
  readonly #counts = new Map<string, CountEntry>();
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  async admit(signal: AbuseSignal) {
    const now = this.#now().getTime();
    for (const [key, entry] of this.#counts) {
      if (entry.expiresAt <= now) {
        this.#counts.delete(key);
      }
    }

    const expiresAt = new Date(signal.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return false;
    }
    const key =
      `${signal.version}:${signal.purpose}:` +
      `${signal.digest}:${signal.bucket}`;
    const prior = this.#counts.get(key);
    if ((prior?.count ?? 0) >= PUBLIC_VALIDATION_LIMIT) {
      return false;
    }
    this.#counts.set(key, {
      count: (prior?.count ?? 0) + 1,
      expiresAt,
    });
    return true;
  }
}

export class SupabasePublicValidationAdmission
  implements PublicValidationAdmission
{
  async admit(signal: AbuseSignal) {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc(
      "admit_campaign_public_validation",
      {
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
