// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createAccountMergeIntentHandler } from "@/app/api/auth/merge-intents/route";

const ENVIRONMENT = {
  YGF_PUBLIC_ORIGIN: "https://malatangai.test",
};
const SOURCE_SESSION_ID =
  "11111111-1111-4111-8111-111111111111";

function request(
  body: unknown = { provider: "google" },
  origin = "https://malatangai.test",
) {
  return new Request(
    "https://malatangai.test/api/auth/merge-intents",
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        origin,
        "sec-fetch-site": "same-origin",
      },
      method: "POST",
    },
  );
}

describe("account merge intent route", () => {
  it.each(["google", "apple"] as const)(
    "creates a service-persisted, HttpOnly %s intent without returning the bearer",
    async (provider) => {
      const persistIntent = vi.fn(async (input: unknown) => {
        void input;
      });
      const response = await createAccountMergeIntentHandler({
        environment: ENVIRONMENT,
        getUser: async () => ({
          id: "source-user",
          isAnonymous: true,
          sessionId: SOURCE_SESSION_ID,
        }),
        nodeEnvironment: "production",
        persistIntent,
      })(request({ provider }));
      const text = await response.text();
      const cookie = response.headers.get("set-cookie") ?? "";

      expect(response.status).toBe(201);
      expect(JSON.parse(text)).toEqual({ expiresIn: 600, ready: true });
      expect(cookie).toContain("ygf_account_merge=v1.");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=lax");
      expect(cookie).toContain("Path=/auth");
      expect(text).not.toContain("v1.");
      expect(persistIntent).toHaveBeenCalledOnce();
      const persisted = persistIntent.mock.calls[0]![0] as {
        provider: string;
        sourceSessionId: string;
        sourceUserId: string;
        tokenDigest: string;
      };
      expect(persisted).toMatchObject({
        provider,
        sourceSessionId: SOURCE_SESSION_ID,
        sourceUserId: "source-user",
      });
      expect(persisted.tokenDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(cookie).not.toContain(persisted.tokenDigest);
    },
  );

  it.each([
    [{}, 400],
    [{ provider: "github" }, 400],
    [{ provider: "google", extra: true }, 400],
  ] as const)("rejects malformed input", async (body, status) => {
    const persistIntent = vi.fn(async (input: unknown) => {
      void input;
    });
    const response = await createAccountMergeIntentHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "source-user",
        isAnonymous: true,
        sessionId: SOURCE_SESSION_ID,
      }),
      persistIntent,
    })(request(body));

    expect(response.status).toBe(status);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(persistIntent).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, unauthenticated, and non-anonymous callers", async () => {
    const persistIntent = vi.fn(async (input: unknown) => {
      void input;
    });
    const crossOrigin = await createAccountMergeIntentHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "source-user",
        isAnonymous: true,
        sessionId: SOURCE_SESSION_ID,
      }),
      persistIntent,
    })(request({ provider: "google" }, "https://attacker.test"));
    expect(crossOrigin.status).toBe(403);

    const unauthenticated = await createAccountMergeIntentHandler({
      environment: ENVIRONMENT,
      getUser: async () => null,
      persistIntent,
    })(request());
    expect(unauthenticated.status).toBe(401);

    const permanent = await createAccountMergeIntentHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "target-user",
        isAnonymous: false,
        sessionId: "22222222-2222-4222-8222-222222222222",
      }),
      persistIntent,
    })(request());
    expect(permanent.status).toBe(409);
    expect(persistIntent).not.toHaveBeenCalled();
  });

  it("does not set a cookie when persistence fails", async () => {
    const response = await createAccountMergeIntentHandler({
      environment: ENVIRONMENT,
      getUser: async () => ({
        id: "source-user",
        isAnonymous: true,
        sessionId: SOURCE_SESSION_ID,
      }),
      persistIntent: async () => {
        throw new Error("private database detail");
      },
    })(request());
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(text).not.toContain("private database detail");
  });
});
