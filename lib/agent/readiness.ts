import type { RuntimeEnvironment } from "@/lib/auth/runtime";

/** Production is deliberately opt-in until the provider/domain/Supabase gate. */
export function isAgentGatewayReady(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
): boolean {
  if (nodeEnvironment !== "production") {
    return true;
  }
  return environment.YGF_AGENT_GATEWAY_ENABLED === "true";
}
