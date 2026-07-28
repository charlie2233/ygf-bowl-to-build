import {
  authenticateAgentRequest,
  type AuthenticatedAgentRequest,
} from "@/lib/agent/authenticate";
import {
  fingerprintAgentIdempotencyKey,
  runAgentChat,
} from "@/lib/agent/gateway";
import { isAgentGatewayReady } from "@/lib/agent/readiness";
import {
  parseAgentChatRequest,
  type ParsedAgentChatRequest,
} from "@/lib/agent/openai-contract";
import { AGENT_REQUEST_LIMITS } from "@/lib/agent/policy";
import {
  BoundedBodyError,
  readBoundedRequestText,
} from "@/lib/admin/http";
import {
  AgentGatewayError,
  getAgentGatewayRepository,
} from "@/lib/repositories/agent-gateway-repository";

export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
};

function openAiError(
  status: number,
  code: string,
  message: string,
  type: string,
  headers: Readonly<Record<string, string>> = {},
) {
  return Response.json(
    { error: { code, message, type } },
    {
      headers: {
        ...BASE_HEADERS,
        ...headers,
      },
      status,
    },
  );
}

interface ChatHandlerDependencies {
  admit?: (keyDigest: string) => Promise<void>;
  authenticate?: (
    request: Request,
  ) => Promise<AuthenticatedAgentRequest>;
  run?: (input: {
    idempotencyKey: string;
    keyDigest: string;
    principal: AuthenticatedAgentRequest["principal"];
    request: ParsedAgentChatRequest;
  }) => Promise<Readonly<Record<string, unknown>>>;
  environment?: Readonly<Record<string, string | undefined>>;
}

export function createChatCompletionsHandler({
  admit,
  authenticate = authenticateAgentRequest,
  environment = process.env,
  run = (input) => runAgentChat(input),
}: ChatHandlerDependencies = {}) {
  return async function handle(request: Request) {
    if (!isAgentGatewayReady(environment)) {
      return openAiError(
        503,
        "gateway_not_enabled",
        "The YGF Agent gateway is not enabled for production connections.",
        "server_error",
      );
    }
    let authenticated: AuthenticatedAgentRequest;
    try {
      authenticated = await authenticate(request);
    } catch (error) {
      if (
        error instanceof AgentGatewayError &&
        error.code === "AUTHENTICATION_FAILED"
      ) {
        return openAiError(
          401,
          "invalid_api_key",
          "Invalid or inactive API key.",
          "authentication_error",
          { "www-authenticate": "Bearer" },
        );
      }
      return openAiError(
        503,
        "service_unavailable",
        "The YGF Agent gateway is temporarily unavailable.",
        "server_error",
      );
    }

    try {
      await (admit ?? ((keyDigest) =>
        getAgentGatewayRepository().admitRequest(keyDigest))) (
        authenticated.keyDigest,
      );
    } catch (error) {
      if (
        error instanceof AgentGatewayError &&
        error.code === "AUTHENTICATION_FAILED"
      ) {
        return openAiError(
          401,
          "invalid_api_key",
          "Invalid or inactive API key.",
          "authentication_error",
          { "www-authenticate": "Bearer" },
        );
      }
      if (error instanceof AgentGatewayError && error.code === "RATE_LIMITED") {
        return openAiError(
          429,
          "rate_limit_exceeded",
          "This API key has reached its per-minute request limit.",
          "rate_limit_error",
          { "retry-after": "60" },
        );
      }
      return openAiError(
        503,
        "service_unavailable",
        "The YGF Agent gateway is temporarily unavailable.",
        "server_error",
      );
    }

    let requestIdempotencyKey: string;
    try {
      const supplied = request.headers.get("idempotency-key");
      if (!supplied) {
        throw new Error("CLIENT_IDEMPOTENCY_KEY_INVALID");
      }
      requestIdempotencyKey = fingerprintAgentIdempotencyKey(
        supplied.trim(),
        environment,
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "CLIENT_IDEMPOTENCY_KEY_INVALID"
      ) {
        return openAiError(
          503,
          "service_unavailable",
          "The YGF Agent gateway is temporarily unavailable.",
          "server_error",
        );
      }
      return openAiError(
        400,
        "invalid_request",
        "A stable Idempotency-Key header is required for safe retries.",
        "invalid_request_error",
      );
    }

    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() !== "application/json"
    ) {
      return openAiError(
        400,
        "invalid_request",
        "A bounded JSON request body is required.",
        "invalid_request_error",
      );
    }

    let parsed: ParsedAgentChatRequest;
    try {
      const text = await readBoundedRequestText(
        request,
        AGENT_REQUEST_LIMITS.maximumBodyBytes,
      );
      parsed = parseAgentChatRequest(
        JSON.parse(text) as unknown,
        Buffer.byteLength(text, "utf8"),
      );
    } catch (error) {
      const tooLarge =
        error instanceof BoundedBodyError &&
        error.code === "BODY_TOO_LARGE";
      return openAiError(
        tooLarge ? 413 : 400,
        tooLarge ? "request_too_large" : "invalid_request",
        tooLarge
          ? "The request exceeds the YGF Agent body limit."
          : "The OpenAI-compatible request is invalid or unsupported.",
        "invalid_request_error",
      );
    }

    try {
      const body = await run({
        idempotencyKey: requestIdempotencyKey,
        keyDigest: authenticated.keyDigest,
        principal: authenticated.principal,
        request: parsed,
      });
      return Response.json(body, {
        headers: {
          ...BASE_HEADERS,
          "x-ygf-remaining-credits": String(
            (
              body.ygf as
                | { remaining_credits?: unknown }
                | undefined
            )?.remaining_credits ?? "",
          ),
        },
        status: 200,
      });
    } catch (error) {
      if (error instanceof AgentGatewayError) {
        if (error.code === "AUTHENTICATION_FAILED") {
          return openAiError(
            401,
            "invalid_api_key",
            "Invalid or inactive API key.",
            "authentication_error",
          );
        }
        if (error.code === "RATE_LIMITED") {
          return openAiError(
            429,
            "rate_limit_exceeded",
            "This API key has reached its per-minute request limit.",
            "rate_limit_error",
            { "retry-after": "60" },
          );
        }
        if (error.code === "CONCURRENCY_LIMITED") {
          return openAiError(
            409,
            "request_in_progress",
            "An identical or concurrent request is still running.",
            "invalid_request_error",
            { "retry-after": "2" },
          );
        }
        if (
          error.code === "INSUFFICIENT_CREDITS" ||
          error.code === "PROVIDER_LIMIT_REACHED"
        ) {
          return openAiError(
            402,
            "insufficient_quota",
            "The YGF wallet does not have enough available quota.",
            "insufficient_quota",
          );
        }
        if (error.code === "IDEMPOTENCY_CONFLICT") {
          return openAiError(
            409,
            "idempotency_conflict",
            "This idempotency key was already used for another request.",
            "invalid_request_error",
          );
        }
      }
      if (
        error instanceof Error &&
        (error.message === "AGENT_MODEL_NOT_ALLOWED" ||
          error.message === "AGENT_IDEMPOTENCY_KEY_INVALID")
      ) {
        return openAiError(
          400,
          "invalid_request",
          "The model or idempotency key is not allowed.",
          "invalid_request_error",
        );
      }
      return openAiError(
        502,
        "provider_unavailable",
        "The model provider is temporarily unavailable. Credits were released, but the provider safety budget may remain consumed.",
        "server_error",
      );
    }
  };
}

export const POST = createChatCompletionsHandler();
