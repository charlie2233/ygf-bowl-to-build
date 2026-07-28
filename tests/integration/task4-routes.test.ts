import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getBalance } from "@/app/api/balance/route";
import { POST as validateCode } from "@/app/api/code/validate/route";
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

function validationRequest(code: string) {
  return new Request(
    "http://localhost:3000/api/code/validate",
    {
      body: JSON.stringify({
        code,
        termsAccepted: true,
      }),
      headers: {
        "content-type": "application/json",
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
    expect(invalid.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cross-origin, unexpected, and oversized validation requests", async () => {
    const crossOrigin = validationRequest("BOWL7K2A");
    crossOrigin.headers.set("origin", "https://attacker.example");
    expect((await validateCode(crossOrigin)).status).toBe(403);

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
          filler: "x".repeat(600),
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
});
