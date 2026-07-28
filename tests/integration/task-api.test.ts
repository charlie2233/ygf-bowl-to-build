import { describe, expect, it, vi } from "vitest";

import {
  createTaskHandler,
} from "@/app/api/tasks/route";
import { createHistoryHandler } from "@/app/api/history/route";
import type { RunTaskInput } from "@/lib/campaign/run-task";

const TASK_ENVIRONMENT = {
  YGF_DEMO_MODE: "true",
  YGF_TASK_FINGERPRINT_SECRET:
    "task-api-test-fingerprint-secret-at-least-32-bytes",
};

describe("task API boundary", () => {
  it("derives identity server-side and returns a privacy-safe task DTO", async () => {
    const runTask = vi.fn(async (input: RunTaskInput) => {
      void input;
      return {
        friendlyModel: "Balanced guide",
        output: {
          sections: [{ heading: "Key ideas", items: ["Useful"] }],
          title: "Your study guide",
        },
        providerCostMicroUsd: 2_400,
        providerRequestId: "provider-request-secret",
        remainingCredits: 2_880,
        sessionId: "session-1",
        status: "completed" as const,
      };
    });
    const handler = createTaskHandler({
      environment: TASK_ENVIRONMENT,
      getUser: async () => ({ id: "server-user" }),
      runTask,
    });

    const response = await handler(
      new Request("https://ygf.example/api/tasks", {
        body: JSON.stringify({
          idempotencyKey: "task-request-1",
          input: "Explain active recall.",
          taskType: "study",
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://ygf.example",
        },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "server-user" }),
    );
    const executionInput = runTask.mock.calls[0]?.[0];
    expect(executionInput?.idempotencyKey).toMatch(
      /^idem_[0-9a-f]{64}$/u,
    );
    expect(executionInput?.idempotencyKey).not.toContain(
      "task-request-1",
    );
    expect(body).not.toHaveProperty("providerCostMicroUsd");
    expect(body).not.toHaveProperty("providerRequestId");
    expect(body).not.toHaveProperty("userId");
  });

  it("rejects caller-selected identity, provider ids, extra fields, and invalid input", async () => {
    const runTask = vi.fn();
    const handler = createTaskHandler({
      environment: TASK_ENVIRONMENT,
      getUser: async () => ({ id: "server-user" }),
      runTask,
    });

    for (const body of [
      {
        idempotencyKey: "task-request-1",
        input: "text",
        taskType: "study",
        userId: "attacker",
      },
      {
        idempotencyKey: "task-request-1",
        input: "text",
        model: "openai/gpt-4.1-mini",
        taskType: "study",
      },
      {
        attachment: { url: "https://attacker.example/file" },
        idempotencyKey: "task-request-1",
        input: "text",
        taskType: "study",
      },
      {
        idempotencyKey: "task-request-1",
        input: "",
        taskType: "study",
      },
    ]) {
      const response = await handler(
        new Request("https://ygf.example/api/tasks", {
          body: JSON.stringify(body),
          headers: {
            "content-type": "application/json",
            origin: "https://ygf.example",
          },
          method: "POST",
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(runTask).not.toHaveBeenCalled();
  });

  it("requires authentication and safely maps domain/provider errors", async () => {
    const unauthenticated = createTaskHandler({
      environment: TASK_ENVIRONMENT,
      getUser: async () => null,
      runTask: vi.fn(),
    });
    expect(
      (
        await unauthenticated(
          new Request("https://ygf.example/api/tasks", {
            body: "{}",
            headers: { origin: "https://ygf.example" },
            method: "POST",
          }),
        )
      ).status,
    ).toBe(401);

    const unavailable = createTaskHandler({
      environment: TASK_ENVIRONMENT,
      getUser: async () => ({ id: "server-user" }),
      runTask: vi.fn(async () => {
        throw new Error(
          "provider debug prompt=private authorization=secret",
        );
      }),
    });
    const response = await unavailable(
      new Request("https://ygf.example/api/tasks", {
        body: JSON.stringify({
          idempotencyKey: "task-request-1",
          input: "text",
          taskType: "study",
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://ygf.example",
        },
        method: "POST",
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "TASK_UNAVAILABLE",
    });
  });

  it("bounds chunked or missing-length JSON before parsing it", async () => {
    const runTask = vi.fn();
    const handler = createTaskHandler({
      environment: TASK_ENVIRONMENT,
      getUser: async () => ({ id: "server-user" }),
      runTask,
    });
    const response = await handler(
      new Request("https://ygf.example/api/tasks", {
        body: JSON.stringify({
          idempotencyKey: "task-request-oversized",
          input: "x".repeat(17_000),
          taskType: "study",
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://ygf.example",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(runTask).not.toHaveBeenCalled();
  });

  it("accepts the advertised 12,000-character Unicode input within a bounded body", async () => {
    const runTask = vi.fn(async () => ({
      friendlyModel: "Balanced guide",
      output: {
        sections: [{ heading: "Key ideas", items: ["Useful"] }],
        title: "Your study guide",
      },
      remainingCredits: 2_880,
      sessionId: "session-unicode",
      status: "completed" as const,
    }));
    const handler = createTaskHandler({
      environment: TASK_ENVIRONMENT,
      getUser: async () => ({ id: "server-user" }),
      runTask,
    });
    const input = "学".repeat(12_000);
    const response = await handler(
      new Request("https://ygf.example/api/tasks", {
        body: JSON.stringify({
          idempotencyKey: "task-request-unicode",
          input,
          taskType: "study",
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://ygf.example",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({ input }),
    );
  });

  it("rejects cross-origin task mutations before authentication or provider work", async () => {
    const getUser = vi.fn(async () => ({ id: "server-user" }));
    const runTask = vi.fn();
    const handler = createTaskHandler({
      environment: TASK_ENVIRONMENT,
      getUser,
      runTask,
    });
    const response = await handler(
      new Request("https://ygf.example/api/tasks", {
        body: JSON.stringify({
          idempotencyKey: "task-request-cross-origin",
          input: "text",
          taskType: "study",
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
    expect(runTask).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { YGF_DEMO_MODE: "true" }],
    [
      "weak",
      {
        YGF_DEMO_MODE: "true",
        YGF_TASK_FINGERPRINT_SECRET: "too-short",
      },
    ],
  ])(
    "maps %s task fingerprint configuration to 503 before task work",
    async (_label, environment) => {
      const runTask = vi.fn();
      const handler = createTaskHandler({
        environment,
        getUser: async () => ({ id: "server-user" }),
        runTask,
      });
      const response = await handler(
        new Request("https://ygf.example/api/tasks", {
          body: JSON.stringify({
            idempotencyKey: "task-secret-config-check",
            input: "text",
            taskType: "study",
          }),
          headers: {
            "content-type": "application/json",
            origin: "https://ygf.example",
          },
          method: "POST",
        }),
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "TASK_UNAVAILABLE",
      });
      expect(runTask).not.toHaveBeenCalled();
    },
  );

  it("lists only the authenticated user's safe history metadata and saved output", async () => {
    const repository = {
      listHistory: vi.fn(async () => [
        {
          createdAt: "2026-09-01T12:00:00.000Z",
          id: "session-1",
          inputUnits: 10,
          model: "gpt-5.4-mini-2026-03-17",
          outputUnits: 20,
          providerCostMicroUsd: 2_400,
          reservationId: "reservation-secret",
          savedOutput:
            '{"title":"Saved guide","sections":[{"heading":"Ideas","items":["Useful"]}]}',
          status: "completed" as const,
          taskType: "study" as const,
          title: "Study help",
          userId: "server-user",
        },
      ]),
    };
    const handler = createHistoryHandler({
      getUser: async () => ({ id: "server-user" }),
      repository,
    });

    const response = await handler();
    const body = await response.json();

    expect(repository.listHistory).toHaveBeenCalledWith({
      userId: "server-user",
    });
    expect(body.sessions[0]).toMatchObject({
      friendlyModel: "Balanced guide",
      id: "session-1",
      savedOutput: {
        title: "Saved guide",
      },
    });
    expect(body.sessions[0]).not.toHaveProperty("userId");
    expect(body.sessions[0]).not.toHaveProperty("reservationId");
    expect(body.sessions[0]).not.toHaveProperty(
      "providerCostMicroUsd",
    );
  });
});
