import { randomUUID, timingSafeEqual } from "node:crypto";

import {
  resolveAuthRuntime,
  type AuthRuntime,
  type RuntimeEnvironment,
} from "@/lib/auth/runtime";
import { createServiceRoleClient } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'",
  expires: "0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
};
const MAX_BATCH = 100;
const AUTH_CLEANUP_BATCH = 25;
const DATABASE_COUNT_KEYS = [
  "agent_replays",
  "agent_requests",
  "events",
  "public_validations",
  "redemption_attempts",
  "task_executions",
] as const;

type DatabaseMaintenanceCounts = Record<
  (typeof DATABASE_COUNT_KEYS)[number],
  number
>;
type MaintenanceCounts = DatabaseMaintenanceCounts & {
  auth_users: number;
};

interface AuthCleanupRow {
  source_user_id: string;
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

interface MaintenanceDependencies {
  createServiceClient?: typeof createServiceRoleClient;
  cleanupAuthUsers?: (client: ServiceClient) => Promise<number>;
  environment?: RuntimeEnvironment;
  resolveRuntime?: (environment: RuntimeEnvironment) => AuthRuntime;
}

function response(body: unknown, status: number) {
  return Response.json(body, { headers: HEADERS, status });
}

function authorized(request: Request, secret: string | undefined) {
  const token = request.headers.get("authorization");
  if (!secret || !token?.startsWith("Bearer ")) {
    return false;
  }
  const actual = Buffer.from(token.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  if (expected.length < 32) {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isCounts(value: unknown): value is DatabaseMaintenanceCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === DATABASE_COUNT_KEYS.length &&
    DATABASE_COUNT_KEYS.every(
      (key) =>
        typeof record[key] === "number" &&
        Number.isSafeInteger(record[key]) &&
        record[key] >= 0 &&
        record[key] <= MAX_BATCH,
    )
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function isMissingAuthUser(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "user_not_found"
  );
}

export async function cleanupRetiredAuthUsers(
  client: ServiceClient,
): Promise<number> {
  const workerToken = randomUUID();
  const { data, error } = await client.rpc(
    "claim_auth_cleanup_outbox",
    {
      p_limit: AUTH_CLEANUP_BATCH,
      p_worker_token: workerToken,
    },
  );
  if (
    error ||
    !Array.isArray(data) ||
    data.length > AUTH_CLEANUP_BATCH ||
    !data.every(
      (row): row is AuthCleanupRow =>
        typeof row === "object" &&
        row !== null &&
        isUuid((row as Record<string, unknown>).source_user_id),
    )
  ) {
    throw new Error("AUTH_CLEANUP_UNAVAILABLE");
  }

  let completed = 0;
  let failed = false;
  for (const { source_user_id: sourceUserId } of data) {
    try {
      const { error: deleteError } =
        await client.auth.admin.deleteUser(sourceUserId);
      if (deleteError && !isMissingAuthUser(deleteError)) {
        failed = true;
        continue;
      }
      const { data: completion, error: completionError } =
        await client.rpc("complete_auth_cleanup_outbox", {
          p_source_user_id: sourceUserId,
          p_worker_token: workerToken,
        });
      if (completionError || completion !== true) {
        failed = true;
        continue;
      }
      completed += 1;
    } catch {
      failed = true;
    }
  }
  if (failed) {
    throw new Error("AUTH_CLEANUP_UNAVAILABLE");
  }
  return completed;
}

export function createMaintenanceHandler(
  dependencies: MaintenanceDependencies = {},
) {
  const environment = dependencies.environment ?? process.env;
  const resolveRuntime = dependencies.resolveRuntime ?? resolveAuthRuntime;
  const createServiceClient =
    dependencies.createServiceClient ?? createServiceRoleClient;
  const cleanupAuthUsers =
    dependencies.cleanupAuthUsers ?? cleanupRetiredAuthUsers;

  return async function handle(request: Request): Promise<Response> {
    if (!authorized(request, environment.CRON_SECRET)) {
      return response({ error: "UNAUTHORIZED" }, 401);
    }

    try {
      if (resolveRuntime(environment).mode !== "supabase") {
        return response({ error: "MAINTENANCE_UNAVAILABLE" }, 503);
      }
    } catch {
      return response({ error: "MAINTENANCE_UNAVAILABLE" }, 503);
    }

    try {
      const serviceClient = createServiceClient();
      const { data, error } = await serviceClient.rpc(
        "run_bounded_global_maintenance",
        { p_limit: MAX_BATCH },
      );
      if (error || !isCounts(data)) {
        return response({ error: "MAINTENANCE_UNAVAILABLE" }, 503);
      }
      const authUsers = await cleanupAuthUsers(serviceClient);
      const counts: MaintenanceCounts = {
        ...data,
        auth_users: authUsers,
      };
      return response({ counts, ok: true }, 200);
    } catch {
      return response({ error: "MAINTENANCE_UNAVAILABLE" }, 503);
    }
  };
}

export async function GET(request: Request) {
  return createMaintenanceHandler()(request);
}
