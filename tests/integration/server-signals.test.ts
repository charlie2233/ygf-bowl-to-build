import { describe, expect, it } from "vitest";

import {
  PartnerSignalUnavailableError,
  SupabasePartnerSignalGateway,
  partnerSignalEventId,
} from "@/lib/analytics/server-signals";

const USER_ID = "00000000-0000-4000-8000-000000000001";

interface RecordedCall {
  action: "insert" | "select" | "upsert";
  options?: unknown;
  payload?: unknown;
  table: string;
}

function createHarness({ eligible = true } = {}) {
  const calls: RecordedCall[] = [];
  const events = new Map<string, Record<string, unknown>>();

  function selectChain(
    table: string,
    columns: string,
  ) {
    const filters: Array<[string, unknown]> = [];
    const chain = {
      eq(field: string, value: unknown) {
        filters.push([field, value]);
        return chain;
      },
      limit() {
        return chain;
      },
      async maybeSingle() {
        if (table === "task_sessions") {
          return {
            data: eligible ? { id: "session-1" } : null,
            error: null,
          };
        }
        const id = filters.find(([field]) => field === "id")?.[1];
        return {
          data:
            typeof id === "string" ? events.get(id) ?? null : null,
          error: null,
        };
      },
    };
    calls.push({ action: "select", payload: columns, table });
    return chain;
  }

  const client = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          calls.push({ action: "insert", payload, table });
          if (table !== "events") {
            return Promise.resolve({ error: null });
          }
          const id = payload.id;
          if (typeof id !== "string") {
            return Promise.resolve({
              error: { code: "INVALID", message: "missing id" },
            });
          }
          if (events.has(id)) {
            return Promise.resolve({
              error: { code: "23505", message: "duplicate" },
            });
          }
          events.set(id, payload);
          return Promise.resolve({ error: null });
        },
        select(columns: string) {
          return selectChain(table, columns);
        },
        upsert(payload: unknown, options: unknown) {
          calls.push({
            action: "upsert",
            options,
            payload,
            table,
          });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return {
    calls,
    events,
    gateway: new SupabasePartnerSignalGateway(
      () => client as never,
    ),
  };
}

describe("server-owned partner signals", () => {
  it("records a fixed handoff once with a deterministic event id", async () => {
    const harness = createHarness();

    await expect(
      harness.gateway.recordEligibleHandoff(USER_ID),
    ).resolves.toBe(true);
    await expect(
      harness.gateway.recordEligibleHandoff(USER_ID),
    ).resolves.toBe(true);

    const eventId = partnerSignalEventId("handoff", USER_ID);
    expect(eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(harness.events).toEqual(
      new Map([
        [
          eventId,
          {
            id: eventId,
            metadata: { connectionState: "started" },
            name: "partner_cta_viewed",
            source: "wallet",
            user_id: USER_ID,
          },
        ],
      ]),
    );
  });

  it("records a real connection only through a trusted hashed-subject signal", async () => {
    const harness = createHarness();
    const externalSubjectHash = "a".repeat(64);

    await expect(
      harness.gateway.recordEligibleConnection({
        externalSubjectHash,
        userId: USER_ID,
      }),
    ).resolves.toBe(true);
    await expect(
      harness.gateway.recordEligibleConnection({
        externalSubjectHash,
        userId: USER_ID,
      }),
    ).resolves.toBe(true);

    const connectionWrites = harness.calls.filter(
      (call) =>
        call.action === "upsert" &&
        call.table === "partner_connections",
    );
    expect(connectionWrites).toHaveLength(2);
    expect(connectionWrites[0]).toMatchObject({
      options: { onConflict: "user_id,provider" },
      payload: {
        external_subject_hash: externalSubjectHash,
        provider: "openrouter",
        revoked_at: null,
        status: "connected",
        user_id: USER_ID,
      },
    });
    expect(
      harness.events.get(
        partnerSignalEventId("connection", USER_ID),
      ),
    ).toEqual({
      id: partnerSignalEventId("connection", USER_ID),
      metadata: { connectionState: "connected" },
      name: "partner_connected",
      source: "wallet",
      user_id: USER_ID,
    });
  });

  it("fails closed before any signal for ineligible or malformed identities", async () => {
    const ineligible = createHarness({ eligible: false });
    await expect(
      ineligible.gateway.recordEligibleHandoff(USER_ID),
    ).resolves.toBe(false);
    expect(
      ineligible.calls.some(
        (call) =>
          call.action !== "select" ||
          call.table !== "task_sessions",
      ),
    ).toBe(false);

    const malformed = createHarness();
    await expect(
      malformed.gateway.recordEligibleHandoff("attacker"),
    ).rejects.toEqual(
      new PartnerSignalUnavailableError(),
    );
    await expect(
      malformed.gateway.recordEligibleConnection({
        externalSubjectHash: "not-a-hash",
        userId: USER_ID,
      }),
    ).rejects.toEqual(
      new PartnerSignalUnavailableError(),
    );
    expect(malformed.calls).toHaveLength(0);
  });

  it("rejects a deterministic-id collision unless the existing event has the exact server-owned shape", async () => {
    const harness = createHarness();
    const eventId = partnerSignalEventId("handoff", USER_ID);
    harness.events.set(eventId, {
      id: eventId,
      metadata: { outcome: "revoked" },
      name: "code_validated",
      source: "admin",
      user_id: USER_ID,
    });

    await expect(
      harness.gateway.recordEligibleHandoff(USER_ID),
    ).rejects.toEqual(
      new PartnerSignalUnavailableError(),
    );
  });
});
