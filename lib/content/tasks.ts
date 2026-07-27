import type { TaskType } from "@/lib/campaign/types";
import { MENU_SAFETY_NOTICE } from "@/lib/content/menu";

export const TASK_TYPES = [
  "study",
  "coding",
  "career",
  "pick-my-bowl",
] as const satisfies readonly TaskType[];

export interface TaskPreset {
  id: string;
  label: string;
  prompt: string;
}

export interface TaskDefinition {
  example: string;
  inputLabel: string;
  outputTitle: string;
  presets: readonly TaskPreset[];
  providerInstruction: string;
  reviewNote: string;
  safetyNote?: string;
  title: string;
  type: TaskType;
}

const GENERAL_REVIEW_NOTE =
  "AI can make mistakes. Review before relying on this result.";

const TASKS: Readonly<Record<TaskType, TaskDefinition>> = {
  study: {
    example:
      "Turn these notes into a one-page study guide and 10 flashcards.",
    inputLabel: "What are you working on?",
    outputTitle: "Your study guide",
    presets: [
      {
        id: "summary",
        label: "Make a study guide",
        prompt: "Summarize my reading into 8 bullets",
      },
      {
        id: "flashcards",
        label: "Create flashcards",
        prompt: "Turn these notes into 15 flashcards",
      },
      {
        id: "quiz",
        label: "Quiz me",
        prompt: "Quiz me on this chapter",
      },
      {
        id: "explain",
        label: "Explain a concept",
        prompt:
          "Explain this concept like I’m cramming for a midterm",
      },
    ],
    providerInstruction:
      "Create an accurate, skimmable study aid. Separate key ideas from practice material and clearly flag uncertainty.",
    reviewNote: GENERAL_REVIEW_NOTE,
    title: "Study help",
    type: "study",
  },
  coding: {
    example:
      "Paste the relevant error and code. Ask for the smallest safe fix.",
    inputLabel: "What are you working on?",
    outputTitle: "Your coding guide",
    presets: [
      {
        id: "error",
        label: "Explain this error",
        prompt: "Explain this error",
      },
      {
        id: "refactor",
        label: "Refactor this function",
        prompt: "Refactor this function",
      },
      {
        id: "tests",
        label: "Write tests",
        prompt: "Write tests",
      },
      {
        id: "compare",
        label: "Compare approaches",
        prompt: "Compare two approaches",
      },
    ],
    providerInstruction:
      "Explain the root cause first, propose the smallest safe change, and add a short verification checklist. Never claim code is guaranteed correct.",
    reviewNote:
      "AI can make mistakes. Test the result and review before submitting.",
    title: "Coding help",
    type: "coding",
  },
  career: {
    example:
      "Rewrite this resume bullet for a software engineering internship.",
    inputLabel: "What are you working on?",
    outputTitle: "Your career draft",
    presets: [
      {
        id: "resume",
        label: "Rewrite a resume bullet",
        prompt: "Rewrite a resume bullet",
      },
      {
        id: "email",
        label: "Draft a cold email",
        prompt: "Draft a cold email",
      },
      {
        id: "intro",
        label: "Tailor my intro",
        prompt: "Tailor my intro to a role",
      },
      {
        id: "star",
        label: "Create STAR stories",
        prompt: "Turn experience into STAR stories",
      },
    ],
    providerInstruction:
      "Produce concise, truthful career copy. Do not invent experience, achievements, credentials, or relationships.",
    reviewNote: GENERAL_REVIEW_NOTE,
    title: "Career help",
    type: "career",
  },
  "pick-my-bowl": {
    example:
      "Suggest a filling vegetarian bowl with mild spice. I will confirm ingredients with staff.",
    inputLabel: "What sounds good?",
    outputTitle: "Your bowl game plan",
    presets: [
      {
        id: "budget",
        label: "Bowl under $16",
        prompt: "Build me a bowl under $16",
      },
      {
        id: "protein",
        label: "High-protein, less spicy",
        prompt: "High-protein, less spicy",
      },
      {
        id: "vegetarian",
        label: "Vegetarian, not bland",
        prompt: "Vegetarian, not bland",
      },
      {
        id: "comfort",
        label: "Late-night comfort bowl",
        prompt: "Late-night comfort bowl",
      },
    ],
    providerInstruction:
      "Suggest a flexible bowl framework, not a verified order. Never promise current prices, availability, ingredient contents, nutrition, or allergen safety.",
    reviewNote: GENERAL_REVIEW_NOTE,
    safetyNote: MENU_SAFETY_NOTICE,
    title: "Pick My Bowl",
    type: "pick-my-bowl",
  },
};

export function isTaskType(value: unknown): value is TaskType {
  return (
    typeof value === "string" &&
    (TASK_TYPES as readonly string[]).includes(value)
  );
}

export function getTaskDefinition(taskType: TaskType) {
  return TASKS[taskType];
}

export function validateTaskInput(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("TASK_INPUT_INVALID");
  }

  const input = value.trim();
  if (
    input.length < 1 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input)
  ) {
    throw new Error("TASK_INPUT_INVALID");
  }
  if (input.length > 12_000) {
    throw new Error("TASK_INPUT_TOO_LONG");
  }
  return input;
}
