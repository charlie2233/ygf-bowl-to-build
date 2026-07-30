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
          codeDigest: `${index}`.padStart(64, "c"),
          sessionDigest: `${index}`.padStart(64, "d"),
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

  it("uses a broad campus-NAT signal ceiling while account limits remain strict", async () => {
    const admission = new MemoryRedemptionAdmission();
    const results = [];

    for (let index = 0; index < 201; index += 1) {
      results.push(
        await admission.admit({
          codeDigest: `${index}`.padStart(64, "c"),
          sessionDigest: `${index}`.padStart(64, "d"),
          signal: signal(),
          userId: `user-${index}`,
        }),
      );
    }

    expect(results.slice(0, 200).every((result) => result.allowed)).toBe(
      true,
    );
    expect(results[200]?.allowed).toBe(false);
  });

  it("enforces independent signed-claim session and code ceilings", async () => {
    const sessionAdmission = new MemoryRedemptionAdmission();
    const sessionResults = [];
    for (let index = 0; index < 6; index += 1) {
      sessionResults.push(
        await sessionAdmission.admit({
          codeDigest: `${index}`.padStart(64, "c"),
          sessionDigest: "d".repeat(64),
          signal: signal(`${index}`.padStart(64, "a")),
          userId: `user-${index}`,
        }),
      );
    }
    expect(
      sessionResults.slice(0, 5).every((result) => result.allowed),
    ).toBe(true);
    expect(sessionResults[5]?.allowed).toBe(false);

    const codeAdmission = new MemoryRedemptionAdmission();
    const codeResults = [];
    for (let index = 0; index < 11; index += 1) {
      codeResults.push(
        await codeAdmission.admit({
          codeDigest: "c".repeat(64),
          sessionDigest: `${index}`.padStart(64, "d"),
          signal: signal(`${index}`.padStart(64, "a")),
          userId: `user-${index}`,
        }),
      );
    }
    expect(
      codeResults.slice(0, 10).every((result) => result.allowed),
    ).toBe(true);
    expect(codeResults[10]?.allowed).toBe(false);
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

  it("returns no attempt identifier for a denied admission", async () => {
    const admission = new MemoryRedemptionAdmission();
    let denied:
      | Awaited<ReturnType<typeof admission.admit>>
      | undefined;
    for (let index = 0; index < 6; index += 1) {
      const result = await admission.admit({
        codeDigest: `${index}`.padStart(64, "c"),
        sessionDigest: "d".repeat(64),
        signal: signal(`${index}`.padStart(64, "a")),
        userId: `user-${index}`,
      });
      if (!result.allowed) {
        denied = result;
      }
    }

    expect(denied).toMatchObject({ allowed: false });
    expect(denied).not.toHaveProperty("attemptId");
  });
});
