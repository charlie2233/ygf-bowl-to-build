import { menuContextForProvider } from "@/lib/content/menu";
import type {
  TaskOutput,
  TaskProvider,
  TaskProviderInput,
} from "@/lib/providers/provider";

const OUTPUTS: Readonly<
  Record<TaskProviderInput["task"]["type"], TaskOutput>
> = {
  study: {
    sections: [
      {
        heading: "Key ideas",
        items: [
          "Active recall strengthens memory by retrieving information instead of only rereading it.",
          "Spaced repetition improves long-term retention by reviewing material at increasing intervals.",
          "Interleaving related topics helps you notice differences and transfer what you know.",
          "Practice questions reveal gaps early enough to review them.",
        ],
      },
      {
        heading: "Flashcards",
        items: [
          "Q: What is active recall? — A: Retrieving information from memory without looking at the answer.",
          "Q: Why space reviews? — A: Revisiting material over time makes recall more durable.",
          "Q: What does interleaving do? — A: It mixes related topics so you practice choosing the right approach.",
          "Q: Why use practice tests? — A: They expose gaps and strengthen retrieval.",
          "Q: What is the next step? — A: Review the weakest answer, then test it again later.",
        ],
      },
    ],
    title: "Your study guide",
  },
  coding: {
    sections: [
      {
        heading: "Likely root cause",
        items: [
          "The value can reach this branch before the program has proved that it exists.",
          "Keep the check close to the operation that needs the value so later edits cannot bypass it.",
        ],
      },
      {
        heading: "Smallest safe fix",
        items: [
          "Narrow the value with an explicit guard and return a typed error for the missing case.",
          "Add one test for the expected value and one for the missing-value path.",
          "Run the relevant type check and focused test before submitting.",
        ],
      },
    ],
    title: "Your coding guide",
  },
  career: {
    sections: [
      {
        heading: "Sharper draft",
        items: [
          "Lead with the action you personally took, then name the scope and the measurable result you can verify.",
          "Replace broad adjectives with a concrete tool, audience, constraint, or outcome.",
        ],
      },
      {
        heading: "Truth check",
        items: [
          "Keep only claims you can explain in an interview.",
          "Add a real number only when you can support how it was measured.",
          "Read the final line aloud and shorten anything that sounds unlike you.",
        ],
      },
    ],
    title: "Your career draft",
  },
  "pick-my-bowl": {
    sections: [
      {
        heading: "A flexible bowl plan",
        items: [
          "Start with one protein or plant-protein option and ask staff what is available today.",
          "Add two vegetables plus a mushroom or tofu option for contrast and texture.",
          "Choose a noodle or other starch based on how filling you want the bowl to be.",
          "Ask for a mild broth or spice level first; heat can be adjusted more easily than removed.",
        ],
      },
      {
        heading: "Confirm before ordering",
        items: [
          "Ask staff to confirm current item availability and the price before checkout.",
          "Confirm every ingredient and allergen concern directly with YGF staff.",
        ],
      },
    ],
    title: "Your bowl game plan",
  },
};

export class DemoProvider implements TaskProvider {
  readonly name = "demo";

  async run({ model, task }: TaskProviderInput) {
    // Touch the bounded context in development so changes to bowl safety remain
    // part of the provider contract without retaining user input.
    if (task.type === "pick-my-bowl") {
      menuContextForProvider();
    }
    return {
      inputUnits: 80,
      model: model.providerId,
      output: OUTPUTS[task.type],
      outputUnits: 240,
      providerCostMicroUsd: 1_800,
      requestId: `demo-${task.type}-${model.id}`,
    };
  }
}
