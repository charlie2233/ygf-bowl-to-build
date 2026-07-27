import {
  BoundedBodyError,
  readBoundedRequestText,
} from "@/lib/admin/http";
import {
  isSameOriginAdminMutation,
} from "@/lib/auth/admin";
import { getAuthenticatedUser } from "@/lib/auth/user";
import {
  recordPartnerHandoffSignal,
} from "@/lib/analytics/server-signals";

export const dynamic = "force-dynamic";

const OPENROUTER_DESTINATION = "https://openrouter.ai/";
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
};

interface PartnerSignalHandlerDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  getUser?: typeof getAuthenticatedUser;
  recordSignal?: (userId: string) => Promise<boolean>;
}

function responseJson(
  body: Readonly<Record<string, unknown>>,
  status: number,
): Response {
  return Response.json(body, {
    headers: PRIVATE_HEADERS,
    status,
  });
}

async function hasEmptyBody(request: Request): Promise<boolean> {
  try {
    return (await readBoundedRequestText(request, 1)).length === 0;
  } catch (error) {
    if (
      error instanceof BoundedBodyError &&
      error.code === "BODY_TOO_LARGE"
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Records one fixed, server-owned partner handoff for the signed-in user.
 * Callers cannot select an event name, source, metadata, or identity.
 */
export function createPartnerHandoffSignalHandler({
  environment = process.env,
  getUser = getAuthenticatedUser,
  recordSignal = recordPartnerHandoffSignal,
}: PartnerSignalHandlerDependencies = {}) {
  return async function handle(request: Request): Promise<Response> {
    if (!isSameOriginAdminMutation(request, environment)) {
      return responseJson({ error: "ORIGIN_FORBIDDEN" }, 403);
    }

    let emptyBody: boolean;
    try {
      emptyBody = await hasEmptyBody(request);
    } catch {
      return responseJson({ error: "EVENT_UNAVAILABLE" }, 503);
    }
    if (!emptyBody) {
      return responseJson({ error: "EVENT_PAYLOAD_FORBIDDEN" }, 400);
    }

    let user;
    try {
      user = await getUser();
    } catch {
      return responseJson({ error: "EVENT_UNAVAILABLE" }, 503);
    }
    if (!user) {
      return responseJson({ error: "AUTHENTICATION_REQUIRED" }, 401);
    }

    let eligible: boolean;
    try {
      eligible = await recordSignal(user.id);
    } catch {
      return responseJson({ error: "EVENT_UNAVAILABLE" }, 503);
    }
    if (!eligible) {
      return responseJson({ error: "TASK_COMPLETION_REQUIRED" }, 403);
    }

    return new Response(null, {
      headers: {
        ...PRIVATE_HEADERS,
        location: OPENROUTER_DESTINATION,
      },
      status: 303,
    });
  };
}

export async function POST(request: Request) {
  return createPartnerHandoffSignalHandler()(request);
}
