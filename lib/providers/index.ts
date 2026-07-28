import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { DemoProvider } from "@/lib/providers/demo-provider";
import { OpenAITaskProvider } from "@/lib/providers/openai-provider";
import type { TaskProvider } from "@/lib/providers/provider";

export function getTaskProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TaskProvider {
  if (resolveAuthRuntime(environment).mode === "demo") {
    return new DemoProvider();
  }

  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Missing required server configuration: OPENAI_API_KEY",
    );
  }
  return new OpenAITaskProvider({
    apiKey,
  });
}
