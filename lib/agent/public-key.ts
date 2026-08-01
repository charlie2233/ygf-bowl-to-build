import type { AgentKeySummary } from "@/lib/repositories/agent-gateway-repository";

export type PublicAgentKeySummary = Pick<
  AgentKeySummary,
  | "createdAt"
  | "expiresAt"
  | "id"
  | "last4"
  | "lastUsedAt"
  | "prefix"
  | "remainingCredits"
  | "revokedAt"
>;

export function publicAgentKeySummary(
  key: AgentKeySummary,
): PublicAgentKeySummary {
  return {
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    id: key.id,
    last4: key.last4,
    lastUsedAt: key.lastUsedAt,
    prefix: key.prefix,
    remainingCredits: key.remainingCredits,
    revokedAt: key.revokedAt,
  };
}
