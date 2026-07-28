import { isSameOriginMutation } from "@/lib/auth/admin";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { createPersonalAgentKey } from "@/lib/agent/key-service";
import { readBoundedRequestText } from "@/lib/admin/http";
import { isAgentGatewayReady } from "@/lib/agent/readiness";
import {
  AgentGatewayError,
  getAgentGatewayRepository,
  type AgentGatewayRepository,
  type AgentKeySummary,
} from "@/lib/repositories/agent-gateway-repository";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
};
const MAX_KEY_BODY_BYTES = 256;

interface AuthenticatedUser {
  id: string;
}

interface KeyRouteDependencies {
  createKey?: (userId: string) => Promise<{
    apiKey: string;
    key: AgentKeySummary;
  }>;
  environment?: Readonly<Record<string, string | undefined>>;
  getUser: () => Promise<AuthenticatedUser | null>;
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

function mapError(error: unknown) {
  if (error instanceof AgentGatewayError) {
    switch (error.code) {
      case "KEY_LIMIT_REACHED":
        return response({ error: "KEY_LIMIT_REACHED" }, 409);
      case "WALLET_EXPIRED":
        return response({ error: "WALLET_EXPIRED" }, 410);
      case "WALLET_NOT_FOUND":
        return response({ error: "WALLET_NOT_FOUND" }, 404);
      default:
        return response({ error: "KEY_SERVICE_UNAVAILABLE" }, 503);
    }
  }
  if (
    error instanceof Error &&
    error.message === "AGENT_WALLET_EXPIRED"
  ) {
    return response({ error: "WALLET_EXPIRED" }, 410);
  }
  return response({ error: "KEY_SERVICE_UNAVAILABLE" }, 503);
}

export function createKeyCollectionHandlers({
  createKey = (userId) => createPersonalAgentKey(userId),
  environment = process.env,
  getUser,
  repository,
}: KeyRouteDependencies) {
  async function get() {
    let user: AuthenticatedUser | null;
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
          keys: await (
            repository ?? getAgentGatewayRepository()
          ).listKeys(user.id),
        },
        200,
      );
    } catch (error) {
      return mapError(error);
    }
  }

  async function post(request: Request) {
    if (!isSameOriginMutation(request, environment)) {
      return response({ error: "ORIGIN_FORBIDDEN" }, 403);
    }
    if (!isAgentGatewayReady(environment)) {
      return response({ error: "AGENT_GATEWAY_NOT_ENABLED" }, 503);
    }
    const contentLength = request.headers.get("content-length");
    if (
      contentLength &&
      (!/^\d+$/u.test(contentLength) ||
        Number(contentLength) > MAX_KEY_BODY_BYTES)
    ) {
      return response({ error: "KEY_REQUEST_INVALID" }, 400);
    }
    if (request.body) {
      let body: unknown;
      try {
        if (
          request.headers
            .get("content-type")
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase() !== "application/json"
        ) {
          throw new Error("KEY_REQUEST_INVALID");
        }
        body = JSON.parse(
          await readBoundedRequestText(
            request,
            MAX_KEY_BODY_BYTES,
          ),
        ) as unknown;
      } catch {
        return response({ error: "KEY_REQUEST_INVALID" }, 400);
      }
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        Object.keys(body).length !== 0
      ) {
        return response({ error: "KEY_REQUEST_INVALID" }, 400);
      }
    }

    let user: AuthenticatedUser | null;
    try {
      user = await getUser();
    } catch {
      return response({ error: "KEY_SERVICE_UNAVAILABLE" }, 503);
    }
    if (!user) {
      return response({ error: "AUTHENTICATION_REQUIRED" }, 401);
    }
    try {
      const created = await createKey(user.id);
      return response(
        {
          apiKey: created.apiKey,
          key: created.key,
          notice:
            "Copy this key now. It will not be shown again.",
        },
        201,
      );
    } catch (error) {
      return mapError(error);
    }
  }

  return { get, post };
}

const handlers = createKeyCollectionHandlers({
  getUser: getAuthenticatedUser,
});

export const GET = handlers.get;
export const POST = handlers.post;
