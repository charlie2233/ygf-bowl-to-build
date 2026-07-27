import { isSameOriginMutation } from "@/lib/auth/admin";
import { getAuthenticatedUser } from "@/lib/auth/user";
import {
  getTaskRateLimiter,
  getTaskResultStore,
  resolveTaskFingerprintSecret,
  runTask as runCampaignTask,
  saveTaskResult,
  type RunTaskInput,
  type RunTaskResult,
} from "@/lib/campaign/run-task";
import {
  CampaignDomainError,
  type CampaignErrorCode,
} from "@/lib/campaign/types";
import {
  isTaskType,
  validateTaskInput,
} from "@/lib/content/tasks";
import { getTaskProvider } from "@/lib/providers";
import { resolveModel } from "@/lib/providers/model-catalog";
import { getTaskWorkflowRepository } from "@/lib/repositories/task-workflow-repository";

export const dynamic = "force-dynamic";

interface AuthenticatedUser {
  id: string;
}

interface TaskHandlerDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  getUser: () => Promise<AuthenticatedUser | null>;
  runTask: (input: RunTaskInput) => Promise<RunTaskResult>;
  saveTask?: (input: {
    sessionId: string;
    userId: string;
  }) => Promise<void>;
}

const TASK_BODY_KEYS = new Set([
  "idempotencyKey",
  "input",
  "model",
  "saveResult",
  "taskType",
]);
const MAX_TASK_BODY_BYTES = 64 * 1_024;

async function readBoundedJson(
  request: Request,
  maximumBytes: number,
) {
  const mediaType =
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() ?? "";
  if (mediaType !== "application/json" || !request.body) {
    throw new Error("JSON_BODY_REQUIRED");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new Error("JSON_BODY_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text) as unknown;
}

function taskResponse(body: unknown, status: number) {
  return Response.json(body, {
    headers: {
      "cache-control": "private, no-store",
    },
    status,
  });
}

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  );
}

function parseTaskBody(value: unknown): Omit<RunTaskInput, "userId"> {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some((key) => !TASK_BODY_KEYS.has(key)) ||
    !validIdempotencyKey(value.idempotencyKey) ||
    !isTaskType(value.taskType) ||
    (value.model !== undefined &&
      (typeof value.model !== "string" || value.model.length > 32)) ||
    (value.saveResult !== undefined &&
      typeof value.saveResult !== "boolean")
  ) {
    throw new Error("TASK_REQUEST_INVALID");
  }
  const input = validateTaskInput(value.input);
  if (value.model !== undefined) {
    resolveModel(value.taskType, value.model);
  }
  return {
    idempotencyKey: value.idempotencyKey,
    input,
    ...(value.model === undefined ? {} : { model: value.model }),
    ...(value.saveResult === undefined
      ? {}
      : { saveResult: value.saveResult }),
    taskType: value.taskType,
  };
}

function mapDomainError(code: CampaignErrorCode) {
  switch (code) {
    case "INSUFFICIENT_CREDITS":
      return taskResponse({ error: code }, 409);
    case "WALLET_EXPIRED":
      return taskResponse({ error: code }, 410);
    case "WALLET_NOT_FOUND":
      return taskResponse({ error: code }, 404);
    case "PROVIDER_COST_LIMIT_EXCEEDED":
      return taskResponse({ error: "PROVIDER_LIMIT_REACHED" }, 409);
    case "IDEMPOTENCY_CONFLICT":
      return taskResponse({ error: "TASK_IDEMPOTENCY_CONFLICT" }, 409);
    default:
      return taskResponse({ error: "TASK_UNAVAILABLE" }, 503);
  }
}

function browserTaskResult(result: RunTaskResult) {
  if (result.status === "failed") {
    return {
      error: result.error,
      remainingCredits: result.remainingCredits,
      sessionId: result.sessionId,
      status: result.status,
    };
  }
  return {
    friendlyModel: result.friendlyModel,
    output: result.output,
    remainingCredits: result.remainingCredits,
    sessionId: result.sessionId,
    status: result.status,
  };
}

