// @vitest-environment node

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  anonymousAccountMergeSourceFromClaims,
  createAccountMergeIntentSecret,
  readAccountMergeIntentSecret,
} from "@/lib/auth/account-merge-intent";

describe("account merge intent secrets", () => {
  it("uses a 256-bit bearer while exposing only its digest to persistence", () => {
    const bytes = Buffer.alloc(32, 7);
    const created = createAccountMergeIntentSecret(
      "google",
      () => bytes,
    );
    const parsed = readAccountMergeIntentSecret(created.value);
    const token = created.value.split(".")[2]!;

    expect(token).toHaveLength(43);
    expect(created.digest).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
    expect(parsed).toEqual(created);
    expect(created.digest).not.toContain(token);
  });

  it.each([
    undefined,
    "",
    "v1.google.short",
    `v1.github.${"A".repeat(43)}`,
    `v2.google.${"A".repeat(43)}`,
    `v1.google.${"A".repeat(43)}.extra`,
  ])("rejects malformed cookie value %s", (value) => {
    expect(readAccountMergeIntentSecret(value)).toBeNull();
  });

  it("accepts only an anonymous source with a bounded session id", () => {
    expect(
      anonymousAccountMergeSourceFromClaims({
        is_anonymous: true,
        session_id: "11111111-1111-4111-8111-111111111111",
        sub: "source-user",
      }),
    ).toEqual({
      id: "source-user",
      isAnonymous: true,
      sessionId: "11111111-1111-4111-8111-111111111111",
    });
    expect(
      anonymousAccountMergeSourceFromClaims({
        is_anonymous: false,
        session_id: "22222222-2222-4222-8222-222222222222",
        sub: "source-user",
      }),
    ).toBeNull();
    expect(
      anonymousAccountMergeSourceFromClaims({
        is_anonymous: true,
        session_id: "session id with spaces",
        sub: "source-user",
      }),
    ).toBeNull();
  });
});
