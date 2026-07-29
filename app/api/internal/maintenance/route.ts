import { timingSafeEqual } from "node:crypto";

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
const COUNT_KEYS = [
  "agent_replays",
  "agent_requests",
  "events",
  "public_validations",
  "redemption_attempts",
  "task_executions",
] as const;

type MaintenanceCounts = Record<(typeof COUNT_KEYS)[number], number>;

interface MaintenanceDependencies {
  createServiceClient?: typeof createServiceRoleClient;
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

function isCounts(value: unknown): value is MaintenanceCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === COUNT_KEYS.length &&
    COUNT_KEYS.every(
      (key) =>
        typeof record[key] === "number" &&
        Number.isSafeInteger(record[key]) &&
        record[key] >= 0 &&
        record[key] <= MAX_BATCH,
    )
  );
}

export function createMaintenanceHandler(
  dependencies: MaintenanceDependencies = {},
) {
  const environment = dependencies.environment ?? process.env;
  const resolveRuntime = dependencies.resolveRuntime ?? resolveAuthRuntime;
  const createServiceClient =
    dependencies.createServiceClient ?? createServiceRoleClient;

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
      const { data, error } = await createServiceClient().rpc(
        "run_bounded_global_maintenance",
        { p_limit: MAX_BATCH },
      );
      if (error || !isCounts(data)) {
        return response({ error: "MAINTENANCE_UNAVAILABLE" }, 503);
      }
      return response({ counts: data, ok: true }, 200);
    } catch {
      return response({ error: "MAINTENANCE_UNAVAILABLE" }, 503);
    }
  };
}

export async function GET(request: Request) {
  return createMaintenanceHandler()(request);
}
