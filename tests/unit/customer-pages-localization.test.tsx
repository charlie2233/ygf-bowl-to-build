import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const languageState = vi.hoisted(() => ({
  locale: "en" as "en" | "zh" | "es" | "fr" | "ru",
}));
const authMocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  resolveAuthRuntime: vi.fn(),
}));
const historyMocks = vi.hoisted(() => ({
  listHistory: vi.fn(),
}));
const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("@/components/campaign-language", () => ({
  useCampaignLanguage: () => ({
    locale: languageState.locale,
    setLocale: vi.fn(),
  }),
}));
vi.mock("@/lib/auth/client", () => ({
  createAuthBrowserClient: vi.fn(),
}));
vi.mock("@/lib/auth/runtime", () => ({
  resolveAuthRuntime: authMocks.resolveAuthRuntime,
}));
vi.mock("@/lib/auth/user", () => ({
  getAuthenticatedUser: authMocks.getAuthenticatedUser,
}));
vi.mock("@/lib/repositories/task-workflow-repository", () => ({
  getTaskWorkflowRepository: () => ({
    listHistory: historyMocks.listHistory,
  }),
}));
vi.mock("next/navigation", () => navigationMocks);

import AuthPage from "@/app/auth/page";
import HistoryPage from "@/app/history/page";
import { AuthPanel } from "@/components/auth-panel";
import {
  HistoryPageView,
  LocalizedRedemptionState,
  SharePageView,
} from "@/components/customer-page-views";
import { ShareCardBuilder } from "@/components/share/share-card-builder";
import {
  customerPagesCopy,
  type RedemptionStateKey,
} from "@/lib/i18n/customer-pages";
import { SHARE_CARD_FILENAME, SHARE_CARD_HERO_PATH } from "@/lib/share/card";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const locales = ["en", "zh", "es", "fr", "ru"] as const;
const terminalStates: readonly RedemptionStateKey[] = [
  "alreadyUsed",
  "expired",
  "revoked",
  "blocked",
];
const historySessions = [
  {
    createdAt: "2026-07-28T12:30:00.000Z",
    modelLabelKey: "balanced" as const,
    savedOutput: {
      sections: [
        {
          heading: "Saved section",
          items: ["Saved result"],
        },
      ],
      title: "Saved output",
    },
    status: "completed" as const,
    title: "Study helper",
  },
  {
    createdAt: "2026-07-28T13:30:00.000Z",
    modelLabelKey: "campaign" as const,
    status: "failed" as const,
    title: "Career helper",
  },
];

function readBlobAsText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error));
    reader.addEventListener("load", () =>
      resolve(typeof reader.result === "string" ? reader.result : ""),
    );
    reader.readAsText(blob);
  });
}

