import { validateCampaignEventInput } from "@/lib/campaign/events";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createServiceRoleClient } from "@/lib/auth/server";
import { getDemoCampaignRepository } from "@/lib/repositories";
import type { RecordEventInput } from "@/lib/repositories/campaign-repository";

export class ProductSignalUnavailableError extends Error {
  constructor() {
    super("PRODUCT_SIGNAL_UNAVAILABLE");
    this.name = "ProductSignalUnavailableError";
  }
}

/**
 * Records a privacy-safe, server-owned product signal. Callers provide only
 * allowlisted campaign event fields; the validator rejects secret-like keys
 * and values before any database write.
 */
export async function recordProductSignal(input: RecordEventInput) {
  const validated = validateCampaignEventInput(input);
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "demo") {
    return getDemoCampaignRepository().recordEvent({
      ...validated,
      ...(input.userId ? { userId: input.userId } : {}),
    });
  }

  const { error } = await createServiceRoleClient()
    .from("events")
    .insert({
      metadata: validated.metadata ?? {},
      name: validated.name,
      source: validated.source ?? null,
      user_id: input.userId ?? null,
    });
  if (error) {
    throw new ProductSignalUnavailableError();
  }
}
