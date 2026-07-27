import { describe, expect, it } from "vitest";

import {
  TASK_TYPES,
  getTaskDefinition,
  isTaskType,
  validateTaskInput,
} from "@/lib/content/tasks";
import {
  MENU_SAFETY_NOTICE,
  menuContextForProvider,
} from "@/lib/content/menu";

describe("task content", () => {
  it("ships the four report-approved preset sets verbatim", () => {
    expect(
      getTaskDefinition("study").presets.map((preset) => preset.prompt),
    ).toEqual([
      "Summarize my reading into 8 bullets",
      "Turn these notes into 15 flashcards",
      "Quiz me on this chapter",
      "Explain this concept like I’m cramming for a midterm",
    ]);
    expect(
      getTaskDefinition("coding").presets.map((preset) => preset.prompt),
    ).toEqual([
      "Explain this error",
      "Refactor this function",
      "Write tests",
      "Compare two approaches",
    ]);
    expect(
      getTaskDefinition("career").presets.map((preset) => preset.prompt),
    ).toEqual([
      "Rewrite a resume bullet",
      "Draft a cold email",
      "Tailor my intro to a role",
      "Turn experience into STAR stories",
    ]);
    expect(
      getTaskDefinition("pick-my-bowl").presets.map(
        (preset) => preset.prompt,
      ),
    ).toEqual([
      "Build me a bowl under $16",
      "High-protein, less spicy",
      "Vegetarian, not bland",
      "Late-night comfort bowl",
    ]);
  });

  it("includes accuracy review language on every workflow", () => {
    for (const taskType of TASK_TYPES) {
      expect(getTaskDefinition(taskType).reviewNote).toMatch(
        /AI can make mistakes.*review/i,
      );
    }
    expect(getTaskDefinition("coding").reviewNote).toMatch(
      /review before submitting/i,
    );
  });

  it("keeps bowl guidance informational and makes no current-price promise", () => {
    expect(
      getTaskDefinition("pick-my-bowl").safetyNote,
    ).toBe(MENU_SAFETY_NOTICE);
    expect(MENU_SAFETY_NOTICE).toMatch(
      /confirm ingredients\/allergens with YGF staff/i,
    );
    expect(menuContextForProvider()).toMatch(
      /availability and prices change/i,
    );
    expect(menuContextForProvider()).not.toMatch(
      /\b(?:costs?|priced at|current price is)\s+\$?\d/i,
    );
  });

  it("accepts only known task types and 1-12,000 characters of text", () => {
    expect(TASK_TYPES).toEqual([
      "study",
      "coding",
      "career",
      "pick-my-bowl",
    ]);
    expect(isTaskType("study")).toBe(true);
    expect(isTaskType("pick_my_bowl")).toBe(false);
    expect(validateTaskInput("  useful text  ")).toBe("useful text");
    expect(validateTaskInput("x".repeat(12_000))).toHaveLength(12_000);

    expect(() => validateTaskInput("   ")).toThrow("TASK_INPUT_INVALID");
    expect(() => validateTaskInput("x".repeat(12_001))).toThrow(
      "TASK_INPUT_TOO_LONG",
    );
    expect(() => validateTaskInput("hello\u0000world")).toThrow(
      "TASK_INPUT_INVALID",
    );
    expect(() => validateTaskInput({ text: "no attachments" })).toThrow(
      "TASK_INPUT_INVALID",
    );
  });
});
