import {
  authenticateAgentRequest,
  type AuthenticatedAgentRequest,
} from "@/lib/agent/authenticate";
import { openAiModelList } from "@/lib/agent/openai-contract";
import { isAgentGatewayReady } from "@/lib/agent/readiness";
import {
  AgentGatewayError,
  getAgentGatewayRepository,
} from "@/lib/repositories/agent-gateway-repository";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

function errorResponse(status: number) {
  return Response.json(
    {
      error: {
        code: "invalid_api_key",
        message: "Invalid or inactive API key.",
        type: "authentication_error",
      },
    },
    {
      headers: {
        ...HEADERS,
        "www-authenticate": "Bearer",
      },
      status,
    },
  );
}

export function createModelsHandler({
  admit,
  authenticate = authenticateAgentRequest,
  environment = process.env,
}: {
  admit?: (keyDigest: string) => Promise<void>;
  authenticate?: (
    request: Request,
  ) => Promise<AuthenticatedAgentRequest>;
  environment?: Readonly<Record<string, string | undefined>>;
} = {}) {
  return async function handle(request: Request) {
    if (!isAgentGatewayReady(environment)) {
      return Response.json(
        { error: { code: "gateway_not_enabled", message: "The YGF Agent gateway is not enabled for production connections.", type: "server_error" } },
        { headers: HEADERS, status: 503 },
      );
    }
    try {
      const { keyDigest, principal } = await authenticate(request);
      await (admit ?? ((digest) =>
        getAgentGatewayRepository().admitRequest(digest)))(keyDigest);
      if (!principal.scopes.includes("models:read")) {
        return errorResponse(403);
      }
      return Response.json(openAiModelList(), {
        headers: HEADERS,
        status: 200,
      });
    } catch (error) {
      if (
        error instanceof AgentGatewayError &&
        error.code === "AUTHENTICATION_FAILED"
      ) {
        return errorResponse(401);
      }
      if (error instanceof AgentGatewayError && error.code === "RATE_LIMITED") {
        return Response.json(
          { error: { code: "rate_limit_exceeded", message: "This API key has reached its per-minute request limit.", type: "rate_limit_error" } },
          { headers: { ...HEADERS, "retry-after": "60" }, status: 429 },
        );
      }
      return Response.json(
        {
          error: {
            code: "service_unavailable",
            message: "The YGF Agent gateway is temporarily unavailable.",
            type: "server_error",
          },
        },
        { headers: HEADERS, status: 503 },
      );
    }
  };
}

export const GET = createModelsHandler();
