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
});
