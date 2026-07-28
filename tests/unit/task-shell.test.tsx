import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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

import {
  TaskShell,
  type TaskSubmission,
} from "@/components/task/task-shell";
import { getTaskDefinition } from "@/lib/content/tasks";
import { workspaceCopy } from "@/lib/i18n/workspace";
import { modelChoicesForTask } from "@/lib/providers/model-catalog";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("TaskShell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    languageState.locale = "en";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000005",
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("focuses and associates the task input when a blank task is submitted", async () => {
    await act(async () => {
      root.render(
        <TaskShell
          initialCredits={3_000}
          modelChoices={modelChoicesForTask("study")}
          submitTask={vi.fn()}
          task={getTaskDefinition("study")}
        />,
      );
    });

    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[name="input"]',
    );
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    const errorId = textarea?.getAttribute("aria-describedby");
    expect(document.activeElement).toBe(textarea);
    expect(textarea?.getAttribute("aria-invalid")).toBe("true");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId ?? "")?.textContent).toBe(
      "Tell us what you’re working on.",
    );
  });

  it("keeps the default path model-free and submits bounded text", async () => {
    const submitTask = vi.fn<
      (submission: TaskSubmission) => Promise<never>
    >(async () => {
      throw new Error("PROVIDER_UNAVAILABLE");
    });
    await act(async () => {
      root.render(
        <TaskShell
          initialCredits={3_000}
          modelChoices={modelChoicesForTask("study")}
          submitTask={submitTask}
          task={getTaskDefinition("study")}
        />,
      );
    });

    expect(container.textContent).not.toContain("GPT");
    expect(container.textContent).not.toContain("Gemini");
    expect(container.textContent).not.toContain("Qwen");
    const preset = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Make a study guide",
    );
    await act(async () => preset?.click());
    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[name="input"]',
    );
    expect(textarea?.value).toBe(
      "Summarize my reading into 8 bullets",
    );
    expect(textarea?.maxLength).toBe(12_000);

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
      await Promise.resolve();
    });

    expect(submitTask).toHaveBeenCalledWith({
      idempotencyKey: "00000000-0000-4000-8000-000000000005",
      input: "Summarize my reading into 8 bullets",
      taskType: "study",
    });
    expect(submitTask.mock.calls[0]?.[0]).not.toHaveProperty("userId");
    expect(submitTask.mock.calls[0]?.[0]).not.toHaveProperty("model");
  });

  it("submits on private-LAN HTTP when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });
    const submitTask = vi.fn(async () => ({
      friendlyModel: "Balanced guide",
      output: {
        sections: [{ heading: "Result", items: ["Ready"] }],
        title: "LAN result",
      },
      remainingCredits: 2_880,
      sessionId: "lan-session",
      status: "completed" as const,
    }));

    await act(async () => {
      root.render(
        <TaskShell
          initialCredits={3_000}
          modelChoices={modelChoicesForTask("study")}
          submitTask={submitTask}
          task={getTaskDefinition("study")}
        />,
      );
    });
    const preset = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Make a study guide",
    );
    await act(async () => preset?.click());
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
      await Promise.resolve();
    });

    expect(submitTask).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "abababab-abab-4bab-abab-abababababab",
      }),
    );
  });

  it("shows a useful result, updated balance, save action, and partner CTA only after success", async () => {
    const saveTask = vi.fn(async () => undefined);
    const submitTask = vi.fn(async () => ({
      friendlyModel: "Balanced guide",
      output: {
        sections: [
          {
            heading: "Key ideas",
            items: ["Active recall strengthens memory."],
          },
          {
            heading: "Flashcards",
            items: [
              "Q: What is active recall? — A: Retrieving information from memory.",
            ],
          },
        ],
        title: "Your study guide",
      },
      remainingCredits: 2_880,
      sessionId: "session-1",
      status: "completed" as const,
    }));
    await act(async () => {
      root.render(
        <TaskShell
          initialCredits={3_000}
          modelChoices={modelChoicesForTask("study")}
          saveTask={saveTask}
          submitTask={submitTask}
          task={getTaskDefinition("study")}
        />,
      );
    });
    expect(container.textContent).not.toContain(
      "Connect my Agent",
    );

    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[name="input"]',
    );
    await act(async () => {
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        setter?.call(textarea, "Explain active recall.");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
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

    expect(container.textContent).toContain("Your study guide");
    expect(container.textContent).toContain(
      "Active recall strengthens memory.",
    );
    expect(
      container.querySelectorAll(".result-panel__flashcard"),
    ).toHaveLength(1);
    expect(container.textContent).toContain("What is active recall?");
    expect(container.textContent).toContain(
      "Retrieving information from memory.",
    );
    expect(container.textContent).toContain("2,880 credits");
    expect(container.textContent).toContain(
      "Connect my Agent",
    );
    expect(container.textContent).toMatch(
      /AI can make mistakes.*review/i,
    );

    const save = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save",
    );
    await act(async () => {
      save?.click();
      await Promise.resolve();
    });
    expect(saveTask).toHaveBeenCalledWith("session-1");
    expect(container.textContent).toContain("Saved to history");
  });

  it("keeps a localized quick start visible and submits it in the selected language", async () => {
    languageState.locale = "zh";
    const submitTask = vi.fn(async () => ({
      friendlyModel: "Balanced guide",
      output: {
        sections: [
          {
            heading: "Provider heading",
            items: ["Provider body"],
          },
        ],
        title: "Provider title",
      },
      remainingCredits: 2_880,
      sessionId: "localized-session",
      status: "completed" as const,
    }));

    await act(async () => {
      root.render(
        <TaskShell
          initialCredits={3_000}
          modelChoices={modelChoicesForTask("study")}
          submitTask={submitTask}
          task={getTaskDefinition("study")}
        />,
      );
    });

    expect(container.textContent).toContain(
      workspaceCopy.zh.task.tasks.study.title,
    );
    const preset = Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.textContent ===
        workspaceCopy.zh.task.tasks.study.presets[0],
    );
    await act(async () => preset?.click());

    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[name="input"]',
    );
    expect(textarea?.value).toBe("制作学习指南");

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
        }),
      );
      await Promise.resolve();
    });

    expect(submitTask).toHaveBeenCalledWith({
      idempotencyKey: "00000000-0000-4000-8000-000000000005",
      input: "制作学习指南",
      taskType: "study",
    });
    expect(container.textContent).toContain("Provider title");
    expect(container.textContent).toContain("Provider body");
    expect(container.textContent).toContain(
      workspaceCopy.zh.task.result.copy,
    );
  });

  it("always shows the allergen confirmation warning for Pick My Bowl", async () => {
    await act(async () => {
      root.render(
        <TaskShell
          initialCredits={3_000}
          modelChoices={modelChoicesForTask("pick-my-bowl")}
          submitTask={vi.fn()}
          task={getTaskDefinition("pick-my-bowl")}
        />,
      );
    });
    expect(container.textContent).toMatch(
      /confirm ingredients\/allergens with YGF staff/i,
    );
  });
});
