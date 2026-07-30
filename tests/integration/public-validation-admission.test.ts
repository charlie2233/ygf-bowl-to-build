import { describe, expect, it } from "vitest";

import type { AbuseSignal } from "@/lib/campaign/rate-limit";
import {
  MemoryPublicValidationAdmission,
} from "@/lib/repositories/public-validation-admission";

function signal({
  bucket = 10,
  digest = "b".repeat(64),
  expiresAt = "2026-07-27T12:05:00.000Z",
}: {
  bucket?: number;
  digest?: string;
  expiresAt?: string;
} = {}): AbuseSignal {
  return {
    bucket,
    digest,
    expiresAt,
    purpose: "validate-code",
    version: "v1",
  };
}

function input({
  accountDigest,
  codeDigest = "c".repeat(64),
  sessionDigest = "d".repeat(64),
  value = signal(),
}: {
  accountDigest?: string;
  codeDigest?: string;
  sessionDigest?: string;
  value?: AbuseSignal;
} = {}) {
  return {
    ...(accountDigest ? { accountDigest } : {}),
    ...(codeDigest ? { codeDigest } : {}),
    sessionDigest,
    signal: value,
  };
}

describe("public validation admission", () => {
  it("uses a broad campus-NAT signal ceiling without weakening session admission", async () => {
    const admission = new MemoryPublicValidationAdmission(
      () => new Date("2026-07-27T12:00:00.000Z"),
    );
    const results = [];
    for (let index = 0; index < 301; index += 1) {
      results.push(
        await admission.admit(
          input({
            codeDigest: `${index}`.padStart(64, "c"),
            sessionDigest: `${index}`.padStart(64, "d"),
          }),
        ),
      );
    }

    expect(results.slice(0, 300).every(Boolean)).toBe(true);
    expect(results[300]).toBe(false);
  });

  it("enforces independent session, code, and account ceilings", async () => {
    const sessionAdmission = new MemoryPublicValidationAdmission(
      () => new Date("2026-07-27T12:00:00.000Z"),
    );
    const sessionResults = [];
    for (let index = 0; index < 13; index += 1) {
      sessionResults.push(
        await sessionAdmission.admit(
          input({
            codeDigest: `${index}`.padStart(64, "c"),
            value: signal({
              digest: `${index}`.padStart(64, "a"),
            }),
          }),
        ),
      );
    }
    expect(sessionResults.slice(0, 12).every(Boolean)).toBe(true);
    expect(sessionResults[12]).toBe(false);

    const codeAdmission = new MemoryPublicValidationAdmission(
      () => new Date("2026-07-27T12:00:00.000Z"),
    );
    const codeResults = [];
    for (let index = 0; index < 21; index += 1) {
      codeResults.push(
        await codeAdmission.admit(
          input({
            sessionDigest: `${index}`.padStart(64, "d"),
            value: signal({
              digest: `${index}`.padStart(64, "a"),
            }),
          }),
        ),
      );
    }
    expect(codeResults.slice(0, 20).every(Boolean)).toBe(true);
    expect(codeResults[20]).toBe(false);

    const accountAdmission = new MemoryPublicValidationAdmission(
      () => new Date("2026-07-27T12:00:00.000Z"),
    );
    const accountResults = [];
    for (let index = 0; index < 11; index += 1) {
      accountResults.push(
        await accountAdmission.admit(
          input({
            accountDigest: "e".repeat(64),
            codeDigest: `${index}`.padStart(64, "c"),
            sessionDigest: `${index}`.padStart(64, "d"),
            value: signal({
              digest: `${index}`.padStart(64, "a"),
            }),
          }),
        ),
      );
    }
    expect(accountResults.slice(0, 10).every(Boolean)).toBe(true);
    expect(accountResults[10]).toBe(false);
  });

  it("prunes expired buckets instead of growing forever", async () => {
    let now = new Date("2026-07-27T12:00:00.000Z");
    const admission = new MemoryPublicValidationAdmission(() => now);

    expect(await admission.admit(input())).toBe(true);
    now = new Date("2026-07-27T12:05:01.000Z");
    expect(
      await admission.admit(
        input({
          value: signal({
            bucket: 11,
            expiresAt: "2026-07-27T12:10:00.000Z",
          }),
        }),
      ),
    ).toBe(true);
  });
});
