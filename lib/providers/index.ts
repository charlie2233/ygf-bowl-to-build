import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { DemoProvider } from "@/lib/providers/demo-provider";
import { OpenRouterProvider } from "@/lib/providers/openrouter-provider";
import type { TaskProvider } from "@/lib/providers/provider";

export const DEFAULT_PROVIDER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

function safeReferer(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveProviderEndpoint(
  value: string | undefined,
) {
  if (!value?.trim()) {
    return DEFAULT_PROVIDER_ENDPOINT;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("YGF_PROVIDER_BASE_URL_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("YGF_PROVIDER_BASE_URL_INVALID");
  }
  const basePath = url.pathname.replace(/\/+$/u, "");
  url.pathname = basePath.endsWith("/chat/completions")
    ? basePath
    : `${basePath}/chat/completions`;
  return url.toString();
}

export function getTaskProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TaskProvider {
  if (resolveAuthRuntime(environment).mode === "demo") {
    return new DemoProvider();
  }

  const apiKey =
    environment.YGF_PROVIDER_API_KEY?.trim() ||
    environment.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Missing required server configuration: YGF_PROVIDER_API_KEY or OPENROUTER_API_KEY",
    );
  }
  return new OpenRouterProvider({
    apiKey,
    endpoint: resolveProviderEndpoint(
      environment.YGF_PROVIDER_BASE_URL,
    ),
    referer: safeReferer(environment.NEXT_PUBLIC_APP_URL),
  });
}
