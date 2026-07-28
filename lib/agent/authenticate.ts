import { digestAgentApiKey } from "@/lib/agent/api-key";
import { serverSecret, type RuntimeEnvironment } from "@/lib/auth/runtime";
import {
  AgentGatewayError,
  getAgentGatewayRepository,
  type AgentGatewayRepository,
  type AgentPrincipal,
} from "@/lib/repositories/agent-gateway-repository";

export interface AuthenticatedAgentRequest {
  keyDigest: string;
  principal: AgentPrincipal;
}

const BEARER_PATTERN = /^Bearer (ygf_[A-Za-z0-9_-]{43})$/u;

export async function authenticateAgentRequest(
  request: Request,
  {
    environment = process.env,
    repository = getAgentGatewayRepository(),
  }: {
    environment?: RuntimeEnvironment;
    repository?: AgentGatewayRepository;
  } = {},
): Promise<AuthenticatedAgentRequest> {
  const url = new URL(request.url);
  // Gateway routes never use query parameters. Reject every non-empty query,
  // including unknown names, so secrets cannot accidentally become URL data.
  if (url.search.length > 0) {
    throw new AgentGatewayError("AUTHENTICATION_FAILED");
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = BEARER_PATTERN.exec(authorization);
  if (!match) {
    throw new AgentGatewayError("AUTHENTICATION_FAILED");
  }

  let keyDigest: string;
  try {
    keyDigest = digestAgentApiKey(
      match[1],
      serverSecret(
        "YGF_AGENT_API_KEY_DIGEST_SECRET",
        environment,
        process.env.NODE_ENV,
      ),
    );
  } catch {
    throw new AgentGatewayError("AUTHENTICATION_FAILED");
  }
  const principal = await repository.authenticateKey(keyDigest);
  return { keyDigest, principal };
}
