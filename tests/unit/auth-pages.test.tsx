import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
const taskWorkflowMocks = vi.hoisted(() => ({
  getEarliestCompletedTask: vi.fn(),
}));

vi.mock("next/navigation", () => navigationMocks);
vi.mock("@/lib/auth/runtime", () => ({
  resolveAuthRuntime: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  createAuthServerClient: vi.fn(),
}));
vi.mock("@/lib/auth/user", () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/lib/repositories", () => ({
  getCampaignRepository: vi.fn(),
}));
vi.mock("@/lib/repositories/task-workflow-repository", () => ({
  getTaskWorkflowRepository: () => ({
    getEarliestCompletedTask:
      taskWorkflowMocks.getEarliestCompletedTask,
  }),
}));

import { GET as authCallback } from "@/app/auth/callback/route";
import AgentConnectPage from "@/app/connect/agent/page";
import AuthPage from "@/app/auth/page";
import RedeemSuccessPage from "@/app/redeem/success/page";
import SharePage from "@/app/share/page";
import WalletPage from "@/app/wallet/page";
import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createAuthServerClient } from "@/lib/auth/server";
import { getAuthenticatedUser } from "@/lib/auth/user";
import type { CreditWallet } from "@/lib/campaign/types";
import { CampaignDomainError } from "@/lib/campaign/types";
import { getCampaignRepository } from "@/lib/repositories";

const ACTIVE_WALLET: CreditWallet = {
  createdAt: "2026-07-27T12:00:00.000Z",
  expiresAt: "2099-08-10T12:00:00.000Z",
  id: "wallet-1",
  initialBalance: 3000,
  providerCommittedMicroUsd: 0,
  providerReservedMicroUsd: 0,
  remainingBalance: 3000,
  reservedBalance: 0,
  userId: "user-1",
};

