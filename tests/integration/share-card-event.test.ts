import { describe, expect, it, vi } from "vitest";

import { createShareCardEventHandler } from "@/app/api/share-card/route";
import { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";
import { MemoryShareCardSignalGateway } from "@/lib/repositories/share-card-repository";

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
  const signalGateway = new MemoryShareCardSignalGateway(repository);
  const recordGeneration = vi.fn<
    typeof signalGateway.recordGeneration
  >((input) => signalGateway.recordGeneration(input));
  return {
    handler: createShareCardEventHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "demo-user",
        isAnonymous: true,
      }),
      repository: {
        getWallet: (input) => repository.getWallet(input),
      },
      signalGateway: { recordGeneration },
    }),
    recordGeneration,
    repository,
  };
}

describe("share-card generation signal", () => {
  it("records one fixed, secret-free event for an active wallet", async () => {
    const { handler, recordGeneration, repository } = await setup();
    const initialResponses = await Promise.all([
      handler(request({})),
      handler(request({})),
    ]);

    expect(initialResponses.map((response) => response.status)).toEqual([
      204,
      204,
    ]);
    expect(initialResponses[0]?.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(recordGeneration).toHaveBeenCalledWith({
      userId: "demo-user",
      walletId: expect.any(String),
    });
    expect(JSON.stringify(recordGeneration.mock.calls)).not.toMatch(
      /(ygf_|BOWL7K2A|email|prompt|private)/iu,
    );
    expect(
      (
        repository.toJSON() as {
          events: { name: string }[];
        }
      ).events.filter((event) => event.name === "share_card_generated"),
    ).toHaveLength(1);

    const duplicateResponses = await Promise.all([
      handler(request({})),
      handler(request({})),
    ]);
    expect(
      duplicateResponses.map((duplicate) => duplicate.status),
    ).toEqual([204, 204]);
    expect(
      (
        repository.toJSON() as {
          events: { name: string }[];
        }
      ).events.filter((event) => event.name === "share_card_generated"),
    ).toHaveLength(1);
  });

  it("rejects cross-origin and user-selected event payloads", async () => {
    const { handler, recordGeneration } = await setup();

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
    expect((await handler(request({ x: 1 }))).status).toBe(400);
    expect(recordGeneration).not.toHaveBeenCalled();
  });

  it("requires authentication and a redeemed wallet", async () => {
    const { recordGeneration } = await setup();
    const unauthenticated = createShareCardEventHandler({
      environment: ENVIRONMENT,
      getUser: async () => null,
      repository: {
        getWallet: vi.fn(),
      },
      signalGateway: {
        recordGeneration: (input) => recordGeneration(input),
      },
    });

    expect((await unauthenticated(request({}))).status).toBe(401);
    expect(recordGeneration).not.toHaveBeenCalled();

    const missingWallet = createShareCardEventHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "other-user",
        isAnonymous: true,
      }),
      repository: {
        getWallet: vi.fn(async () => {
          throw new Error("WALLET_NOT_FOUND");
        }),
      },
      signalGateway: {
        recordGeneration: (input) => recordGeneration(input),
      },
    });
    expect((await missingWallet(request({}))).status).toBe(503);
    expect(recordGeneration).not.toHaveBeenCalled();
  });
});
