import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RedeemForm,
  redemptionErrorDestination,
  type RedeemFormSubmission,
} from "@/components/redeem-form";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("RedeemForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    history.replaceState(null, "", "/redeem#code=BOWL7K2A");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pre-fills a scanned receipt claim and removes it from browser history", async () => {
    await act(async () => {
      root.render(<RedeemForm submitClaim={vi.fn()} />);
    });

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Receipt code"]',
    );

    expect(input?.value).toBe("BOWL7K2A");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/redeem");
  });

  it("consumes a receipt QR opened while the redeem page is already mounted", async () => {
    history.replaceState(null, "", "/redeem");
    await act(async () => {
      root.render(<RedeemForm submitClaim={vi.fn()} />);
    });

    history.replaceState(null, "", "/redeem#code=SCAN8K2A");
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await Promise.resolve();
    });

    expect(
      container.querySelector<HTMLInputElement>('input[name="code"]')
        ?.value,
    ).toBe("SCAN8K2A");
    expect(window.location.hash).toBe("");
  });

  it("requires terms and submits only the code plus consent", async () => {
    const submitClaim = vi.fn<
      (submission: RedeemFormSubmission) => Promise<void>
    >(async () => undefined);

    await act(async () => {
      root.render(<RedeemForm submitClaim={submitClaim} />);
    });

    const form = container.querySelector("form");
    const consent = container.querySelector<HTMLInputElement>(
      'input[name="termsAccepted"]',
    );

    await act(async () => {
      form?.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(submitClaim).not.toHaveBeenCalled();

    await act(async () => {
      consent?.click();
    });
    await act(async () => {
      form?.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(submitClaim).toHaveBeenCalledWith({
      code: "BOWL7K2A",
      termsAccepted: true,
    });
    expect(
      Object.hasOwn(submitClaim.mock.calls[0]?.[0] ?? {}, "userId"),
    ).toBe(false);
  });

  it("creates an anonymous Supabase session only after eligibility, then claims immediately", async () => {
    const callOrder: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === "/api/code/validate") {
        callOrder.push("eligible");
        return Response.json({
          eligible: true,
          requiresAnonymousSession: true,
        });
      }
      if (url === "/api/redeem") {
        callOrder.push("redeem");
        return Response.json({ next: "/redeem/success" });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const createAnonymousSession = vi.fn(async () => {
      callOrder.push("anonymous-session");
    });
    const confirmPendingClaim = vi.fn(async () => {
      callOrder.push("redeem");
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <RedeemForm
          createAnonymousSession={createAnonymousSession}
          confirmPendingClaim={confirmPendingClaim}
        />,
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLInputElement>(
          'input[name="termsAccepted"]',
        )
        ?.click();
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(callOrder).toEqual([
      "eligible",
      "anonymous-session",
      "redeem",
    ]);
    expect(createAnonymousSession).toHaveBeenCalledTimes(1);
    expect(confirmPendingClaim).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/API key|model|Google|Apple/i);
  });

  it("never creates an anonymous user for an ineligible code", async () => {
    const createAnonymousSession = vi.fn(async () => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ eligible: false }, { status: 200 }),
      ),
    );

    await act(async () => {
      root.render(
        <RedeemForm createAnonymousSession={createAnonymousSession} />,
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLInputElement>(
          'input[name="termsAccepted"]',
        )
        ?.click();
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(createAnonymousSession).not.toHaveBeenCalled();
    expect(container.textContent).toContain("invalid or unavailable");
  });

  it("preserves the secured claim and shows manual sign-in only when anonymous auth is unavailable", async () => {
    const createAnonymousSession = vi.fn(async () => {
      throw new Error("ANONYMOUS_AUTH_UNAVAILABLE");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({
          eligible: true,
          requiresAnonymousSession: true,
        }),
      ),
    );

    await act(async () => {
      root.render(
        <RedeemForm createAnonymousSession={createAnonymousSession} />,
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLInputElement>(
          'input[name="termsAccepted"]',
        )
        ?.click();
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain(
      "Your secured claim is still ready",
    );
    expect(
      container
        .querySelector<HTMLAnchorElement>(
          'a[href="/auth?next=/redeem&error=anonymous"]',
        )
        ?.textContent,
    ).toContain("Use account sign-in");
  });

  it("finishes a saved post-auth claim with one confirmation tap", async () => {
    const confirmPendingClaim = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <RedeemForm
          confirmPendingClaim={confirmPendingClaim}
          pendingClaimReady
        />,
      );
    });

    expect(
      container.querySelector('input[name="code"]'),
    ).toBeNull();
    expect(
      container.querySelector('input[name="termsAccepted"]'),
    ).toBeNull();

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) =>
        candidate.textContent === "Confirm and add credits",
    );
    await act(async () => {
      button?.click();
    });

    expect(confirmPendingClaim).toHaveBeenCalledTimes(1);
  });

  it("routes terminal redemption errors without exposing internals", () => {
    expect(redemptionErrorDestination("CODE_ALREADY_REDEEMED")).toBe(
      "/already-used",
    );
    expect(redemptionErrorDestination("CODE_EXPIRED")).toBe("/expired");
    expect(redemptionErrorDestination("CODE_REVOKED")).toBe("/revoked");
    expect(redemptionErrorDestination("REDEMPTION_THROTTLED")).toBe(
      "/blocked",
    );
    expect(redemptionErrorDestination("database row 42")).toBeNull();
  });

  it("shows a retryable outage without calling it an invalid code", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(
        { eligible: false },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<RedeemForm />);
    });
    await act(async () => {
      container
        .querySelector<HTMLInputElement>(
          'input[name="termsAccepted"]',
        )
        ?.click();
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Claims are temporarily unavailable",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        code: "BOWL7K2A",
        termsAccepted: true,
      }),
    );
  });
});
