import { describe, expect, it } from "vitest";

import type { AbuseSignal } from "@/lib/campaign/rate-limit";
import {
  MemoryRedemptionAdmission,
} from "@/lib/repositories/redemption-admission";

function signal(digest = "a".repeat(64)): AbuseSignal {
  return {
    bucket: 42,
    digest,
    expiresAt: "2026-07-27T12:05:00.000Z",
    purpose: "redeem",
    version: "v1",
  };
}

describe("redemption admission", () => {
  it("allows five attempts per user and rejects the sixth in one bucket", async () => {
    const admission = new MemoryRedemptionAdmission();
    const results = [];

    for (let index = 0; index < 6; index += 1) {
      results.push(
        await admission.admit({
          signal: signal(`${index}`.padStart(64, "a")),
          userId: "same-user",
        }),
      );
    }

    expect(results.map((result) => result.allowed)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("allows twenty attempts per abuse signal and rejects the next", async () => {
    const admission = new MemoryRedemptionAdmission();
    const results = [];

    for (let index = 0; index < 21; index += 1) {
      results.push(
        await admission.admit({
          signal: signal(),
          userId: `user-${index}`,
        }),
      );
    }

    expect(results.slice(0, 20).every((result) => result.allowed)).toBe(
      true,
    );
    expect(results[20]?.allowed).toBe(false);
  });

  it("requires finalization to reference an admitted attempt", async () => {
    const admission = new MemoryRedemptionAdmission();
    await expect(
      admission.finish({
        attemptId: "unknown",
        outcome: "invalid",
      }),
    ).rejects.toThrow("REDEMPTION_ATTEMPT_NOT_FOUND");
  });
});
