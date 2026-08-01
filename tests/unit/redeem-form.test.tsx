import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  usePathname: vi.fn(() => "/redeem"),
  useRouter: vi.fn(),
}));
const turnstileScriptCallbacks = vi.hoisted(() => ({
  onError: undefined as (() => void) | undefined,
  onLoad: undefined as (() => void) | undefined,
  onReady: undefined as (() => void) | undefined,
}));

vi.mock("next/navigation", () => ({
  usePathname: navigationMocks.usePathname,
  useRouter: navigationMocks.useRouter,
}));
vi.mock("next/script", () => ({
  default: ({
    onError,
    onLoad,
    onReady,
    src,
  }: {
    onError: () => void;
    onLoad: () => void;
    onReady: () => void;
    src: string;
  }) => {
    turnstileScriptCallbacks.onError = onError;
    turnstileScriptCallbacks.onLoad = onLoad;
    turnstileScriptCallbacks.onReady = onReady;
    return <div data-src={src} data-testid="turnstile-script" />;
  },
}));

import {
  CampaignLanguageProvider,
  CampaignLanguageSelector,
} from "@/components/campaign-language";
import {
  RedeemForm,
  RedeemPageContent,
  redemptionErrorDestination,
  type RedeemFormSubmission,
} from "@/components/redeem-form";
import { campaignLocales } from "@/lib/i18n/campaign";
import { redeemCopy } from "@/lib/i18n/redeem";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("RedeemForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigationMocks.refresh.mockReset();
    navigationMocks.useRouter.mockReset();
    navigationMocks.useRouter.mockReturnValue({
      refresh: navigationMocks.refresh,
    });
    turnstileScriptCallbacks.onError = undefined;
    turnstileScriptCallbacks.onLoad = undefined;
    turnstileScriptCallbacks.onReady = undefined;
    localStorage.clear();
    history.replaceState(null, "", "/redeem#code=BOWL7K2A");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete window.turnstile;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pre-fills a scanned card claim, clears the URL secret, and explains the next tap", async () => {
    await act(async () => {
      root.render(<RedeemForm submitClaim={vi.fn()} />);
    });

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="8-character card code"]',
    );

    expect(input?.value).toBe("BOWL7K2A");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/redeem");
    expect(container.textContent).toContain(
      "Code scanned ✓ — review the terms, then unlock your credits.",
    );
  });

  it("scrubs and refuses a legacy query claim instead of consuming a logged URL secret", async () => {
    history.replaceState(
      null,
      "",
      "/redeem?code=BOWL7K2A&termsAccepted=on&source=legacy",
    );

    await act(async () => {
      root.render(<RedeemForm submitClaim={vi.fn()} />);
    });

    expect(
      container.querySelector<HTMLInputElement>('input[name="code"]')
        ?.value,
    ).toBe("");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="termsAccepted"]',
      )?.checked,
    ).toBe(false);
    expect(window.location.pathname).toBe("/redeem");
    expect(window.location.search).toBe("?source=legacy");
    expect(window.location.hash).toBe("");
  });

  it("consumes a private QR opened while the redeem page is already mounted", async () => {
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

  it("keeps native form controls disabled in the server markup", () => {
    const markup = renderToString(<RedeemForm />);
    const serverContainer = document.createElement("div");
    serverContainer.innerHTML = markup;

    expect(
      serverContainer.querySelector<HTMLInputElement>(
        'input[name="code"]',
      )?.disabled,
    ).toBe(true);
    expect(
      serverContainer.querySelector<HTMLInputElement>(
        'input[name="termsAccepted"]',
      )?.disabled,
    ).toBe(true);
    expect(serverContainer.querySelector("button")?.disabled).toBe(true);
  });

  it("places consent before the concrete CTA and has no default alert", async () => {
    await act(async () => {
      root.render(<RedeemForm submitClaim={vi.fn()} />);
    });

    const consent = container.querySelector<HTMLInputElement>(
      'input[name="termsAccepted"]',
    );
    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );

    expect(consent).not.toBeNull();
    expect(submit?.textContent).toBe("Unlock 3,000 credits");
    expect(
      consent && submit
        ? consent.compareDocumentPosition(submit)
        : Node.DOCUMENT_POSITION_PRECEDING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const legalLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        'a[href="/terms"], a[href="/privacy"]',
      ),
    );
    expect(legalLinks).toHaveLength(2);
    expect(
      legalLinks.every(
        (link) =>
          link.target === "_blank" &&
          link.rel.includes("noopener") &&
          link.rel.includes("noreferrer"),
      ),
    ).toBe(true);
    expect(container.textContent).toContain("opens in a new tab");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("validates the card code before terms and focuses the invalid field", async () => {
    history.replaceState(null, "", "/redeem");
    await act(async () => {
      root.render(<RedeemForm submitClaim={vi.fn()} />);
    });

    const form = container.querySelector("form");
    const input = container.querySelector<HTMLInputElement>(
      'input[name="code"]',
    );

    await act(async () => {
      form?.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    });

    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toBe("Enter the 8-character card code.");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toContain(alert?.id);
    expect(document.activeElement).toBe(input);
    expect(alert?.textContent).not.toContain("Agree");
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
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Agree to the promotional terms and privacy notice to continue.",
    );
    expect(
      document
        .querySelector('[data-testid="terms-consent-error"]')
        ?.classList.contains("redeem-form__message--terms-popout"),
    ).toBe(true);
    expect(document.activeElement).toBe(consent);

    await act(async () => {
      consent?.click();
    });
    expect(
      document.querySelector('[data-testid="terms-consent-error"]'),
    ).toBeNull();
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

  it("requires a completed Turnstile token only when the server enables it", async () => {
    const submitClaim = vi.fn<
      (submission: RedeemFormSubmission) => Promise<void>
    >(async () => undefined);
    let renderOptions:
      | Parameters<NonNullable<Window["turnstile"]>["render"]>[1]
      | undefined;
    window.turnstile = {
      remove: vi.fn(),
      render: vi.fn((_container, options) => {
        renderOptions = options;
        return "redeem-widget";
      }),
      reset: vi.fn(),
    };
    await act(async () => {
      root.render(
        <RedeemForm
          submitClaim={submitClaim}
          turnstileRequired
          turnstileSiteKey="site_key_123"
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
    });

    expect(submitClaim).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Complete the security check",
    );

    expect(renderOptions).toMatchObject({
      action: "redeem-code",
      language: "en",
      sitekey: "site_key_123",
    });
    await act(async () => {
      renderOptions?.callback("single-use-browser-token");
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

    expect(submitClaim).toHaveBeenCalledWith({
      code: "BOWL7K2A",
      termsAccepted: true,
      turnstileToken: "single-use-browser-token",
    });
    expect(
      container.querySelector(".redeem-form__turnstile"),
    ).not.toBeNull();
  });

  it("resets the exact explicit Turnstile widget after a failed submission", async () => {
    const reset = vi.fn();
    let renderOptions:
      | Parameters<NonNullable<Window["turnstile"]>["render"]>[1]
      | undefined;
    window.turnstile = {
      remove: vi.fn(),
      render: vi.fn((_container, options) => {
        renderOptions = options;
        return "redeem-widget";
      }),
      reset,
    };
    const submitClaim = vi.fn(async () => {
      throw new Error("CODE_INVALID");
    });

    await act(async () => {
      root.render(
        <RedeemForm
          submitClaim={submitClaim}
          turnstileRequired
          turnstileSiteKey="site_key_123"
        />,
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLInputElement>(
          'input[name="termsAccepted"]',
        )
        ?.click();
      renderOptions?.callback("single-use-browser-token");
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

    expect(reset).toHaveBeenCalledWith("redeem-widget");
    expect(container.textContent).toContain("invalid or unavailable");
  });

  it("ignores a delayed reset token and keeps a server-reported Turnstile outage blocked", async () => {
    const reset = vi.fn();
    let renderOptions:
      | Parameters<NonNullable<Window["turnstile"]>["render"]>[1]
      | undefined;
    window.turnstile = {
      remove: vi.fn(),
      render: vi.fn((_container, options) => {
        renderOptions = options;
        return "redeem-widget";
      }),
      reset,
    };
    const submitClaim = vi.fn<
      (submission: RedeemFormSubmission) => Promise<void>
    >(async () => {
      throw new Error("TURNSTILE_UNAVAILABLE");
    });

    await act(async () => {
      root.render(
        <RedeemForm
          submitClaim={submitClaim}
          turnstileRequired
          turnstileSiteKey="site_key_123"
        />,
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLInputElement>(
          'input[name="termsAccepted"]',
        )
        ?.click();
      renderOptions?.callback("single-use-browser-token");
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

    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(submitClaim).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledWith("redeem-widget");
    expect(submit?.disabled).toBe(true);
    expect(container.textContent).toContain(
      redeemCopy.en.form.errors.verificationUnavailable,
    );

    await act(async () => {
      renderOptions?.callback("delayed-token-after-reset");
    });
    expect(submit?.disabled).toBe(true);
    expect(container.textContent).toContain(
      redeemCopy.en.form.errors.verificationUnavailable,
    );

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(submitClaim).toHaveBeenCalledOnce();
    expect(submitClaim.mock.calls[0]?.[0]).toMatchObject({
      turnstileToken: "single-use-browser-token",
    });
    expect(container.textContent).toContain(
      redeemCopy.en.form.errors.verificationUnavailable,
    );
  });

  it("fails visibly and disables submission when Turnstile is enabled but misconfigured", async () => {
    await act(async () => {
      root.render(
        <RedeemForm turnstileRequired turnstileSiteKey={null} />,
      );
    });

    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(true);
    expect(
      container.querySelector(
        ".redeem-form__verification-unavailable",
      )?.textContent,
    ).toContain("temporarily unavailable");
  });

  it("keeps a blocked Turnstile script unavailable and makes no API request", async () => {
    delete window.turnstile;
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <RedeemForm
          turnstileRequired
          turnstileSiteKey="site_key_123"
        />,
      );
    });

    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(submit?.disabled).toBe(true);

    await act(async () => turnstileScriptCallbacks.onError?.());

    expect(submit?.disabled).toBe(true);
    expect(container.textContent).toContain(
      redeemCopy.en.form.errors.verificationUnavailable,
    );

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
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(submit?.disabled).toBe(true);
    expect(container.textContent).toContain(
      redeemCopy.en.form.errors.verificationUnavailable,
    );
  });

  it("locks duplicate valid submissions before React can repaint", async () => {
    let releaseSubmission: (() => void) | undefined;
    const submitClaim = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSubmission = resolve;
        }),
    );

    await act(async () => {
      root.render(<RedeemForm submitClaim={submitClaim} />);
    });
    await act(async () => {
      container
        .querySelector<HTMLInputElement>(
          'input[name="termsAccepted"]',
        )
        ?.click();
    });

    const form = container.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
      form?.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(submitClaim).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseSubmission?.();
      await Promise.resolve();
    });
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
    const codeInput = container.querySelector<HTMLInputElement>(
      'input[name="code"]',
    );
    expect(codeInput?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(codeInput);
  });

  it("does not present an origin rejection as a Turnstile failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json(
          { eligible: false, error: "ORIGIN_FORBIDDEN" },
          { status: 403 },
        ),
      ),
    );

    await act(async () => {
      root.render(<RedeemForm />);
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
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      redeemCopy.en.form.errors.generic,
    );
    expect(container.textContent).not.toContain(
      redeemCopy.en.form.errors.verificationRequired,
    );
  });

  it.each(campaignLocales)(
    "maps a paused validation response to explicit localized guidance in %s",
    async (locale) => {
      const createAnonymousSession = vi.fn(async () => undefined);
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async () =>
          Response.json(
            { eligible: false, error: "REDEMPTION_PAUSED" },
            { status: 503 },
          ),
        ),
      );

      await act(async () => {
        root.render(
          <CampaignLanguageProvider initialLocale={locale}>
            <RedeemForm
              createAnonymousSession={createAnonymousSession}
            />
          </CampaignLanguageProvider>,
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
      expect(container.textContent).toContain(
        redeemCopy[locale].form.errors.redemptionPaused,
      );
    },
  );

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
        candidate.textContent === "Confirm and unlock credits",
    );
    await act(async () => {
      button?.click();
    });

    expect(confirmPendingClaim).toHaveBeenCalledTimes(1);
  });

  it.each(campaignLocales)(
    "shows the localized account card-limit error for a pending claim in %s",
    async (locale) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: "ACCOUNT_GRANT_LIMIT_REACHED" },
          { status: 409 },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      await act(async () => {
        root.render(
          <CampaignLanguageProvider initialLocale={locale}>
            <RedeemForm pendingClaimReady />
          </CampaignLanguageProvider>,
        );
      });
      await act(async () => {
        container.querySelector("form")?.dispatchEvent(
          new SubmitEvent("submit", {
            bubbles: true,
            cancelable: true,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        redeemCopy[locale].form.errors.accountGrantLimitReached,
      );
    },
  );

  it("updates the complete redeem experience in all five campaign languages", async () => {
    const localizedExpectations = {
      en: {
        codeLabel: "8-character card code",
        destination: "to this wallet",
        rule: "The same code never regrants",
        title: "Unlock 3,000 AI Credits",
      },
      zh: {
        codeLabel: "卡片上的 8 位兑换码",
        destination: "向此钱包",
        rule: "同一兑换码不会重复发放",
        title: "解锁 3,000 AI Credits",
      },
      es: {
        codeLabel: "Código de 8 caracteres",
        destination: "a esta cartera",
        rule: "El mismo código nunca vuelve a añadir créditos",
        title: "Desbloquea 3,000 créditos de IA",
      },
      fr: {
        codeLabel: "Code de carte à 8 caractères",
        destination: "à ce portefeuille",
        rule: "Le même code n’ajoute jamais de nouveaux crédits",
        title: "Débloquez 3 000 crédits IA",
      },
      ru: {
        codeLabel: "8-значный код карты",
        destination: "в этот кошелёк",
        rule: "Тот же код не начисляет их повторно",
        title: "Получите 3 000 AI Credits",
      },
    } as const;

    await act(async () => {
      root.render(
        <CampaignLanguageProvider>
          <CampaignLanguageSelector label="Language" />
          <RedeemPageContent />
        </CampaignLanguageProvider>,
      );
    });

    for (const [locale, expectation] of Object.entries(
      localizedExpectations,
    )) {
      const selector = container.querySelector<HTMLSelectElement>(
        ".language-selector select",
      );
      expect(selector).not.toBeNull();

      await act(async () => {
        if (selector) {
          selector.value = locale;
          selector.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        }
      });

      expect(container.querySelector("h1")?.textContent).toBe(
        expectation.title,
      );
      expect(
        container.querySelector<HTMLInputElement>(
          `input[aria-label="${expectation.codeLabel}"]`,
        ),
      ).not.toBeNull();
      expect(container.textContent).toContain(expectation.destination);
      expect(container.textContent).toContain(expectation.rule);
    }
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
    expect(
      redemptionErrorDestination("ACCOUNT_GRANT_LIMIT_REACHED"),
    ).toBeNull();
    expect(redemptionErrorDestination("database row 42")).toBeNull();
  });

  it("shows a retryable outage without calling it an invalid code", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response("<html>temporarily unavailable</html>", {
        headers: { "content-type": "text/html" },
        status: 503,
      }),
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

  it("shows an explicit paused-claims message without redirecting a pending claim", async () => {
    const confirmPendingClaim = vi.fn(async () => {
      throw new Error("REDEMPTION_PAUSED");
    });
    await act(async () => {
      root.render(
        <RedeemForm
          confirmPendingClaim={confirmPendingClaim}
          pendingClaimReady
        />,
      );
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

    expect(confirmPendingClaim).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(
      "Claims are temporarily paused",
    );
  });
});
