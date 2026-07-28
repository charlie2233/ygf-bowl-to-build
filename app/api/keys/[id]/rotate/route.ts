import { rotatePersonalAgentKey } from "@/lib/agent/key-service";
import { isSameOriginMutation } from "@/lib/auth/admin";
import { isAgentGatewayReady } from "@/lib/agent/readiness";
import { getAuthenticatedUser } from "@/lib/auth/user";
import {
  AgentGatewayError,
  type AgentKeySummary,
} from "@/lib/repositories/agent-gateway-repository";

export const dynamic = "force-dynamic";

const KEY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
};

interface RotateKeyDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  getUser: () => Promise<
    { id: string; isAnonymous?: boolean } | null
  >;
  rotate?: (
    userId: string,
    keyId: string,
  ) => Promise<{ apiKey: string; key: AgentKeySummary }>;
}

function response(
  body: Readonly<Record<string, unknown>>,
  status: number,
) {
  return Response.json(body, {
    headers: PRIVATE_HEADERS,
    status,
  });
}

export function createKeyRotateHandler({
  environment = process.env,
  getUser,
  rotate = rotatePersonalAgentKey,
}: RotateKeyDependencies) {
  return async function handle(request: Request, keyId: string) {
    if (!isSameOriginMutation(request, environment)) {
      return response({ error: "ORIGIN_FORBIDDEN" }, 403);
    }
    if (!isAgentGatewayReady(environment)) {
      return response({ error: "AGENT_GATEWAY_NOT_ENABLED" }, 503);
    }
    if (request.body) {
      return response({ error: "KEY_REQUEST_INVALID" }, 400);
    }
    const normalized = keyId.toLowerCase();
    if (!KEY_ID_PATTERN.test(normalized)) {
      return response({ error: "KEY_NOT_FOUND" }, 404);
    }
    let user: { id: string; isAnonymous?: boolean } | null;
    try {
      user = await getUser();
    } catch {
      return response({ error: "KEY_SERVICE_UNAVAILABLE" }, 503);
    }
    if (!user) {
      return response({ error: "AUTHENTICATION_REQUIRED" }, 401);
    }
    if (user.isAnonymous) {
      return response({ error: "ACCOUNT_UPGRADE_REQUIRED" }, 403);
    }
    try {
      const rotated = await rotate(user.id, normalized);
      return response(
        {
          apiKey: rotated.apiKey,
          key: rotated.key,
          notice:
            "The previous key is revoked. Copy this replacement now.",
        },
        201,
      );
    } catch (error) {
      if (
        error instanceof AgentGatewayError &&
        error.code === "KEY_NOT_FOUND"
      ) {
        return response({ error: "KEY_NOT_FOUND" }, 404);
      }
      return response({ error: "KEY_SERVICE_UNAVAILABLE" }, 503);
    }
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return createKeyRotateHandler({
    getUser: getAuthenticatedUser,
  })(request, id);
}
