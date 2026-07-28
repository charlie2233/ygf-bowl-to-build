import { menuContextForProvider } from "@/lib/content/menu";
import {
  OpenAIChatClient,
  type OpenAIResponseFormat,
} from "@/lib/providers/openai-chat-client";
import {
  parseTaskOutput,
  type TaskProvider,
  type TaskProviderInput,
} from "@/lib/providers/provider";

export type ProviderErrorCode =
  | "PROVIDER_CONFIGURATION_INVALID"
  | "PROVIDER_UNAVAILABLE";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode) {
    super(code);
    this.name = "ProviderError";
    this.code = code;
  }
}

interface OpenAITaskProviderOptions {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const TASK_RESPONSE_FORMAT: OpenAIResponseFormat = {
  json_schema: {
    name: "ygf_task_result",
    schema: {
      additionalProperties: false,
      properties: {
        sections: {
          items: {
            additionalProperties: false,
            properties: {
              heading: { type: "string" },
              items: {
                items: { type: "string" },
                maxItems: 16,
                minItems: 1,
                type: "array",
              },
            },
            required: ["heading", "items"],
            type: "object",
          },
          maxItems: 4,
          minItems: 1,
          type: "array",
        },
        title: { type: "string" },
      },
      required: ["title", "sections"],
      type: "object",
    },
    strict: true,
  },
  type: "json_schema",
};

function taskDeveloperPrompt(input: TaskProviderInput) {
  const lines = [
    "You are the YGF Bowl-to-Build beta assistant.",
    input.task.providerInstruction,
    input.task.reviewNote,
    "Use 1 to 4 sections and concise, directly useful items. Do not include HTML or markdown fences.",
  ];
  if (input.task.type === "pick-my-bowl") {
    lines.push(menuContextForProvider());
  }
  return lines.join("\n");
}

export class OpenAITaskProvider implements TaskProvider {
  readonly name = "openai";
  readonly #client: OpenAIChatClient;

  constructor(options: OpenAITaskProviderOptions) {
    try {
      this.#client = new OpenAIChatClient(options);
    } catch {
      throw new ProviderError("PROVIDER_CONFIGURATION_INVALID");
    }
  }

  async run(input: TaskProviderInput) {
    try {
      const response = await this.#client.complete({
        maxCompletionTokens: 1_800,
        messages: [
          {
            content: taskDeveloperPrompt(input),
            role: "developer",
          },
          { content: input.input, role: "user" },
        ],
        model: input.model,
        requestTraceId: input.requestTraceId,
        responseFormat: TASK_RESPONSE_FORMAT,
        safetyIdentifier: input.safetyIdentifier,
        temperature: 0.25,
      });
      let decoded: unknown;
      try {
        decoded = JSON.parse(response.content) as unknown;
      } catch {
        throw new ProviderError("PROVIDER_UNAVAILABLE");
      }
      return {
        inputUnits: response.inputUnits,
        model: input.model.providerId,
        output: parseTaskOutput(decoded),
        outputUnits: response.outputUnits,
        providerCostMicroUsd: response.providerCostMicroUsd,
        requestId: response.requestId,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError("PROVIDER_UNAVAILABLE");
    }
  }
}
