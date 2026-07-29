import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const languageState = vi.hoisted(() => ({
  locale: "en" as "en" | "zh" | "es" | "fr" | "ru",
}));

vi.mock("@/components/campaign-language", () => ({
  useCampaignLanguage: () => ({
    locale: languageState.locale,
    setLocale: vi.fn(),
  }),
}));

import { TaskLauncher } from "@/components/task-launcher";
import { PartnerCta } from "@/components/task/partner-cta";
import { ResultPanel } from "@/components/task/result-panel";
import { TaskShell } from "@/components/task/task-shell";
import { WalletBalance } from "@/components/wallet-balance";
import {
  AgentConnectView,
  RedeemSuccessView,
  WalletWorkspaceView,
} from "@/components/workspace-views";
import type { BrowserWallet } from "@/lib/http/campaign-dto";
import { getTaskDefinition } from "@/lib/content/tasks";
import { campaignLocales } from "@/lib/i18n/campaign";
import {
  workspaceCopy,
  workspaceIntlLocales,
} from "@/lib/i18n/workspace";
import { modelChoicesForTask } from "@/lib/providers/model-catalog";
import type { TaskOutput } from "@/lib/providers/provider";

const ACTIVE_WALLET: BrowserWallet = {
  createdAt: "2026-07-28T12:00:00.000Z",
  expiresAt: "2099-08-10T12:00:00.000Z",
  initialBalance: 3_000,
  remainingBalance: 2_760,
  reservedBalance: 120,
};

const PROVIDER_OUTPUT: TaskOutput = {
  title: "Provider result title",
  sections: [
    {
      heading: "Provider section heading",
      items: ["Provider result body remains unchanged."],
    },
  ],
};

