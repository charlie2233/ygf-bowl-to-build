import { describe, expect, it, vi } from "vitest";

import {
  cleanupRetiredAuthUsers,
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
const completedCounts = { ...counts, auth_users: 2 };
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
    const cleanupAuthUsers = vi.fn().mockResolvedValue(2);
    const serviceClient = { rpc } as never;
    const handler = createMaintenanceHandler({
      cleanupAuthUsers,
      createServiceClient: () => serviceClient,
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
    expect(await response.json()).toEqual({
      counts: completedCounts,
      ok: true,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("run_bounded_global_maintenance", {
      p_limit: 100,
    });
    expect(cleanupAuthUsers).toHaveBeenCalledWith(serviceClient);
  });

  it("withholds malformed database results and internal RPC failures", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...counts, events: 101 },
      error: null,
    });
    const handler = createMaintenanceHandler({
      cleanupAuthUsers: vi.fn(),
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

  it("deletes only bounded retired anonymous users and treats an already-missing user as idempotent", async () => {
    const firstUserId = "11111111-1111-4111-8111-111111111111";
    const secondUserId = "22222222-2222-4222-8222-222222222222";
    const rpc = vi.fn(
      async (name: string, parameters?: Record<string, unknown>) => {
        void parameters;
        if (name === "claim_auth_cleanup_outbox") {
          return {
            data: [
              { source_user_id: firstUserId },
              { source_user_id: secondUserId },
            ],
            error: null,
          };
        }
        if (name === "complete_auth_cleanup_outbox") {
          return { data: true, error: null };
        }
        throw new Error("unexpected RPC");
      },
    );
    const deleteUser = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({
        error: { code: "user_not_found", status: 404 },
      });
    const client = {
      auth: { admin: { deleteUser } },
      rpc,
    } as never;

    await expect(cleanupRetiredAuthUsers(client)).resolves.toBe(2);
    expect(deleteUser).toHaveBeenNthCalledWith(1, firstUserId);
    expect(deleteUser).toHaveBeenNthCalledWith(2, secondUserId);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "claim_auth_cleanup_outbox",
      {
        p_limit: 25,
        p_worker_token: expect.any(String),
      },
    );
    const workerToken = rpc.mock.calls[0]?.[1]?.p_worker_token;
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "complete_auth_cleanup_outbox",
      {
        p_source_user_id: firstUserId,
        p_worker_token: workerToken,
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "complete_auth_cleanup_outbox",
      {
        p_source_user_id: secondUserId,
        p_worker_token: workerToken,
      },
    );
  });

  it("fails closed when a cleanup lease cannot be completed by its claimant", async () => {
    const sourceUserId = "33333333-3333-4333-8333-333333333333";
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ source_user_id: sourceUserId }],
        error: null,
      })
      .mockResolvedValueOnce({ data: false, error: null });
    const client = {
      auth: {
        admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) },
      },
      rpc,
    } as never;

    await expect(cleanupRetiredAuthUsers(client)).rejects.toThrow(
      "AUTH_CLEANUP_UNAVAILABLE",
    );
  });

  it("keeps an unrelated 404 retryable while later claimed rows still complete", async () => {
    const failedUserId = "44444444-4444-4444-8444-444444444444";
    const completedUserId = "55555555-5555-4555-8555-555555555555";
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          { source_user_id: failedUserId },
          { source_user_id: completedUserId },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const deleteUser = vi
      .fn()
      .mockResolvedValueOnce({
        error: { code: "proxy_not_found", status: 404 },
      })
      .mockResolvedValueOnce({ error: null });
    const client = {
      auth: { admin: { deleteUser } },
      rpc,
    } as never;

    await expect(cleanupRetiredAuthUsers(client)).rejects.toThrow(
      "AUTH_CLEANUP_UNAVAILABLE",
    );
    expect(deleteUser).toHaveBeenNthCalledWith(1, failedUserId);
    expect(deleteUser).toHaveBeenNthCalledWith(2, completedUserId);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "complete_auth_cleanup_outbox",
      expect.objectContaining({
        p_source_user_id: completedUserId,
      }),
    );
  });
});
