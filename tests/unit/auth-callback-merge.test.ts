// @vitest-environment node

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
  applyTo: vi.fn((response: NextResponse) => {
    response.cookies.set("sb-target-auth", "installed", {
      httpOnly: true,
      path: "/",
    });
    return response;
  }),
  exchange: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  normalExchange: vi.fn(),
  rpc: vi.fn(),
}));
const SOURCE_SESSION_ID =
  "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/auth/server", () => ({
  createAuthServerClient: () => ({
    auth: { exchangeCodeForSession: serverMocks.normalExchange },
  }),
  createBufferedAuthServerClient: () => ({
    applyTo: serverMocks.applyTo,
    client: {
      auth: {
        exchangeCodeForSession: serverMocks.exchange,
        getClaims: serverMocks.getClaims,
        getUser: serverMocks.getUser,
      },
    },
  }),
  createServiceRoleClient: () => ({ rpc: serverMocks.rpc }),
}));

import { GET } from "@/app/auth/callback/route";
import { createAccountMergeIntentSecret } from "@/lib/auth/account-merge-intent";

function mergeRequest(
  provider: "apple" | "google" = "google",
  value = createAccountMergeIntentSecret(
    provider,
    () => Buffer.alloc(32, provider === "google" ? 3 : 4),
  ).value,
) {
  return new NextRequest(
    "https://malatangai.test/auth/callback?code=oauth-code&next=/connect/agent",
    {
      headers: { cookie: `ygf_account_merge=${value}; sb-source=guest` },
    },
  );
}

describe("OAuth account merge callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverMocks.normalExchange.mockResolvedValue({ error: null });
    serverMocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          is_anonymous: true,
          session_id: SOURCE_SESSION_ID,
          sub: "source-user",
        },
      },
      error: null,
    });
    serverMocks.exchange.mockResolvedValue({ error: null });
    serverMocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "target-user",
          identities: [{ provider: "google" }],
          is_anonymous: false,
        },
      },
      error: null,
    });
    serverMocks.rpc.mockResolvedValue({
      data: [
        {
          credits_transferred: 3000,
          expires_at: "2026-08-14T12:00:00.000Z",
          remaining_balance: 6000,
        },
      ],
      error: null,
    });
  });

  it("installs the destination session only after the atomic merge succeeds", async () => {
    const response = await GET(mergeRequest());
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.headers.get("location")).toBe(
      "https://malatangai.test/connect/agent",
    );
    expect(serverMocks.rpc).toHaveBeenCalledWith(
      "consume_account_merge_intent",
      expect.objectContaining({
        p_provider: "google",
        p_source_session_id: SOURCE_SESSION_ID,
        p_target_user_id: "target-user",
        p_token_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    );
    expect(serverMocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      serverMocks.applyTo.mock.invocationCallOrder[0] ?? 0,
    );
    expect(setCookie).toContain("sb-target-auth=installed");
    expect(setCookie).toContain("ygf_account_merge=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("discards destination cookies and clears the merge bearer when the transaction fails", async () => {
    serverMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private merge failure" },
    });

    const response = await GET(mergeRequest());
    const text = response.headers.get("location") ?? "";

    expect(text).toBe(
      "https://malatangai.test/auth?error=callback&next=%2Fconnect%2Fagent",
    );
    expect(serverMocks.applyTo).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain(
      "ygf_account_merge=",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).not.toContain(
      "sb-target-auth",
    );
    expect(text).not.toContain("private merge failure");
  });

  it("clears a pending merge after provider cancellation so ordinary OAuth is not blocked", async () => {
    const request = new NextRequest(
      "https://malatangai.test/auth/callback?error=access_denied&next=/wallet",
      {
        headers: {
          cookie: `ygf_account_merge=${createAccountMergeIntentSecret(
            "google",
            () => Buffer.alloc(32, 8),
          ).value}`,
        },
      },
    );

    const response = await GET(request);

    expect(response.headers.get("location")).toContain(
      "/auth?error=callback",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "ygf_account_merge=",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(serverMocks.exchange).not.toHaveBeenCalled();
    expect(serverMocks.normalExchange).not.toHaveBeenCalled();
  });

  it("fails closed before persistence when the verified provider differs", async () => {
    serverMocks.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "target-user",
          identities: [{ provider: "apple" }],
          is_anonymous: false,
        },
      },
      error: null,
    });

    const response = await GET(mergeRequest("google"));

    expect(response.headers.get("location")).toContain(
      "/auth?error=callback",
    );
    expect(serverMocks.rpc).not.toHaveBeenCalled();
    expect(serverMocks.applyTo).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("clears malformed merge cookies without exchanging the OAuth code", async () => {
    const response = await GET(mergeRequest("google", "bad-cookie"));

    expect(response.headers.get("location")).toContain(
      "/auth?error=callback",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "ygf_account_merge=",
    );
    expect(serverMocks.exchange).not.toHaveBeenCalled();
    expect(serverMocks.normalExchange).not.toHaveBeenCalled();
  });

  it("keeps ordinary OAuth callbacks on the existing direct session path", async () => {
    const response = await GET(
      new NextRequest(
        "https://malatangai.test/auth/callback?code=normal&next=/wallet",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://malatangai.test/wallet",
    );
    expect(serverMocks.normalExchange).toHaveBeenCalledWith("normal");
    expect(serverMocks.getClaims).not.toHaveBeenCalled();
    expect(serverMocks.rpc).not.toHaveBeenCalled();
  });
});
