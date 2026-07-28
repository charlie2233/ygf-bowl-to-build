import { describe, expect, it, vi } from "vitest";

import type { TaskSession } from "@/lib/campaign/types";
import type { CampaignRepository } from "@/lib/repositories/campaign-repository";
import { DemoTaskWorkflowRepository } from "@/lib/repositories/task-workflow-repository";

function session(
  id: string,
  createdAt: string,
  status: TaskSession["status"],
  taskType: TaskSession["taskType"] = "study",
): TaskSession {
  return {
    createdAt,
    id,
    inputUnits: 1,
    model: "demo",
    outputUnits: status === "completed" ? 1 : 0,
    providerCostMicroUsd: 0,
    reservationId: `reservation-${id}`,
    status,
    taskType,
    title: `${status} ${id}`,
    userId: "demo-user",
  };
}

function repositoryWithHistory(history: readonly TaskSession[]) {
  const listHistory = vi.fn(async () => history);
  const campaign = { listHistory } as unknown as CampaignRepository;
  return {
    listHistory,
    repository: new DemoTaskWorkflowRepository(campaign),
  };
}

describe("demo earliest completed task", () => {
  it("finds a completed task beyond 100 newer failed sessions", async () => {
    const failures = Array.from({ length: 150 }, (_, index) =>
      session(
        `failed-${String(index).padStart(3, "0")}`,
        new Date(
          Date.parse("2026-07-02T00:00:00.000Z") + index * 1_000,
        ).toISOString(),
        "failed",
      ),
    ).reverse();
    const earliest = session(
      "completed-oldest",
      "2026-07-01T00:00:00.000Z",
      "completed",
      "career",
    );
    const { repository } = repositoryWithHistory([
      ...failures,
      earliest,
    ]);

    await expect(
      repository.getEarliestCompletedTask({ userId: "demo-user" }),
    ).resolves.toEqual(earliest);
  });

  it("breaks equal-timestamp ties by ascending session id", async () => {
    const laterId = session(
      "session-b",
      "2026-07-01T00:00:00.000Z",
      "completed",
      "coding",
    );
    const earlierId = session(
      "session-a",
      "2026-07-01T00:00:00.000Z",
      "completed",
      "study",
    );
    const { repository } = repositoryWithHistory([
      laterId,
      earlierId,
    ]);

    await expect(
      repository.getEarliestCompletedTask({ userId: "demo-user" }),
    ).resolves.toEqual(earlierId);
  });
});
