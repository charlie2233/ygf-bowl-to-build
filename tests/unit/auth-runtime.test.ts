import { describe, expect, it } from "vitest";

import {
  createPendingClaim,
  readPendingClaim,
} from "@/lib/auth/pending-claim";
import {
  resolveAuthRuntime,
  serverSecret,
} from "@/lib/auth/runtime";

const SECRET = "a-strong-test-secret-that-is-at-least-32-bytes";
const NOW = new Date("2026-07-27T12:00:00.000Z");

describe("authentication runtime", () => {
  it("allows demo identity only outside production with an explicit flag", () => {
    expect(
      resolveAuthRuntime({ YGF_DEMO_MODE: "true" }, "development"),
    ).toEqual({ mode: "demo" });
    expect(() =>
      resolveAuthRuntime({ YGF_DEMO_MODE: "true" }, "production"),
    ).toThrow("disabled in production");
  });

  it("refuses incomplete live Supabase configuration", () => {
    expect(() => resolveAuthRuntime({}, "production")).toThrow(
      "Missing required server configuration",
    );
    expect(() =>
      resolveAuthRuntime(
        {
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
          NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        },
        "production",
      ),
    ).toThrow("SUPABASE_SECRET_KEY");
  });

  it("refuses weak production secrets and permits demo-only fallbacks", () => {
    expect(() =>
      serverSecret(
        "YGF_CLAIM_COOKIE_SECRET",
        { YGF_CLAIM_COOKIE_SECRET: "short" },
        "production",
      ),
    ).toThrow("Missing or weak");
    expect(
      serverSecret(
        "YGF_CLAIM_COOKIE_SECRET",
        { YGF_DEMO_MODE: "true" },
        "development",
      ),
    ).toContain("development-only");
  });
});

describe("signed pending receipt claims", () => {
  it("round-trips a valid code without storing it in the URL", () => {
    const claim = createPendingClaim("bowl7k2a", SECRET, NOW);
    expect(readPendingClaim(claim, SECRET, NOW)).toMatchObject({
      code: "BOWL7K2A",
    });
    expect(
      readPendingClaim(claim, SECRET, NOW)?.idempotencyKey,
    ).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects tampered and expired claims", () => {
    const claim = createPendingClaim("BOWL7K2A", SECRET, NOW);
    const [payload, signature] = claim.split(".");

    expect(
      readPendingClaim(`${payload}x.${signature}`, SECRET, NOW),
    ).toBeNull();
    expect(
      readPendingClaim(
        claim,
        SECRET,
        new Date("2026-07-27T12:11:00.000Z"),
      ),
    ).toBeNull();
  });
});
