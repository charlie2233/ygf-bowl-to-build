import { isSameOriginMutation } from "@/lib/auth/admin";
import { getAuthenticatedUser } from "@/lib/auth/user";
import {
  AgentGatewayError,
  getAgentGatewayRepository,
  type AgentGatewayRepository,
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

interface RevokeKeyDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  getUser: () => Promise<{ id: string } | null>;
  repository?: AgentGatewayRepository;
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

export function createKeyRevokeHandler({
  environment = process.env,
  getUser,
  repository,
}: RevokeKeyDependencies) {
  return async function revoke(request: Request, keyId: string) {
    if (!isSameOriginMutation(request, environment)) {
      return response({ error: "ORIGIN_FORBIDDEN" }, 403);
    }
    const normalized = keyId.toLowerCase();
    if (!KEY_ID_PATTERN.test(normalized)) {
      return response({ error: "KEY_NOT_FOUND" }, 404);
    }
    let user: { id: string } | null;
    try {
      user = await getUser();
    } catch {
      return response({ error: "KEY_SERVICE_UNAVAILABLE" }, 503);
    }
    if (!user) {
      return response({ error: "AUTHENTICATION_REQUIRED" }, 401);
    }
    try {
      return response(
        {
          key: await (
            repository ?? getAgentGatewayRepository()
          ).revokeKey(user.id, normalized),
          revoked: true,
        },
        200,
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return createKeyRevokeHandler({
    getUser: getAuthenticatedUser,
  })(request, id);
}
