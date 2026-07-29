import { describe, expect, it, vi } from "vitest";

import {
  createMaintenanceHandler,
} from "@/app/api/internal/maintenance/route";

const counts = {
  agent_replays: 2,
  agent_requests: 1,
  events: 4,
  public_validations: 3,
  redemption_attempts: 2,
  task_executions: 1,
};
const CRON_SECRET = "c".repeat(32);

function request(secret?: string) {
  return new Request("https://build.ygf.test/api/internal/maintenance", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("global maintenance cron route", () => {
  it("fails closed before a service RPC in demo or unauthenticated modes", async () => {
    const rpc = vi.fn();
    const handler = createMaintenanceHandler({
      createServiceClient: () => ({ rpc }) as never,
      environment: { CRON_SECRET },
      resolveRuntime: () => ({ mode: "demo" }),
    });

    const missing = await handler(request());
    const demo = await handler(request(CRON_SECRET));

    expect(missing.status).toBe(401);
    expect(demo.status).toBe(503);
    expect(demo.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a wrong cron secret without reaching runtime or service dependencies", async () => {
    const rpc = vi.fn();
    const resolveRuntime = vi.fn(() => ({ mode: "demo" as const }));
    const handler = createMaintenanceHandler({
      createServiceClient: () => ({ rpc }) as never,
      environment: { CRON_SECRET },
      resolveRuntime,
    });

    const response = await handler(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(resolveRuntime).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a matching but weak cron secret before runtime resolution", async () => {
    const rpc = vi.fn();
    const resolveRuntime = vi.fn(() => ({ mode: "demo" as const }));
    const handler = createMaintenanceHandler({
      createServiceClient: () => ({ rpc }) as never,
      environment: { CRON_SECRET: "too-short" },
      resolveRuntime,
    });

    const response = await handler(request("too-short"));

    expect(response.status).toBe(401);
    expect(resolveRuntime).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls only the bounded service-role RPC and returns aggregate counts", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: counts, error: null });
    const handler = createMaintenanceHandler({
      createServiceClient: () => ({ rpc }) as never,
      environment: { CRON_SECRET },
      resolveRuntime: () => ({
        mode: "supabase",
        publishableKey: "publishable",
        serviceKey: "service",
        url: "https://example.supabase.co",
      }),
    });

    const response = await handler(request(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({ counts, ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("run_bounded_global_maintenance", {
      p_limit: 100,
    });
  });

  it("withholds malformed database results and internal RPC failures", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...counts, events: 101 },
      error: null,
    });
    const handler = createMaintenanceHandler({
      createServiceClient: () => ({ rpc }) as never,
      environment: { CRON_SECRET },
      resolveRuntime: () => ({
        mode: "supabase",
        publishableKey: "publishable",
        serviceKey: "service",
        url: "https://example.supabase.co",
      }),
    });

    const response = await handler(request(CRON_SECRET));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "MAINTENANCE_UNAVAILABLE",
    });
  });
});
