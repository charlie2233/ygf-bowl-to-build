import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getBalance } from "@/app/api/balance/route";
import {
  createValidationRouteHandler,
  POST as validateCode,
} from "@/app/api/code/validate/route";
import {
  readPendingClaim,
} from "@/lib/auth/pending-claim";
import { serverSecret } from "@/lib/auth/runtime";
import {
  getCampaignRepository,
  resetDemoRepositoryForTests,
} from "@/lib/repositories";
import {
  resetPublicValidationAdmissionForTests,
} from "@/lib/repositories/public-validation-admission";

function validationRequest(
  code: string,
  {
    cookie,
    turnstileToken,
  }: { cookie?: string; turnstileToken?: string } = {},
) {
  return new Request(
    "http://localhost:3000/api/code/validate",
    {
      body: JSON.stringify({
        code,
        termsAccepted: true,
        ...(turnstileToken ? { turnstileToken } : {}),
      }),
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        origin: "http://localhost:3000",
      },
      method: "POST",
    },
  );
}

describe("Task 4 route composition in demo mode", () => {
  beforeEach(() => {
    vi.stubEnv("YGF_DEMO_MODE", "true");
    resetDemoRepositoryForTests();
    resetPublicValidationAdmissionForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetDemoRepositoryForTests();
    resetPublicValidationAdmissionForTests();
  });

  it("sets a signed httpOnly claim only for a generically eligible code", async () => {
    const response = await validateCode(
      validationRequest("BOWL7K2A"),
    );
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") ?? "";
    const cookieValue =
      /ygf_pending_claim=([^;]+)/.exec(setCookie)?.[1];

    expect(response.status).toBe(200);
    expect(body).toEqual({
      eligible: true,
      requiresAnonymousSession: false,
    });
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Max-Age=600/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(
      readPendingClaim(
        cookieValue,
        serverSecret("YGF_CLAIM_COOKIE_SECRET"),
      ),
    ).toMatchObject({
      code: "BOWL7K2A",
    });

    const invalid = await validateCode(
      validationRequest("NOTREAL1"),
    );
    expect(await invalid.json()).toEqual({ eligible: false });
    expect(invalid.headers.get("set-cookie")).toContain(
      "ygf_rate_session=",
    );
    expect(invalid.headers.get("set-cookie")).not.toContain(
      "ygf_pending_claim=",
    );
  });

  it("pauses public validation before claim-state or admission work", async () => {
    const downstream = vi.fn(async () =>
      Response.json({ eligible: true }),
    );
    const handler = createValidationRouteHandler({
      environment: { YGF_REDEMPTION_ENABLED: "false" },
      handle: downstream,
      nodeEnvironment: "test",
    });

    const response = await handler(validationRequest("BOWL7K2A"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    await expect(response.json()).resolves.toEqual({
      eligible: false,
      error: "REDEMPTION_PAUSED",
    });
    expect(downstream).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, unexpected, and oversized validation requests", async () => {
    const crossOrigin = validationRequest("BOWL7K2A");
    crossOrigin.headers.set("origin", "https://attacker.example");
    const crossOriginResponse = await validateCode(crossOrigin);
    expect(crossOriginResponse.status).toBe(403);
    await expect(crossOriginResponse.json()).resolves.toEqual({
      eligible: false,
      error: "ORIGIN_FORBIDDEN",
    });

    const unexpected = validationRequest("BOWL7K2A");
    const unexpectedBody = new Request(unexpected.url, {
      body: JSON.stringify({
        code: "BOWL7K2A",
        userId: "attacker",
        termsAccepted: true,
      }),
      headers: unexpected.headers,
      method: "POST",
    });
    expect((await validateCode(unexpectedBody)).status).toBe(400);

    const oversized = new Request(
      "http://localhost:3000/api/code/validate",
      {
        body: JSON.stringify({
          code: "BOWL7K2A",
          filler: "x".repeat(3_500),
          termsAccepted: true,
        }),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        method: "POST",
      },
    );
    expect((await validateCode(oversized)).status).toBe(413);
  });

  it("requires exact Turnstile hostname/action verification when explicitly enabled", async () => {
    vi.stubEnv("YGF_TURNSTILE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site_key_123");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret_key_123");
    vi.stubEnv("YGF_PUBLIC_ORIGIN", "http://localhost:3000");
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json({
        action: "redeem-code",
        hostname: "localhost",
        success: true,
      }),
    );
    vi.stubGlobal("fetch", fetchImplementation);

    const missing = await validateCode(
      validationRequest("BOWL7K2A"),
    );
    expect(missing.status).toBe(403);
    expect(missing.headers.get("set-cookie")).toContain(
      "ygf_rate_session=",
    );
    expect(missing.headers.get("set-cookie")).not.toContain(
      "ygf_pending_claim=",
    );
    await expect(missing.json()).resolves.toEqual({
      eligible: false,
      error: "TURNSTILE_REQUIRED",
    });

    const accepted = await validateCode(
      validationRequest("BOWL7K2A", {
        turnstileToken: "single-use-browser-token",
      }),
    );
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({
      eligible: true,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("fails closed without contacting Siteverify when Turnstile is enabled but misconfigured", async () => {
    vi.stubEnv("YGF_TURNSTILE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site_key_123");
    vi.stubEnv("YGF_PUBLIC_ORIGIN", "http://localhost:3000");
    const fetchImplementation = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchImplementation);

    const response = await validateCode(
      validationRequest("BOWL7K2A", {
        turnstileToken: "browser-token",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      eligible: false,
      error: "TURNSTILE_UNAVAILABLE",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).not.toContain(
      "ygf_pending_claim=",
    );
  });

  it("returns a bounded Retry-After after the account validation ceiling", async () => {
    let cookie: string | undefined;
    let response: Response | undefined;
    for (let index = 0; index < 11; index += 1) {
      response = await validateCode(
        validationRequest("NOTREAL1", { cookie }),
      );
      const rateCookie =
        /ygf_rate_session=([^;]+)/u.exec(
          response.headers.get("set-cookie") ?? "",
        )?.[1];
      if (rateCookie) {
        cookie = `ygf_rate_session=${rateCookie}`;
      }
    }

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("missing validation response");
    }
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(
      0,
    );
    expect(Number(response.headers.get("retry-after"))).toBeLessThanOrEqual(
      300,
    );
    await expect(response.json()).resolves.toEqual({
      eligible: false,
    });
  });

  it("returns a browser-safe balance from the composed route", async () => {
    await getCampaignRepository().redeemCode({
      code: "BOWL7K2A",
      idempotencyKey: "route-test-claim",
      userId: "demo-user",
    });

    const response = await getBalance();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(serialized).toContain('"remainingBalance":3000');
    expect(serialized).not.toContain('"userId"');
    expect(serialized).not.toContain('"providerCommittedMicroUsd"');
  });

  it("lets the same demo account revalidate its redeemed code without another grant", async () => {
    await getCampaignRepository().redeemCode({
      code: "BOWL7K2A",
      idempotencyKey: "first-route-claim",
      userId: "demo-user",
    });

    const response = await validateCode(
      validationRequest("BOWL7K2A"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      eligible: true,
      requiresAnonymousSession: false,
    });
    expect(response.headers.get("set-cookie")).toMatch(
      /ygf_pending_claim=/,
    );
  });
});
