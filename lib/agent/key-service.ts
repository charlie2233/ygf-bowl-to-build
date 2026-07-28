import { generateAgentApiKey } from "@/lib/agent/api-key";
import { recordProductSignal } from "@/lib/analytics/product-signals";
import {
  AGENT_REQUEST_LIMITS,
  resolveAgentApiKeyExpiry,
} from "@/lib/agent/policy";
import { AGENT_API_KEY_SCOPES } from "@/lib/agent/types";
import { serverSecret, type RuntimeEnvironment } from "@/lib/auth/runtime";
import { getCampaignRepository } from "@/lib/repositories";
import {
  getAgentGatewayRepository,
  type AgentGatewayRepository,
  type AgentKeySummary,
  type CreateAgentKeyInput,
} from "@/lib/repositories/agent-gateway-repository";
import type { CampaignRepository } from "@/lib/repositories/campaign-repository";
import type { RecordEventInput } from "@/lib/repositories/campaign-repository";

export interface CreatedPersonalAgentKey {
  apiKey: string;
  key: AgentKeySummary;
}

interface AgentKeyServiceDependencies {
  campaign?: Pick<CampaignRepository, "getWallet">;
  environment?: RuntimeEnvironment;
  now?: () => Date;
  recordEvent?: (input: RecordEventInput) => Promise<unknown>;
  repository?: AgentGatewayRepository;
}

function digestSecret(
  environment: RuntimeEnvironment,
) {
  return serverSecret(
    "YGF_AGENT_API_KEY_DIGEST_SECRET",
    environment,
    process.env.NODE_ENV,
  );
}

function createInput({
  environment,
  expiresAt,
  now,
  userId,
  walletId,
}: {
  environment: RuntimeEnvironment;
  expiresAt: string;
  now: Date;
  userId: string;
  walletId: string;
}): {
  input: CreateAgentKeyInput;
  plaintext: string;
} {
  const generated = generateAgentApiKey({
    digestSecret: digestSecret(environment),
  });
  return {
    input: {
      createdAt: now.toISOString(),
      expiresAt,
      limits: {
        maximumConcurrentRequests:
          AGENT_REQUEST_LIMITS.maximumConcurrentRequestsPerKey,
        maximumRequestsPerMinute:
          AGENT_REQUEST_LIMITS.maximumRequestsPerMinute,
      },
      persistence: generated.persistence,
      scopes: AGENT_API_KEY_SCOPES,
      userId,
      walletId,
    },
    plaintext: generated.plaintext,
  };
}

export async function createPersonalAgentKey(
  userId: string,
  {
    campaign = getCampaignRepository(),
    environment = process.env,
    now = () => new Date(),
    recordEvent = recordProductSignal,
    repository = getAgentGatewayRepository(),
  }: AgentKeyServiceDependencies = {},
): Promise<CreatedPersonalAgentKey> {
  const createdAt = now();
  const wallet = await campaign.getWallet({ userId });
  const expiresAt = resolveAgentApiKeyExpiry({
    createdAt,
    walletExpiresAt: wallet.expiresAt,
  });
  const material = createInput({
    environment,
    expiresAt,
    now: createdAt,
    userId,
    walletId: wallet.id,
  });
  const key = await repository.createKey(material.input);
  await recordEvent({
      metadata: { outcome: "success" },
      name: "agent_key_created",
      source: "agent",
      userId,
    }).catch(() => undefined);
  return {
    apiKey: material.plaintext,
    key,
  };
}

export async function rotatePersonalAgentKey(
  userId: string,
  keyId: string,
  {
    campaign = getCampaignRepository(),
    environment = process.env,
    now = () => new Date(),
    recordEvent = recordProductSignal,
    repository = getAgentGatewayRepository(),
  }: AgentKeyServiceDependencies = {},
): Promise<CreatedPersonalAgentKey> {
  const createdAt = now();
  const wallet = await campaign.getWallet({ userId });
  const expiresAt = resolveAgentApiKeyExpiry({
    createdAt,
    walletExpiresAt: wallet.expiresAt,
  });
  const material = createInput({
    environment,
    expiresAt,
    now: createdAt,
    userId,
    walletId: wallet.id,
  });
  const key = await repository.rotateKey(
    userId,
    keyId,
    material.input,
  );
  await recordEvent({
      metadata: { outcome: "success" },
      name: "agent_key_created",
      source: "agent",
      userId,
    }).catch(() => undefined);
  return {
    apiKey: material.plaintext,
    key,
  };
}
