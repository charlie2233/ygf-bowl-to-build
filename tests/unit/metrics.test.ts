import { describe, expect, it } from "vitest";

import {
  computeMetrics,
  type MetricEvent,
} from "@/lib/analytics/metrics";

function event(
  id: string,
  name: MetricEvent["name"],
  options: Partial<MetricEvent> = {},
): MetricEvent {
  return {
    createdAt: "2026-07-27T12:00:00.000Z",
    id,
    name,
    ...options,
  };
}

describe("campaign analytics metrics", () => {
  it("computes the beta funnel from distinct users", () => {
    const events: MetricEvent[] = [
      event("distribution", "batch_distributed", {
        metadata: { count: 300 },
        source: "admin",
      }),
      ...Array.from({ length: 66 }, (_, index) =>
        event(`redeem-${index}`, "code_redeemed", {
          metadata: { outcome: "success" },
          source: index < 50 ? "receipt-qr" : "counter-card",
          userId: `redeemed-user-${index}`,
        }),
      ),
      ...Array.from({ length: 36 }, (_, index) =>
        event(`activate-${index}`, "task_completed", {
          metadata: {
            outcome: "success",
            taskType: "study",
          },
          source: "task",
          userId: `redeemed-user-${index}`,
        }),
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        event(`return-${index}`, "task_completed", {
          metadata: {
            isReturning: true,
            outcome: "success",
            taskType: "coding",
          },
          source: "task",
          userId: `redeemed-user-${index}`,
        }),
      ),
      ...Array.from({ length: 7 }, (_, index) =>
        event(`connect-${index}`, "partner_connected", {
          metadata: { connectionState: "connected" },
          source: "wallet",
          userId: `redeemed-user-${index}`,
        }),
      ),
    ];

    expect(
      computeMetrics(events, {
        providerCostMicroUsd: 123_456,
        remainingCredits: 75_000,
      }),
    ).toMatchObject({
      activated: 36,
      connected: 7,
      distributed: 300,
      providerCostMicroUsd: 123_456,
      redeemed: 66,
      remainingCredits: 75_000,
      returned: 20,
    });
  });

  it("deduplicates users, computes a bounded task error rate, and attributes redemptions by source", () => {
    const metrics = computeMetrics([
      event("r1", "code_redeemed", {
        metadata: { outcome: "success" },
        source: "receipt-qr",
        userId: "user-1",
      }),
      event("r1-duplicate", "code_redeemed", {
        metadata: { outcome: "success" },
        source: "receipt-qr",
        userId: "user-1",
      }),
      event("r2", "code_redeemed", {
        metadata: { outcome: "success" },
        source: "counter-card",
        userId: "user-2",
      }),
      event("complete", "task_completed", {
        metadata: { outcome: "success", taskType: "study" },
        source: "task",
        userId: "user-1",
      }),
      event("failed", "task_failed", {
        metadata: { outcome: "failure", taskType: "study" },
        source: "task",
        userId: "user-2",
      }),
    ]);

    expect(metrics.redeemed).toBe(2);
    expect(metrics.taskErrorRate).toBe(0.5);
    expect(metrics.sourceAttribution).toEqual([
      { redeemed: 1, source: "counter-card" },
      { redeemed: 1, source: "receipt-qr" },
    ]);
  });

  it("does not count anonymous or failed events as funnel users", () => {
    const metrics = computeMetrics([
      event("anonymous", "code_redeemed", {
        metadata: { outcome: "success" },
        source: "direct",
      }),
      event("failed-redemption", "code_redeemed", {
        metadata: { outcome: "failure" },
        source: "direct",
        userId: "user-1",
      }),
      event("failed-task", "task_completed", {
        metadata: { outcome: "failure", taskType: "career" },
        source: "task",
        userId: "user-1",
      }),
    ]);

    expect(metrics).toMatchObject({
      activated: 0,
      connected: 0,
      redeemed: 0,
      returned: 0,
      taskErrorRate: 1,
    });
  });

  it("derives returns from repeated server completions instead of trusting an isReturning flag", () => {
    const metrics = computeMetrics([
      event("forged-return", "task_completed", {
        metadata: {
          isReturning: true,
          outcome: "success",
          taskType: "study",
        },
        source: "task",
        userId: "user-1",
      }),
      event("first-completion", "task_completed", {
        metadata: { outcome: "success", taskType: "career" },
        source: "task",
        userId: "user-2",
      }),
      event("second-completion", "task_completed", {
        metadata: { outcome: "success", taskType: "coding" },
        source: "task",
        userId: "user-2",
      }),
      event("unverified-failure", "task_failed", {
        source: "task",
        userId: "user-3",
      }),
    ]);

    expect(metrics.activated).toBe(2);
    expect(metrics.returned).toBe(1);
    expect(metrics.taskErrorRate).toBe(0);
  });
});