describe("post-redemption workspace localization", () => {
  it("uses 杨国福 rather than the Latin brand in Chinese workspace copy", () => {
    const chinese = JSON.stringify(workspaceCopy.zh);

    expect(chinese).toContain("杨国福 API Key");
    expect(chinese).toContain("杨国福 AI");
    expect(chinese).not.toContain("YGF");
  });

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    languageState.locale = "en";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it.each(campaignLocales)(
    "provides the complete customer-workspace contract in %s",
    (locale) => {
      const copy = workspaceCopy[locale];

      expect(workspaceIntlLocales[locale]).toBeTruthy();
      expect(copy.redeemSuccess.title).toBeTruthy();
      expect(copy.redeemSuccess.useAi).toBeTruthy();
      expect(copy.wallet.heading).toBeTruthy();
      expect(Object.keys(copy.wallet.tasks.presets)).toEqual([
        "study",
        "coding",
        "career",
        "pick-my-bowl",
      ]);
      expect(copy.wallet.tasks.modelOptions.best).toBeTruthy();
      expect(copy.wallet.balance.expires("DATE")).toContain("DATE");
      expect(copy.wallet.balance.used(8, "3,000")).toContain("8");
      expect(copy.wallet.balance.reserved("120")).toContain("120");
      expect(copy.agent.title).toBeTruthy();
      expect(copy.agent.useYgfAi).toBeTruthy();
      expect(copy.agent.controlsLanguageNotice).toBeTruthy();
      expect(copy.task.backToWallet).toBeTruthy();
      expect(copy.task.generate).toBeTruthy();
      expect(copy.task.generating).toBeTruthy();
      expect(copy.task.empty.title).toBeTruthy();
      expect(copy.task.result.copy).toBeTruthy();
      expect(copy.task.result.startAnother).toBeTruthy();
      expect(copy.task.partner.title).toBeTruthy();
      expect(Object.keys(copy.task.errors)).toHaveLength(9);
      expect(Object.keys(copy.task.tasks)).toEqual([
        "study",
        "coding",
        "career",
        "pick-my-bowl",
      ]);
      for (const task of Object.values(copy.task.tasks)) {
        expect(task.title).toBeTruthy();
        expect(task.inputLabel).toBeTruthy();
        expect(task.example).toBeTruthy();
        expect(task.quickStartsLabel).toBeTruthy();
        expect(task.presets).toHaveLength(4);
        expect(task.reviewNote).toBeTruthy();
      }
    },
  );

  it.each(campaignLocales)(
    "renders the success, wallet, task, balance, and Agent framing in %s",
    (locale) => {
      languageState.locale = locale;
      const copy = workspaceCopy[locale];
      const successHtml = renderToStaticMarkup(<RedeemSuccessView />);
      const walletHtml = renderToStaticMarkup(
        <WalletWorkspaceView wallet={ACTIVE_WALLET} />,
      );
      const taskHtml = renderToStaticMarkup(<TaskLauncher />);
      const balanceHtml = renderToStaticMarkup(
        <WalletBalance wallet={ACTIVE_WALLET} />,
      );
      const agentHtml = renderToStaticMarkup(
        <AgentConnectView configuredOrigin="" gatewayEnabled={false} />,
      );
      const taskWorkspaceHtml = renderToStaticMarkup(
        <TaskShell
          initialCredits={3_000}
          modelChoices={modelChoicesForTask("study")}
          submitTask={vi.fn()}
          task={getTaskDefinition("study")}
        />,
      );
      const resultHtml = renderToStaticMarkup(
        <ResultPanel
          onReset={vi.fn()}
          onSave={vi.fn(async () => undefined)}
          output={PROVIDER_OUTPUT}
        />,
      );
      const partnerHtml = renderToStaticMarkup(<PartnerCta eligible />);

      expect(successHtml).toContain(copy.redeemSuccess.title);
      expect(successHtml).toContain(copy.redeemSuccess.useAi);
      expect(walletHtml).toContain(copy.wallet.heading);
      expect(walletHtml).toContain(copy.wallet.nextSteps.connectAgent);
      expect(taskHtml).toContain(copy.wallet.tasks.heading);
      expect(taskHtml).toContain(copy.wallet.tasks.presets.study.label);
      expect(taskHtml).toContain('href="/task/study?model=best"');
      expect(balanceHtml).toContain(copy.wallet.balance.remaining);
      expect(balanceHtml).toContain(copy.wallet.balance.ariaLabel);
      expect(agentHtml).toContain(copy.agent.title);
      expect(agentHtml).toContain(copy.agent.useYgfAi);
      expect(agentHtml).toContain('lang="en"');
      if (locale === "en") {
        expect(agentHtml).not.toContain(copy.agent.controlsLanguageNotice);
      } else {
        expect(agentHtml).toContain(copy.agent.controlsLanguageNotice);
      }
      expect(taskWorkspaceHtml).toContain(copy.task.tasks.study.title);
      expect(taskWorkspaceHtml).toContain(
        copy.task.tasks.study.presets[0],
      );
      expect(taskWorkspaceHtml).toContain(copy.task.model.summary);
      expect(taskWorkspaceHtml).toContain(copy.task.model.options.best);
      expect(taskWorkspaceHtml).toContain(copy.task.generate);
      expect(taskWorkspaceHtml).toContain(copy.task.empty.title);
      expect(resultHtml).toContain(PROVIDER_OUTPUT.title);
      expect(resultHtml).toContain(PROVIDER_OUTPUT.sections[0].heading);
      expect(resultHtml).toContain(PROVIDER_OUTPUT.sections[0].items[0]);
      expect(resultHtml).toContain(copy.task.result.copy);
      expect(resultHtml).toContain(copy.task.result.save);
      expect(resultHtml).toContain(copy.task.result.startAnother);
      expect(partnerHtml).toContain(copy.task.partner.title);
      expect(partnerHtml).toContain(copy.task.partner.description);
      expect(partnerHtml).toContain(copy.task.partner.action);
    },
  );

  it("updates visible workspace copy immediately when the shared locale changes", async () => {
    await act(async () => {
      root.render(<WalletWorkspaceView wallet={ACTIVE_WALLET} />);
    });
    expect(container.textContent).toContain(workspaceCopy.en.wallet.heading);
    expect(container.textContent).toContain(
      workspaceCopy.en.wallet.tasks.presets.study.label,
    );

    languageState.locale = "zh";
    await act(async () => {
      root.render(<WalletWorkspaceView wallet={ACTIVE_WALLET} />);
    });

    expect(container.textContent).toContain(workspaceCopy.zh.wallet.heading);
    expect(container.textContent).toContain(
      workspaceCopy.zh.wallet.tasks.presets.study.label,
    );
    expect(container.textContent).not.toContain(
      workspaceCopy.en.wallet.heading,
    );
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="/task/study?model=best"]',
      ),
    ).not.toBeNull();
  });
});