describe("remaining customer-page localization", () => {
  it("uses 杨国福 for every natural brand reference in Chinese customer copy", () => {
    const chinese = JSON.stringify(customerPagesCopy.zh);

    expect(chinese).toContain("杨国福");
    expect(chinese).not.toContain("YGF");
  });

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    languageState.locale = "en";
    authMocks.getAuthenticatedUser.mockReset();
    authMocks.resolveAuthRuntime.mockReset();
    authMocks.resolveAuthRuntime.mockReturnValue({ mode: "demo" });
    historyMocks.listHistory.mockReset();
    navigationMocks.redirect.mockClear();
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

  it.each(locales)(
    "renders terminal, auth, history, and share customer states in %s",
    (locale) => {
      languageState.locale = locale;
      const copy = customerPagesCopy[locale];

      for (const state of terminalStates) {
        const markup = renderToStaticMarkup(
          <LocalizedRedemptionState state={state} />,
        );
        expect(markup).toContain(copy.terminal[state].title);
        expect(markup).toContain(copy.terminal[state].actionLabel);
        expect(markup).toContain(
          state === "alreadyUsed"
            ? 'href="/wallet"'
            : 'href="/redeem"',
        );
        expect(markup).not.toContain("BOWL7K2A");
      }

      const demoAuth = renderToStaticMarkup(
        <AuthPanel mode="demo" nextPath="/wallet" />,
      );
      const anonymousAuth = renderToStaticMarkup(
        <AuthPanel
          isAnonymous
          mode="supabase"
          nextPath="/connect/agent"
        />,
      );
      const recoveryAuth = renderToStaticMarkup(
        <AuthPanel mode="supabase" nextPath="/wallet" />,
      );
      expect(demoAuth).toContain(copy.auth.demo.title);
      expect(demoAuth).toContain(copy.auth.demo.continue);
      expect(anonymousAuth).toContain(copy.auth.anonymous.title);
      expect(anonymousAuth).toContain(copy.auth.anonymous.google);
      expect(anonymousAuth).toContain(
        copy.auth.providerAvailability.anonymous.both,
      );
      expect(recoveryAuth).toContain(copy.auth.recovery.title);
      expect(recoveryAuth).toContain(copy.auth.recovery.emailSubmit);
      expect(recoveryAuth).toContain(
        copy.auth.providerAvailability.recovery.both,
      );

      const history = renderToStaticMarkup(
        <HistoryPageView
          agentEligible
          sessions={historySessions}
        />,
      );
      expect(history).toContain(copy.history.title);
      expect(history).toContain(copy.history.privacyDescription);
      expect(history).toContain(copy.history.statuses.completed);
      expect(history).toContain(copy.history.statuses.failed);
      expect(history).toContain(copy.history.resultNotSaved);
      expect(history).toContain(copy.history.agent.action);
      expect(history).toContain("Saved result");

      const share = renderToStaticMarkup(
        <SharePageView firstTaskType="study" />,
      );
      expect(share).toContain(copy.share.page.title);
      expect(share).toContain(copy.share.card.milestone);
      expect(share).toContain(
        copy.share.card.firstBuild(copy.share.card.taskLabels.study),
      );
      expect(share).toContain(copy.share.card.uscDisclaimer);
      expect(share).toContain(copy.share.controls.download);
      expect(share).not.toContain("<select");
    },
  );

  it("translates mounted UI and an existing auth message immediately", async () => {
    await act(async () => {
      root.render(
        <>
          <LocalizedRedemptionState state="blocked" />
          <AuthPanel
            initialMessageKey="callbackError"
            mode="demo"
            nextPath="/redeem"
          />
          <HistoryPageView
            agentEligible
            sessions={historySessions}
          />
          <SharePageView firstTaskType="coding" />
        </>,
      );
    });
    expect(container.textContent).toContain(
      customerPagesCopy.en.auth.messages.callbackError,
    );
    expect(container.textContent).toContain(
      customerPagesCopy.en.terminal.blocked.title,
    );

    languageState.locale = "zh";
    await act(async () => {
      root.render(
        <>
          <LocalizedRedemptionState state="blocked" />
          <AuthPanel
            initialMessageKey="callbackError"
            mode="demo"
            nextPath="/redeem"
          />
          <HistoryPageView
            agentEligible
            sessions={historySessions}
          />
          <SharePageView firstTaskType="coding" />
        </>,
      );
    });

    expect(container.textContent).toContain(
      customerPagesCopy.zh.auth.messages.callbackError,
    );
    expect(container.textContent).toContain(
      customerPagesCopy.zh.terminal.blocked.title,
    );
    expect(container.textContent).toContain(
      customerPagesCopy.zh.history.title,
    );
    expect(container.textContent).toContain(
      customerPagesCopy.zh.history.models.balanced,
    );
    expect(container.textContent).not.toContain(
      customerPagesCopy.en.history.models.balanced,
    );
    expect(container.textContent).toContain(
      customerPagesCopy.zh.share.page.title,
    );
    expect(container.textContent).not.toContain(
      customerPagesCopy.en.auth.messages.callbackError,
    );
  });

  it.each(locales)(
    "provides localized, non-secret identity-conflict guidance in %s",
    (locale) => {
      const message =
        customerPagesCopy[locale].auth.messages.identityAlreadyExists;
      expect(message.length).toBeGreaterThan(80);
      expect(message).not.toMatch(/error_description|identity_already_exists/);
      if (locale === "en") {
        expect(message).toMatch(/guest Credits were not moved/i);
        expect(message).toMatch(
          /may no longer be accessible from this browser/i,
        );
      }
      if (locale !== "en") {
        expect(message).not.toBe(
          customerPagesCopy.en.auth.messages.identityAlreadyExists,
        );
      }
    },
  );

  it("passes auth message keys and a safe next path across the server boundary", async () => {
    authMocks.getAuthenticatedUser.mockResolvedValue(null);

    const page = await AuthPage({
      searchParams: Promise.resolve({
        error: "callback",
        next: "/\\evil.example",
      }),
    });
    const panel = page.props.children as ReactElement<{
      initialMessageKey?: string;
      nextPath: string;
    }>;

    expect(panel.props.initialMessageKey).toBe("callbackError");
    expect(panel.props.nextPath).toBe("/redeem");
  });

  it("keeps private history fields and provider model ids server-side", async () => {
    authMocks.getAuthenticatedUser.mockResolvedValue({
      id: "private-user-id",
      isAnonymous: false,
    });
    historyMocks.listHistory.mockResolvedValue([
      {
        createdAt: "2026-07-28T12:30:00.000Z",
        id: "private-session-id",
        inputUnits: 456,
        model: "gpt-5.4-mini-2026-03-17",
        outputUnits: 789,
        providerCostMicroUsd: 12345,
        reservationId: "private-reservation-id",
        savedOutput: JSON.stringify({
          sections: [
            {
              heading: "Saved section",
              items: ["Saved result"],
            },
          ],
          title: "Saved output",
        }),
        status: "completed",
        taskType: "study",
        title: "Study helper",
        userId: "private-user-id",
      },
    ]);

    const page = await HistoryPage();
    const clientBoundaryPayload = JSON.stringify(page);
    const markup = renderToStaticMarkup(page);

    expect(clientBoundaryPayload).not.toContain("private-session-id");
    expect(clientBoundaryPayload).not.toContain("private-user-id");
    expect(clientBoundaryPayload).not.toContain(
      "private-reservation-id",
    );
    expect(clientBoundaryPayload).not.toContain(
      "gpt-5.4-mini-2026-03-17",
    );
    expect(clientBoundaryPayload).not.toContain(
      "providerCostMicroUsd",
    );
    expect(clientBoundaryPayload).not.toContain("inputUnits");
    expect(clientBoundaryPayload).not.toContain("outputUnits");
    expect(markup).toContain("Balanced guide");
    expect(markup).toContain("Saved result");
    expect(historyMocks.listHistory).toHaveBeenCalledWith({
      userId: "private-user-id",
    });
  });

  it("downloads a localized, standalone, secret-free SVG", async () => {
    languageState.locale = "zh";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === SHARE_CARD_HERO_PATH
        ? ({
            blob: async () =>
              new Blob(["png"], { type: "image/png" }),
            ok: true,
          } as Response)
        : new Response(null, { status: 204 }),
    );
    const createObjectURL = vi.fn<(blob: Blob) => string>(
      () => "blob:localized-share-card",
    );
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );

    await act(async () => {
      root.render(<ShareCardBuilder firstTaskType="study" />);
    });
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) =>
        candidate.textContent ===
        customerPagesCopy.zh.share.controls.download,
    );

    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const downloadedBlob = createObjectURL.mock.calls[0]?.[0];
    expect(downloadedBlob).toBeInstanceOf(Blob);
    if (!(downloadedBlob instanceof Blob)) {
      throw new Error("Expected an SVG download blob");
    }
    const downloadedSvg = await readBlobAsText(downloadedBlob);
    expect(downloadedSvg).toContain(
      customerPagesCopy.zh.share.card.milestone,
    );
    expect(downloadedSvg).toContain(
      customerPagesCopy.zh.share.card.firstBuild(
        customerPagesCopy.zh.share.card.taskLabels.study,
      ),
    );
    expect(downloadedSvg).toContain(
      customerPagesCopy.zh.share.card.uscDisclaimer,
    );
    expect(downloadedSvg).toContain('href="data:image/png;base64,');
    expect(downloadedSvg).not.toContain(
      `href="${SHARE_CARD_HERO_PATH}"`,
    );
    expect(downloadedSvg).not.toMatch(
      /\b(email|user id|claim code|private qr|api key|remaining balance)\b/iu,
    );
    expect(
      container.querySelector('[role="status"]')?.textContent,
    ).toBe(customerPagesCopy.zh.share.controls.downloaded);

    languageState.locale = "fr";
    await act(async () => {
      root.render(<ShareCardBuilder firstTaskType="study" />);
    });
    expect(
      container.querySelector('[role="status"]')?.textContent,
    ).toBe(customerPagesCopy.fr.share.controls.downloaded);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:localized-share-card",
    );
    const download = document.querySelector<HTMLAnchorElement>(
      `a[download="${SHARE_CARD_FILENAME}"]`,
    );
    expect(download).toBeNull();
  });
});
