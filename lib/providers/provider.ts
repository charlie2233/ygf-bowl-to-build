import type { TaskDefinition } from "@/lib/content/tasks";
import type { ModelCatalogEntry } from "@/lib/providers/model-catalog";

export interface TaskOutputSection {
  heading: string;
  items: readonly string[];
}

export interface TaskOutput {
  sections: readonly TaskOutputSection[];
  title: string;
}

export interface TaskProviderInput {
  input: string;
  model: ModelCatalogEntry;
  /**
   * A server-generated execution id used only for upstream request
   * correlation. OpenAI does not guarantee idempotency for this header.
   */
  requestTraceId?: string;
  /**
   * Server-derived HMAC used for provider safety controls. It is never copied
   * from a browser-supplied user field.
   */
  safetyIdentifier: string;
  task: TaskDefinition;
}

export interface TaskProviderResult {
  inputUnits: number;
  model: string;
  output: TaskOutput;
  outputUnits: number;
  /**
   * Optional estimated provider cost represented as integer micro-US dollars.
   * The credit ledger reserves the catalog ceiling before a provider call.
   */
  providerCostMicroUsd?: number;
  requestId: string;
}

export interface TaskProvider {
  name: string;
  run(input: TaskProviderInput): Promise<TaskProviderResult>;
}

function boundedText(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  );
}

export function parseTaskOutput(value: unknown): TaskOutput {
  if (typeof value !== "object" || value === null) {
    throw new Error("PROVIDER_OUTPUT_INVALID");
  }
  const candidate = value as {
    sections?: unknown;
    title?: unknown;
  };
  if (
    !boundedText(candidate.title, 160) ||
    !Array.isArray(candidate.sections) ||
    candidate.sections.length < 1 ||
    candidate.sections.length > 8
  ) {
    throw new Error("PROVIDER_OUTPUT_INVALID");
  }

  const sections = candidate.sections.map((section) => {
    if (typeof section !== "object" || section === null) {
      throw new Error("PROVIDER_OUTPUT_INVALID");
    }
    const row = section as { heading?: unknown; items?: unknown };
    if (
      !boundedText(row.heading, 120) ||
      !Array.isArray(row.items) ||
      row.items.length < 1 ||
      row.items.length > 16 ||
      !row.items.every((item) => boundedText(item, 1_200))
    ) {
      throw new Error("PROVIDER_OUTPUT_INVALID");
    }
    return {
      heading: row.heading.trim(),
      items: row.items.map((item) => item.trim()),
    };
  });

  const output: TaskOutput = {
    sections,
    title: candidate.title.trim(),
  };
  if (JSON.stringify(output).length > 40_000) {
    throw new Error("PROVIDER_OUTPUT_INVALID");
  }
  return output;
}
