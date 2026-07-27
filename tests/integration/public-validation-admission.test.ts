import { describe, expect, it } from "vitest";

import type { AbuseSignal } from "@/lib/campaign/rate-limit";
import {
  MemoryPublicValidationAdmission,
} from "@/lib/repositories/public-validation-admission";

function signal({
  bucket = 10,
  expiresAt = "2026-07-27T12:05:00.000Z",
}: {
  bucket?: number;
  expiresAt?: string;
} = {}): AbuseSignal {
  return {
    bucket,
    digest: "b".repeat(64),
    expiresAt,
    purpose: "redeem",
    version: "v1",
  };
}

describe("public validation admission", () => {
  it("allows thirty shared attempts and rejects the next", async () => {
    const admission = new MemoryPublicValidationAdmission(
      () => new Date("2026-07-27T12:00:00.000Z"),
    );
    const results = [];
    for (let index = 0; index < 31; index += 1) {
      results.push(await admission.admit(signal()));
    }

    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results[30]).toBe(false);
  });

  it("prunes expired buckets instead of growing forever", async () => {
    let now = new Date("2026-07-27T12:00:00.000Z");
    const admission = new MemoryPublicValidationAdmission(() => now);

    expect(await admission.admit(signal())).toBe(true);
    now = new Date("2026-07-27T12:05:01.000Z");
    expect(
      await admission.admit(
        signal({
          bucket: 11,
          expiresAt: "2026-07-27T12:10:00.000Z",
        }),
      ),
    ).toBe(true);
  });
});
