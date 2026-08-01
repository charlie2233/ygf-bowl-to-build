import { describe, expect, it } from "vitest";

import {
  createPersonalAgentKey,
  rotatePersonalAgentKey,
} from "@/lib/agent/key-service";
import { digestAgentApiKey } from "@/lib/agent/api-key";
import { publicAgentKeySummary } from "@/lib/agent/public-key";
import { createKeyCollectionHandlers } from "@/app/api/keys/route";
import { createKeyRevokeHandler } from "@/app/api/keys/[id]/route";
import { createKeyRotateHandler } from "@/app/api/keys/[id]/rotate/route";
import {
  MemoryAgentGatewayRepository,
} from "@/lib/repositories/agent-gateway-repository";
import { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";

const ENVIRONMENT = {
  NEXT_PUBLIC_APP_URL: "https://build.ygf.test",
  YGF_AGENT_API_KEY_DIGEST_SECRET:
    "agent-key-api-test-digest-secret-at-least-32-bytes",
  YGF_DEMO_MODE: "true",
};

async function setup() {
  const now = () => new Date("2026-07-27T20:00:00.000Z");
  const campaign = new MemoryCampaignRepository({
    demoMode: true,
    now,
  });
  await campaign.redeemCode({
    code: "BOWL7K2A",
    idempotencyKey: "agent-key-api-wallet",
    userId: "demo-user",
  });
  const repository = new MemoryAgentGatewayRepository({
    campaign,
    now,
  });
  const createKey = (userId: string) =>
    createPersonalAgentKey(userId, {
      campaign,
      environment: ENVIRONMENT,
      now,
      repository,
    });
  const rotate = (userId: string, keyId: string) =>
    rotatePersonalAgentKey(userId, keyId, {
      campaign,
      environment: ENVIRONMENT,
      now,
      repository,
    });
  return {
    campaign,
    createKey,
    repository,
    rotate,
  };
}

function mutation(path: string, method = "POST") {
  return new Request(`https://build.ygf.test${path}`, {
    body: method === "POST" ? "{}" : undefined,
    headers: {
      "content-type": "application/json",
      origin: "https://build.ygf.test",
    },
    method,
  });
}

describe("personal Agent key APIs", () => {
  it("projects only the explicit customer-safe key fields", async () => {
    const context = await setup();
    const created = await context.createKey("demo-user");
    const repositoryValue = {
      ...created.key,
      futureProviderCostField: 123,
      providerReservedMicroUsd: 456,
    };

    expect(publicAgentKeySummary(repositoryValue)).toEqual({
      createdAt: created.key.createdAt,
      expiresAt: created.key.expiresAt,
      id: created.key.id,
      last4: created.key.last4,
      lastUsedAt: created.key.lastUsedAt,
      prefix: created.key.prefix,
      remainingCredits: created.key.remainingCredits,
      revokedAt: created.key.revokedAt,
    });
    expect(
      JSON.stringify(publicAgentKeySummary(repositoryValue)),
    ).not.toContain("Provider");
  });

  it("creates plaintext once while list serialization remains secret-free", async () => {
    const context = await setup();
    const handlers = createKeyCollectionHandlers({
      createKey: context.createKey,
      environment: ENVIRONMENT,
      getUser: async () => ({ id: "demo-user" }),
      repository: context.repository,
    });

    const createdResponse = await handlers.post(
      mutation("/api/keys"),
    );
    const created = await createdResponse.json();
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(created.apiKey).toMatch(
      /^ygf_[A-Za-z0-9_-]{43}$/u,
    );
    expect(created.notice).toContain("not be shown again");
    expect(JSON.stringify(created)).not.toContain(
      "providerCommittedMicroUsd",
    );

    const listResponse = await handlers.get();
    const listText = await listResponse.text();
    expect(listResponse.status).toBe(200);
    expect(listText).not.toContain(created.apiKey);
    expect(listText).not.toContain("providerCommittedMicroUsd");
    expect(JSON.stringify(context.repository)).not.toContain(
      created.apiKey,
    );
    expect(JSON.parse(listText)).toMatchObject({
      keys: [
        {
          last4: created.apiKey.slice(-4),
          prefix: created.apiKey.slice(0, 8),
          remainingCredits: 3000,
        },
      ],
    });
  });

  it("rejects unauthenticated and cross-origin creation", async () => {
    const context = await setup();
    const unauthenticated = createKeyCollectionHandlers({
      createKey: context.createKey,
      environment: ENVIRONMENT,
      getUser: async () => null,
      repository: context.repository,
    });
    expect(
      (await unauthenticated.post(mutation("/api/keys"))).status,
    ).toBe(401);

    const authenticated = createKeyCollectionHandlers({
      createKey: context.createKey,
      environment: ENVIRONMENT,
      getUser: async () => ({ id: "demo-user" }),
      repository: context.repository,
    });
    const crossOrigin = new Request(
      "https://build.ygf.test/api/keys",
      {
        body: "{}",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        method: "POST",
      },
    );
    expect((await authenticated.post(crossOrigin)).status).toBe(
      403,
    );
    await expect(
      context.repository.listKeys("demo-user"),
    ).resolves.toHaveLength(0);
  });

  it("requires an account upgrade for anonymous key creation and rotation while list/revoke stay safe", async () => {
    const context = await setup();
    const anonymousHandlers = createKeyCollectionHandlers({
      createKey: context.createKey,
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "demo-user",
        isAnonymous: true,
      }),
      repository: context.repository,
    });

    expect(
      (await anonymousHandlers.post(mutation("/api/keys"))).status,
    ).toBe(403);
    expect(
      await (
        await anonymousHandlers.post(mutation("/api/keys"))
      ).json(),
    ).toEqual({ error: "ACCOUNT_UPGRADE_REQUIRED" });
    expect((await anonymousHandlers.get()).status).toBe(200);

    const key = await context.createKey("demo-user");
    const rotate = createKeyRotateHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "demo-user",
        isAnonymous: true,
      }),
      rotate: context.rotate,
    });
    expect(
      (
        await rotate(
          new Request(
            `https://build.ygf.test/api/keys/${key.key.id}/rotate`,
            {
              headers: { origin: "https://build.ygf.test" },
              method: "POST",
            },
          ),
          key.key.id,
        )
      ).status,
    ).toBe(403);

    const revoke = createKeyRevokeHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "demo-user",
        isAnonymous: true,
      }),
      repository: context.repository,
    });
    expect(
      (
        await revoke(
          mutation(`/api/keys/${key.key.id}`, "DELETE"),
          key.key.id,
        )
      ).status,
    ).toBe(200);
  });

  it("revokes and rotates only through the authenticated owner path", async () => {
    const context = await setup();
    const first = await context.createKey("demo-user");
    const revoke = createKeyRevokeHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({ id: "demo-user" }),
      repository: context.repository,
    });
    const revoked = await revoke(
      mutation(`/api/keys/${first.key.id}`, "DELETE"),
      first.key.id,
    );
    expect(revoked.status).toBe(200);
    expect(await revoked.text()).not.toContain(
      "providerCommittedMicroUsd",
    );
    await expect(
      context.repository.authenticateKey(
        digestAgentApiKey(
          first.apiKey,
          ENVIRONMENT.YGF_AGENT_API_KEY_DIGEST_SECRET,
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });

    const second = await context.createKey("demo-user");
    const rotate = createKeyRotateHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({ id: "demo-user" }),
      rotate: context.rotate,
    });
    const rotatedResponse = await rotate(
      new Request(
        `https://build.ygf.test/api/keys/${second.key.id}/rotate`,
        {
          headers: { origin: "https://build.ygf.test" },
          method: "POST",
        },
      ),
      second.key.id,
    );
    const rotated = await rotatedResponse.json();
    expect(rotatedResponse.status).toBe(201);
    expect(rotated.apiKey).toMatch(
      /^ygf_[A-Za-z0-9_-]{43}$/u,
    );
    expect(rotated.apiKey).not.toBe(second.apiKey);
    expect(JSON.stringify(rotated)).not.toContain(
      "providerCommittedMicroUsd",
    );
    const keys = await context.repository.listKeys("demo-user");
    expect(
      keys.find((key) => key.id === second.key.id)?.revokedAt,
    ).not.toBeNull();
  });

  it("enforces the active-key limit across repeated creation", async () => {
    const context = await setup();
    await context.createKey("demo-user");
    await context.createKey("demo-user");
    await context.createKey("demo-user");
    await expect(context.createKey("demo-user")).rejects.toMatchObject(
      { code: "KEY_LIMIT_REACHED" },
    );
  });
});
