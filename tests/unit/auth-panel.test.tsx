import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  createAuthBrowserClient: () => ({
    auth: authMocks,
  }),
}));

import { AuthPanel } from "@/components/auth-panel";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ENABLED_PROVIDERS = {
  apple: true,
  google: true,
} as const;

describe("AuthPanel anonymous upgrade", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.linkIdentity.mockResolvedValue({
      data: {
        provider: "google",
        url: "https://accounts.google.com/oauth",
      },
      error: null,
    });
    authMocks.signInWithOAuth.mockResolvedValue({
      data: {
        provider: "google",
        url: "https://accounts.google.com/oauth",
      },
      error: null,
    });
    authMocks.signInWithOtp.mockResolvedValue({
      data: { messageId: null, session: null, user: null },
      error: null,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("links the existing anonymous user instead of signing into another account", async () => {
    await act(async () => {
      root.render(
        <AuthPanel
          isAnonymous
          mode="supabase"
          nextPath="/connect/agent"
          providerAvailability={ENABLED_PROVIDERS}
        />,
      );
    });
    const google = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Link Google");

    await act(async () => {
      google?.click();
      await Promise.resolve();
    });

    expect(authMocks.linkIdentity).toHaveBeenCalledWith({
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fconnect%2Fagent`,
      },
      provider: "google",
    });
    expect(authMocks.signInWithOAuth).not.toHaveBeenCalled();
    expect(authMocks.signInWithOtp).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="email"]')).toBeNull();
  });

  it.each([
    ["google", "Continue with Google"],
    ["apple", "Continue with Apple"],
  ] as const)(
    "starts a real %s OAuth sign-in with an allowlisted callback",
    async (provider, label) => {
      await act(async () => {
        root.render(
          <AuthPanel
            mode="supabase"
            nextPath="/connect/agent"
            providerAvailability={ENABLED_PROVIDERS}
          />,
        );
      });
      const button = Array.from(
        container.querySelectorAll("button"),
      ).find((candidate) => candidate.textContent === label);

      await act(async () => {
        button?.click();
        await Promise.resolve();
      });

      expect(authMocks.signInWithOAuth).toHaveBeenCalledWith({
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Fconnect%2Fagent`,
        },
        provider,
      });
      expect(authMocks.linkIdentity).not.toHaveBeenCalled();
    },
  );

  it("sanitizes a tampered callback destination before starting OAuth", async () => {
    await act(async () => {
      root.render(
        <AuthPanel
          mode="supabase"
          nextPath="//attacker.example"
          providerAvailability={ENABLED_PROVIDERS}
        />,
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(
          (candidate) =>
            candidate.textContent === "Continue with Google",
        )
        ?.click();
      await Promise.resolve();
    });

    expect(authMocks.signInWithOAuth).toHaveBeenCalledWith({
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fredeem`,
      },
      provider: "google",
    });
  });

  it("shows an accessible error and re-enables providers when OAuth cannot start", async () => {
    authMocks.signInWithOAuth.mockRejectedValue(
      new Error("network unavailable"),
    );
    await act(async () => {
      root.render(
        <AuthPanel
          mode="supabase"
          nextPath="/connect/agent"
          providerAvailability={ENABLED_PROVIDERS}
        />,
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(
          (candidate) =>
            candidate.textContent === "Continue with Apple",
        )
        ?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
      /sign-in could not start/i,
    );
    expect(
      Array.from(container.querySelectorAll("button")).every(
        (button) => !button.disabled,
      ),
    ).toBe(true);
  });

  it("keeps the guest session intact when provider linking reports an existing identity", async () => {
    await act(async () => {
      root.render(
        <AuthPanel
          isAnonymous
          mode="supabase"
          nextPath="/connect/agent"
          providerAvailability={ENABLED_PROVIDERS}
        />,
      );
    });

    authMocks.linkIdentity.mockResolvedValueOnce({
      data: { provider: "google", url: null },
      error: {
        code: "identity_already_exists",
        message: "private provider detail",
      },
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Link Google")
        ?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
      /guest Credits were not moved/i,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
      /may no longer be accessible from this browser/i,
    );
    expect(container.textContent).not.toContain("private provider detail");
    expect(
      Array.from(container.querySelectorAll("button")).every(
        (button) => !button.disabled,
      ),
    ).toBe(true);
    expect(authMocks.linkIdentity).toHaveBeenCalledTimes(1);
    expect(authMocks.signInWithOAuth).not.toHaveBeenCalled();
    expect(authMocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("fails closed with visible provider buttons and an accessible Magic Link fallback", async () => {
    await act(async () => {
      root.render(
        <AuthPanel mode="supabase" nextPath="/wallet" />,
      );
    });

    const google = Array.from(
      container.querySelectorAll("button"),
    ).find(
      (candidate) =>
        candidate.textContent === "Continue with Google",
    );
    const apple = Array.from(
      container.querySelectorAll("button"),
    ).find(
      (candidate) =>
        candidate.textContent === "Continue with Apple",
    );
    const status = container.querySelector('[role="status"]');

    expect(google?.disabled).toBe(true);
    expect(apple?.disabled).toBe(true);
    expect(google?.getAttribute("aria-describedby")).toBe(
      status?.id,
    );
    expect(apple?.getAttribute("aria-describedby")).toBe(
      status?.id,
    );
    expect(status?.textContent).toMatch(
      /email Magic Link below/i,
    );
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    expect(authMocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("does not offer Magic Link as a guest-wallet linking fallback", async () => {
    await act(async () => {
      root.render(
        <AuthPanel
          isAnonymous
          mode="supabase"
          nextPath="/connect/agent"
        />,
      );
    });

    expect(container.querySelector('[role="status"]')?.textContent).toMatch(
      /guest wallet remains safe and usable/i,
    );
    expect(container.textContent).not.toMatch(/Magic Link/i);
    expect(container.querySelector('input[type="email"]')).toBeNull();
  });

  it("disables only the unavailable provider and leaves enabled OAuth behavior unchanged", async () => {
    await act(async () => {
      root.render(
        <AuthPanel
          mode="supabase"
          nextPath="/wallet"
          providerAvailability={{ apple: true, google: false }}
        />,
      );
    });

    const google = Array.from(
      container.querySelectorAll("button"),
    ).find(
      (candidate) =>
        candidate.textContent === "Continue with Google",
    );
    const apple = Array.from(
      container.querySelectorAll("button"),
    ).find(
      (candidate) =>
        candidate.textContent === "Continue with Apple",
    );

    expect(google?.disabled).toBe(true);
    expect(apple?.disabled).toBe(false);

    await act(async () => {
      apple?.click();
      await Promise.resolve();
    });

    expect(authMocks.signInWithOAuth).toHaveBeenCalledWith({
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fwallet`,
      },
      provider: "apple",
    });
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(
      /Google sign-in isn’t available yet/i,
    );
  });
});