describe("authentication pages", () => {
  const exchangeCodeForSession = vi.fn();
  const getWallet =
    vi.fn<ReturnType<typeof getCampaignRepository>["getWallet"]>();

  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockReset();
    getWallet.mockReset();
    taskWorkflowMocks.getEarliestCompletedTask.mockReset();
    taskWorkflowMocks.getEarliestCompletedTask.mockResolvedValue(null);
    exchangeCodeForSession.mockResolvedValue({ error: null });
    vi.mocked(createAuthServerClient).mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);
    vi.mocked(resolveAuthRuntime).mockReturnValue({ mode: "demo" });
    vi.mocked(getCampaignRepository).mockReturnValue({
      getWallet,
      redeemCode: vi.fn(),
      validateCode: vi.fn(),
    });
  });

  it("shows an accessible callback error and falls back from an unsafe next path", async () => {
    const html = renderToStaticMarkup(
      await AuthPage({
        searchParams: Promise.resolve({
          error: "callback",
          next: "/\\evil.example",
        }),
      }),
    );
    document.body.innerHTML = html;

    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /couldn’t complete sign-in/i,
    );
    expect(
      document.querySelector<HTMLAnchorElement>("a")?.getAttribute("href"),
    ).toBe("/redeem");
  });

  it("keeps the callback on-origin when next decodes to a backslash host", async () => {
    const response = await authCallback(
      new NextRequest(
        "https://build.ygf.example/auth/callback?code=valid&next=%2F%5Cevil.example",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://build.ygf.example/redeem",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid");
  });

  it("preserves the exact Agent-upgrade destination across the auth page and callback", async () => {
    vi.mocked(resolveAuthRuntime).mockReturnValue({
      mode: "supabase",
      publishableKey: "publishable",
      serviceKey: "service",
      url: "https://project.supabase.co",
    });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "anonymous-user",
      isAnonymous: true,
    });

    const page = await AuthPage({
      searchParams: Promise.resolve({
        next: "/connect/agent",
        upgrade: "1",
      }),
    });
    const panel = page.props.children as ReactElement<{
      nextPath: string;
    }>;
    expect(panel.props.nextPath).toBe("/connect/agent");

    const response = await authCallback(
      new NextRequest(
        "https://build.ygf.example/auth/callback?code=valid&next=/connect/agent",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://build.ygf.example/connect/agent",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid");
  });

  it("redirects a failed callback to the fixed accessible error state", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error("invalid callback"),
    });

    const response = await authCallback(
      new NextRequest(
        "https://build.ygf.example/auth/callback?code=invalid&next=/wallet",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://build.ygf.example/auth?error=callback",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
  });

  it("keeps a missing-code callback private without touching auth", async () => {
    const response = await authCallback(
      new NextRequest(
        "https://build.ygf.example/auth/callback?next=/wallet",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://build.ygf.example/auth?error=callback",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(createAuthServerClient).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated success-page visitor through sign-in", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    await expect(RedeemSuccessPage()).rejects.toThrow(
      "REDIRECT:/auth?next=/wallet",
    );
  });

  it("redirects an authenticated visitor without a wallet to redemption", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "user-1",
      isAnonymous: false,
    });
    getWallet.mockRejectedValue(
      new CampaignDomainError("WALLET_NOT_FOUND"),
    );

    await expect(RedeemSuccessPage()).rejects.toThrow("REDIRECT:/redeem");
  });

  it("redirects an expired wallet away from the active success state", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "user-1",
      isAnonymous: false,
    });
    getWallet.mockResolvedValue({
      ...ACTIVE_WALLET,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    await expect(RedeemSuccessPage()).rejects.toThrow("REDIRECT:/expired");
  });

  it("renders success only for an authenticated visitor with an active wallet", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "user-1",
      isAnonymous: false,
    });
    getWallet.mockResolvedValue(ACTIVE_WALLET);

    const html = renderToStaticMarkup(await RedeemSuccessPage());

    expect(html).toContain("Your Build Credits are ready");
    expect(getWallet).toHaveBeenCalledWith({ userId: "user-1" });
    expect(navigationMocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps wallet data fetching on the server while rendering the customer workspace", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "user-1",
      isAnonymous: false,
    });
    getWallet.mockResolvedValue(ACTIVE_WALLET);

    const page = await WalletPage();
    const clientBoundaryPayload = JSON.stringify(page);
    const html = renderToStaticMarkup(page);

    expect(html).toContain("What will you build first?");
    expect(html).toContain("3,000");
    expect(html).toContain('href="/task/study?model=best"');
    expect(clientBoundaryPayload).not.toContain("wallet-1");
    expect(clientBoundaryPayload).not.toContain("user-1");
    expect(clientBoundaryPayload).not.toContain(
      "providerCommittedMicroUsd",
    );
    expect(clientBoundaryPayload).not.toContain(
      "providerReservedMicroUsd",
    );
    expect(getWallet).toHaveBeenCalledWith({ userId: "user-1" });
    expect(navigationMocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps Agent setup behind an authenticated, active wallet", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    await expect(AgentConnectPage()).rejects.toThrow(
      "REDIRECT:/auth?next=/connect/agent",
    );

    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "user-1",
      isAnonymous: false,
    });
    getWallet.mockResolvedValue(ACTIVE_WALLET);
    const html = renderToStaticMarkup(await AgentConnectPage());

    expect(html).toContain("Connect your own Agent");
    expect(html).toContain("Use YGF AI instead");
    expect(html).toContain("Developer API key");
    expect(getWallet).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("routes anonymous wallet users to account linking before Agent setup", async () => {
    vi.mocked(resolveAuthRuntime).mockReturnValue({
      mode: "supabase",
      publishableKey: "publishable",
      serviceKey: "service",
      url: "https://project.supabase.co",
    });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "anonymous-user",
      isAnonymous: true,
    });

    await expect(AgentConnectPage()).rejects.toThrow(
      "REDIRECT:/auth?next=/connect/agent&upgrade=1",
    );
  });

  it("renders anonymous account linking without an unsafe magic-link takeover path", async () => {
    vi.mocked(resolveAuthRuntime).mockReturnValue({
      mode: "supabase",
      publishableKey: "publishable",
      serviceKey: "service",
      url: "https://project.supabase.co",
    });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "anonymous-user",
      isAnonymous: true,
    });

    const html = renderToStaticMarkup(
      await AuthPage({
        searchParams: Promise.resolve({
          next: "/connect/agent",
          upgrade: "1",
        }),
      }),
    );

    expect(html).toContain("Upgrade to connect an Agent");
    expect(html).toContain("clearing this browser");
    expect(html).toContain("Link Google");
    expect(html).toContain("Link Apple");
    expect(html).not.toContain("Email me a sign-in link");
  });

  it("gates share cards to an active wallet while allowing anonymous wallet users", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    await expect(SharePage()).rejects.toThrow("REDIRECT:/redeem");

    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "anonymous-user",
      isAnonymous: true,
    });
    getWallet.mockRejectedValue(
      new CampaignDomainError("WALLET_NOT_FOUND"),
    );
    await expect(SharePage()).rejects.toThrow("REDIRECT:/redeem");

    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "anonymous-user",
      isAnonymous: true,
    });
    getWallet.mockResolvedValue({
      ...ACTIVE_WALLET,
      expiresAt: "2020-01-01T00:00:00.000Z",
      userId: "anonymous-user",
    });
    await expect(SharePage()).rejects.toThrow("REDIRECT:/expired");

    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "anonymous-user",
      isAnonymous: true,
    });
    getWallet.mockResolvedValue({
      ...ACTIVE_WALLET,
      userId: "anonymous-user",
    });
    taskWorkflowMocks.getEarliestCompletedTask.mockResolvedValue(null);
    const html = renderToStaticMarkup(await SharePage());
    expect(html).toContain("Create your check-in card");
    expect(
      taskWorkflowMocks.getEarliestCompletedTask,
    ).toHaveBeenCalledWith({ userId: "anonymous-user" });
  });
});
