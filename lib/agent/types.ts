export const AGENT_API_KEY_SCOPES = [
  "models:read",
  "chat:completions",
] as const;

export type AgentApiKeyScope =
  (typeof AGENT_API_KEY_SCOPES)[number];

export type AgentApiKeyDigestVersion = "hmac-sha256-v1";

/**
 * This is the only secret-derived material that may be persisted. It
 * intentionally has no plaintext/secret field.
 */
export interface AgentApiKeyPersistence {
  readonly digest: string;
  readonly digestVersion: AgentApiKeyDigestVersion;
  readonly last4: string;
  readonly prefix: string;
}

export interface AgentApiKeyLimits {
  readonly maximumConcurrentRequests: number;
  readonly maximumRequestsPerMinute: number;
}

export interface AgentApiKeyLifecycle {
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
  readonly rotatedAt: string | null;
}

export interface PersistedAgentApiKey
  extends AgentApiKeyPersistence,
    AgentApiKeyLifecycle {
  readonly id: string;
  readonly limits: Readonly<AgentApiKeyLimits>;
  readonly ownerId: string;
  readonly scopes: readonly AgentApiKeyScope[];
  readonly walletId: string;
}

export type AgentApiKeyDescriptor = Omit<
  PersistedAgentApiKey,
  "digest" | "digestVersion"
>;

/**
 * `plaintext` is made non-enumerable at runtime. A caller must deliberately
 * select it for the one creation/rotation response; serializing this wrapper
 * or its persistence member cannot disclose it by accident.
 */
export interface GeneratedAgentApiKey {
  readonly persistence: Readonly<AgentApiKeyPersistence>;
  readonly plaintext: string;
}