export function createTaskHandler({
  environment = process.env,
  getUser,
  runTask,
}: TaskHandlerDependencies) {
  return async function handleTask(request: Request) {
    if (!isSameOriginMutation(request, environment)) {
      return taskResponse({ error: "ORIGIN_FORBIDDEN" }, 403);
    }
    const declaredLength = request.headers.get("content-length");
    if (
      declaredLength &&
      (!/^\d+$/u.test(declaredLength) ||
        Number(declaredLength) > MAX_TASK_BODY_BYTES)
    ) {
      return taskResponse({ error: "TASK_REQUEST_INVALID" }, 400);
    }

    let user: AuthenticatedUser | null;
    try {
      user = await getUser();
    } catch {
      return taskResponse({ error: "TASK_UNAVAILABLE" }, 503);
    }
    if (!user) {
      return taskResponse(
        { error: "AUTHENTICATION_REQUIRED" },
        401,
      );
    }

    let parsed: Omit<RunTaskInput, "userId">;
    try {
      parsed = parseTaskBody(
        await readBoundedJson(request, MAX_TASK_BODY_BYTES),
      );
    } catch {
      return taskResponse({ error: "TASK_REQUEST_INVALID" }, 400);
    }

    try {
      const result = await runTask({ ...parsed, userId: user.id });
      return taskResponse(
        browserTaskResult(result),
        result.status === "completed" ? 200 : 503,
      );
    } catch (error) {
      if (error instanceof CampaignDomainError) {
        return mapDomainError(error.code);
      }
      if (error instanceof Error) {
        if (error.message === "TASK_THROTTLED") {
          return taskResponse({ error: "TASK_THROTTLED" }, 429);
        }
        if (error.message === "TASK_IN_PROGRESS") {
          return taskResponse({ error: "TASK_IN_PROGRESS" }, 409);
        }
        if (error.message === "RESULT_REPLAY_EXPIRED") {
          return taskResponse(
            { error: "RESULT_REPLAY_EXPIRED" },
            410,
          );
        }
        if (error.message === "TASK_IDEMPOTENCY_CONFLICT") {
          return taskResponse(
            { error: "TASK_IDEMPOTENCY_CONFLICT" },
            409,
          );
        }
        if (
          error.message === "MODEL_NOT_ALLOWED" ||
          error.message === "TASK_INPUT_INVALID" ||
          error.message === "TASK_INPUT_TOO_LONG" ||
          error.message === "TASK_REQUEST_INVALID"
        ) {
          return taskResponse({ error: "TASK_REQUEST_INVALID" }, 400);
        }
      }
      return taskResponse({ error: "TASK_UNAVAILABLE" }, 503);
    }
  };
}

export function createSaveTaskHandler({
  environment = process.env,
  getUser,
  saveTask,
}: TaskHandlerDependencies) {
  return async function handleSaveTask(request: Request) {
    if (!isSameOriginMutation(request, environment)) {
      return taskResponse({ error: "ORIGIN_FORBIDDEN" }, 403);
    }
    let user: AuthenticatedUser | null;
    try {
      user = await getUser();
    } catch {
      return taskResponse({ error: "TASK_UNAVAILABLE" }, 503);
    }
    if (!user) {
      return taskResponse(
        { error: "AUTHENTICATION_REQUIRED" },
        401,
      );
    }
    if (!saveTask) {
      return taskResponse({ error: "TASK_UNAVAILABLE" }, 503);
    }

    let sessionId: unknown;
    try {
      const body = await readBoundedJson(request, 1_024);
      if (
        !isPlainRecord(body) ||
        Object.keys(body).length !== 1 ||
        !Object.hasOwn(body, "sessionId")
      ) {
        throw new Error("TASK_SAVE_INVALID");
      }
      sessionId = body.sessionId;
      if (
        typeof sessionId !== "string" ||
        sessionId.length < 1 ||
        sessionId.length > 128 ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(sessionId)
      ) {
        throw new Error("TASK_SAVE_INVALID");
      }
    } catch {
      return taskResponse({ error: "TASK_SAVE_INVALID" }, 400);
    }

    try {
      await saveTask({ sessionId, userId: user.id });
      return taskResponse({ saved: true }, 200);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "RESULT_NO_LONGER_AVAILABLE"
      ) {
        return taskResponse(
          { error: "RESULT_NO_LONGER_AVAILABLE" },
          410,
        );
      }
      return taskResponse({ error: "TASK_UNAVAILABLE" }, 503);
    }
  };
}

function productionDependencies(): TaskHandlerDependencies {
  const repository = getTaskWorkflowRepository();
  const resultStore = getTaskResultStore();
  return {
    getUser: getAuthenticatedUser,
    runTask(input) {
      return runCampaignTask(input, {
        fingerprintSecret: resolveTaskFingerprintSecret(),
        provider: getTaskProvider(),
        rateLimiter: getTaskRateLimiter(),
        repository,
        resultStore,
      });
    },
    saveTask({ sessionId, userId }) {
      return saveTaskResult({
        repository,
        resultStore,
        sessionId,
        userId,
      });
    },
  };
}

export async function POST(request: Request) {
  return createTaskHandler(productionDependencies())(request);
}

export async function PATCH(request: Request) {
  return createSaveTaskHandler(productionDependencies())(request);
}
