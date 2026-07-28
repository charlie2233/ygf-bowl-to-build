import { describe, expect, it, vi } from "vitest";

import { createShareCardEventHandler } from "@/app/api/share-card/route";
import type { RecordEventInput } from "@/lib/repositories/campaign-repository";
import { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";

const ENVIRONMENT = {
  NEXT_PUBLIC_APP_URL: "https://build.ygf.test",
};

function request(
  body: unknown,
  origin = "https://build.ygf.test",
) {
  return new Request("https://build.ygf.test/api/share-card", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin,
    },
    method: "POST",
  });
}

async function setup() {
  const repository = new MemoryCampaignRepository({
    demoMode: true,
    now: () => new Date("2026-07-27T20:00:00.000Z"),
  });
  await repository.redeemCode({
    code: "BOWL7K2A",
    idempotencyKey: "share-wallet",
    userId: "demo-user",
  });
  const recordEvent = vi.fn((input: RecordEventInput) =>
    repository.recordEvent(input),
  );
  return {
    handler: createShareCardEventHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({ id: "demo-user" }),
      recordEvent,
      repository: {
        getWallet: (input) => repository.getWallet(input),
      },
    }),
    recordEvent,
  };
}

describe("share-card generation signal", () => {
  it("records one fixed, secret-free event for an active wallet", async () => {
    const { handler, recordEvent } = await setup();
    const response = await handler(request({ taskType: "study" }));

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(recordEvent).toHaveBeenCalledWith({
      metadata: { outcome: "success", taskType: "study" },
      name: "share_card_generated",
      source: "share",
      userId: "demo-user",
    });
    expect(JSON.stringify(recordEvent.mock.calls)).not.toMatch(
      /(ygf_|BOWL7K2A|email|prompt|private)/iu,
    );
  });

  it("rejects cross-origin and user-selected event payloads", async () => {
    const { handler, recordEvent } = await setup();

    expect(
      (
        await handler(
          request({}, "https://attacker.example"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          request({
            apiKey: `ygf_${"A".repeat(43)}`,
            name: "agent_key_created",
          }),
        )
      ).status,
    ).toBe(413);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("requires authentication and a redeemed wallet", async () => {
    const { recordEvent } = await setup();
    const unauthenticated = createShareCardEventHandler({
      environment: ENVIRONMENT,
      getUser: async () => null,
      recordEvent,
      repository: {
        getWallet: vi.fn(),
      },
    });

    expect((await unauthenticated(request({}))).status).toBe(401);
    expect(recordEvent).not.toHaveBeenCalled();

    const missingWallet = createShareCardEventHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({ id: "other-user" }),
      recordEvent,
      repository: {
        getWallet: vi.fn(async () => {
          throw new Error("WALLET_NOT_FOUND");
        }),
      },
    });
    expect((await missingWallet(request({}))).status).toBe(503);
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
