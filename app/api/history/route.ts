import { getAuthenticatedUser } from "@/lib/auth/user";
import type { TaskSession } from "@/lib/campaign/types";
import { friendlyModelName } from "@/lib/providers/model-catalog";
import { parseTaskOutput } from "@/lib/providers/provider";
import {
  getTaskWorkflowRepository,
  type TaskWorkflowRepository,
} from "@/lib/repositories/task-workflow-repository";

export const dynamic = "force-dynamic";

interface HistoryHandlerDependencies {
  getUser: () => Promise<{ id: string } | null>;
  repository: Pick<TaskWorkflowRepository, "listHistory">;
}

function historyResponse(body: unknown, status: number) {
  return Response.json(body, {
    headers: { "cache-control": "private, no-store" },
    status,
  });
}

function safeSavedOutput(session: TaskSession) {
  if (!session.savedOutput) {
    return undefined;
  }
  try {
    return parseTaskOutput(JSON.parse(session.savedOutput));
  } catch {
    return undefined;
  }
}

function toBrowserHistorySession(session: TaskSession) {
  const savedOutput = safeSavedOutput(session);
  return {
    createdAt: session.createdAt,
    friendlyModel: friendlyModelName(session.model),
    id: session.id,
    ...(savedOutput === undefined ? {} : { savedOutput }),
    status: session.status,
    taskType: session.taskType,
    title: session.title,
  };
}

export function createHistoryHandler({
  getUser,
  repository,
}: HistoryHandlerDependencies) {
  return async function handleHistory() {
    let user: { id: string } | null;
    try {
      user = await getUser();
    } catch {
      return historyResponse({ error: "HISTORY_UNAVAILABLE" }, 503);
    }
    if (!user) {
      return historyResponse(
        { error: "AUTHENTICATION_REQUIRED" },
        401,
      );
    }

    try {
      const history = await repository.listHistory({
        userId: user.id,
      });
      return historyResponse(
        { sessions: history.map(toBrowserHistorySession) },
        200,
      );
    } catch {
      return historyResponse({ error: "HISTORY_UNAVAILABLE" }, 503);
    }
  };
}

export async function GET() {
  return createHistoryHandler({
    getUser: getAuthenticatedUser,
    repository: getTaskWorkflowRepository(),
  })();
}
