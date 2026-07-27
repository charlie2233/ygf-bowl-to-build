import { createHash } from "node:crypto";

import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createServiceRoleClient } from "@/lib/auth/server";
import type {
  CampaignEventMetadata,
  CampaignEventName,
  CampaignEventSource,
} from "@/lib/campaign/types";
import {
  getTaskWorkflowRepository,
  type TaskWorkflowRepository,
} from "@/lib/repositories/task-workflow-repository";

const PARTNER_PROVIDER = "openrouter";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

interface PartnerConnectionInput {
  externalSubjectHash: string;
  userId: string;
}

export interface PartnerSignalGateway {
  recordEligibleConnection(
    input: PartnerConnectionInput,
  ): Promise<boolean>;
  recordEligibleHandoff(userId: string): Promise<boolean>;
}

export class PartnerSignalUnavailableError extends Error {
  constructor() {
    super("PARTNER_SIGNAL_UNAVAILABLE");
    this.name = "PartnerSignalUnavailableError";
  }
}

function unavailable(): never {
  throw new PartnerSignalUnavailableError();
}

function stableHash(purpose: string, userId: string) {
  return createHash("sha256")
    .update(`ygf-bowl-to-build/${purpose}/${userId}`, "utf8")
    .digest("hex");
}

export function partnerSignalEventId(
  purpose: "connection" | "handoff",
  userId: string,
) {
  const bytes = Buffer.from(
    stableHash(`partner-${purpose}-event`, userId).slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function expectedEvent(
  purpose: "connection" | "handoff",
  userId: string,
) {
  return purpose === "connection"
    ? ({
        id: partnerSignalEventId("connection", userId),
        metadata: { connectionState: "connected" },
        name: "partner_connected",
        source: "wallet",
        user_id: userId,
      } as const)
    : ({
        id: partnerSignalEventId("handoff", userId),
        metadata: { connectionState: "started" },
        name: "partner_cta_viewed",
        source: "wallet",
        user_id: userId,
      } as const);
}

function validExistingEvent(
  value: unknown,
  expected: ReturnType<typeof expectedEvent>,
): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    event.user_id === expected.user_id &&
    event.name === expected.name &&
    event.source === expected.source &&
    typeof event.metadata === "object" &&
    event.metadata !== null &&
    !Array.isArray(event.metadata) &&
    (event.metadata as Record<string, unknown>).connectionState ===
      expected.metadata.connectionState
  );
}

export class SupabasePartnerSignalGateway
  implements PartnerSignalGateway
{
  readonly #clientFactory: typeof createServiceRoleClient;

  constructor(
    clientFactory: typeof createServiceRoleClient =
      createServiceRoleClient,
  ) {
    this.#clientFactory = clientFactory;
  }

  async #hasCompletedTask(
    client: ReturnType<typeof createServiceRoleClient>,
    userId: string,
  ) {
    const { data, error } = await client
      .from("task_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    if (error) {
      return unavailable();
    }
    return data !== null;
  }

  async #insertEvent(
    client: ReturnType<typeof createServiceRoleClient>,
    event: ReturnType<typeof expectedEvent>,
  ) {
    const row: {
      id: string;
      metadata: CampaignEventMetadata;
      name: CampaignEventName;
      source: CampaignEventSource;
      user_id: string;
    } = event;
    const { error } = await client.from("events").insert(row);
    if (!error) {
      return;
    }
    if (error.code !== "23505") {
      return unavailable();
    }

    const { data: existing, error: lookupError } = await client
      .from("events")
      .select("user_id,name,source,metadata")
      .eq("id", event.id)
      .maybeSingle();
    if (
      lookupError ||
      !validExistingEvent(existing, event)
    ) {
      return unavailable();
    }
  }

  async recordEligibleHandoff(userId: string): Promise<boolean> {
    if (!UUID_PATTERN.test(userId)) {
      return unavailable();
    }
    const client = this.#clientFactory();
    if (!(await this.#hasCompletedTask(client, userId))) {
      return false;
    }
    await this.#insertEvent(client, expectedEvent("handoff", userId));
    return true;
  }

  async recordEligibleConnection({
    externalSubjectHash,
    userId,
  }: PartnerConnectionInput): Promise<boolean> {
    if (
      !UUID_PATTERN.test(userId) ||
      !SHA256_PATTERN.test(externalSubjectHash)
    ) {
      return unavailable();
    }
    const client = this.#clientFactory();
    if (!(await this.#hasCompletedTask(client, userId))) {
      return false;
    }

    const { error: connectionError } = await client
      .from("partner_connections")
      .upsert(
        {
          external_subject_hash: externalSubjectHash,
          provider: PARTNER_PROVIDER,
          revoked_at: null,
          status: "connected",
          user_id: userId,
        },
        { onConflict: "user_id,provider" },
      );
    if (connectionError) {
      return unavailable();
    }
    await this.#insertEvent(
      client,
      expectedEvent("connection", userId),
    );
    return true;
  }
}

class DemoPartnerSignalGateway implements PartnerSignalGateway {
  readonly #recorded = new Set<string>();
  readonly #repository: TaskWorkflowRepository;

  constructor(repository: TaskWorkflowRepository) {
    this.#repository = repository;
  }

  async #eligible(userId: string) {
    const history = await this.#repository.listHistory({ userId });
    return history.some((session) => session.status === "completed");
  }

  async #record(
    purpose: "connection" | "handoff",
    userId: string,
  ) {
    if (!(await this.#eligible(userId))) {
      return false;
    }
    const key = `${purpose}:${userId}`;
    if (this.#recorded.has(key)) {
      return true;
    }
    const event = expectedEvent(purpose, userId);
    await this.#repository.recordEvent({
      metadata: event.metadata,
      name: event.name,
      source: event.source,
      userId,
    });
    this.#recorded.add(key);
    return true;
  }

  recordEligibleHandoff(userId: string) {
    return this.#record("handoff", userId);
  }

  recordEligibleConnection({
    externalSubjectHash,
    userId,
  }: PartnerConnectionInput) {
    if (!SHA256_PATTERN.test(externalSubjectHash)) {
      return unavailable();
    }
    return this.#record("connection", userId);
  }
}

const globalPartnerSignals = globalThis as typeof globalThis & {
  ygfDemoPartnerSignals?: DemoPartnerSignalGateway;
};

function partnerSignalGateway(): PartnerSignalGateway {
  if (resolveAuthRuntime().mode === "supabase") {
    return new SupabasePartnerSignalGateway();
  }
  globalPartnerSignals.ygfDemoPartnerSignals ??=
    new DemoPartnerSignalGateway(getTaskWorkflowRepository());
  return globalPartnerSignals.ygfDemoPartnerSignals;
}

export function recordPartnerHandoffSignal(userId: string) {
  return partnerSignalGateway().recordEligibleHandoff(userId);
}

/**
 * Reserved for a trusted OAuth callback after partner credentials and approved
 * terms exist. Browser callers never supply or invoke this signal directly.
 */
export function recordPartnerConnectionSignal(
  input: PartnerConnectionInput,
) {
  return partnerSignalGateway().recordEligibleConnection(input);
}
