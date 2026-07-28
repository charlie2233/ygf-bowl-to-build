import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { DemoProvider } from "@/lib/providers/demo-provider";
import { OpenAITaskProvider } from "@/lib/providers/openai-provider";
import type { TaskProvider } from "@/lib/providers/provider";

export function getTaskProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TaskProvider {
  const runtime = resolveAuthRuntime(environment);
  if (runtime.mode === "demo") {
    const demoProvider = environment.YGF_DEMO_PROVIDER?.trim();
    if (!demoProvider || demoProvider === "deterministic") {
      return new DemoProvider();
    }
    if (demoProvider !== "openai") {
      throw new Error(
        "Invalid server configuration: YGF_DEMO_PROVIDER",
      );
    }
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
