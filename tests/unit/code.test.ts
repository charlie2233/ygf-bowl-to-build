import { describe, expect, it } from "vitest";
import {
  constantTimeEqualHex,
  hashCode,
  matchesCodeHash,
  normalizeCode,
} from "@/lib/campaign/code";
import { deriveAbuseSignal } from "@/lib/campaign/rate-limit";

describe("campaign codes", () => {
  it("normalizes separators and casing", () => {
    expect(normalizeCode(" bowl-7k2a ")).toBe("BOWL7K2A");
    expect(normalizeCode("BOWL 7K2A")).toBe("BOWL7K2A");
  });

  it.each([
    "",
    "SHORT",
    "TOOLONG99",
    "BOWL_7K2A",
    "BOWL/7K2A",
    "ＢＯＷＬ７Ｋ２Ａ",
  ])("rejects an invalid code without echoing it: %s", (candidate) => {
    expect(() => normalizeCode(candidate)).toThrow("INVALID_CODE");

    try {
      normalizeCode(candidate);
    } catch (error) {
      expect(String(error)).not.toContain(candidate || "unused-sentinel");
    }
  });

  it("hashes a normalized code without retaining plaintext", async () => {
    const hash = await hashCode(" bowl-7k2a ");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("BOWL7K2A");
    expect(hash).toBe(await hashCode("BOWL7K2A"));
    await expect(matchesCodeHash("bowl-7k2a", hash)).resolves.toBe(true);
    await expect(matchesCodeHash("OTHER9Z9", hash)).resolves.toBe(false);
    expect(constantTimeEqualHex(hash, hash)).toBe(true);
    expect(constantTimeEqualHex(hash, "0".repeat(64))).toBe(false);
  });
});

describe("abuse signals", () => {
  const secret = "campaign-test-secret-that-is-at-least-32-bytes";
  const now = new Date("2026-07-26T12:02:00.000Z");

  it("derives a scoped, expiring HMAC without returning the raw value", () => {
    const signal = deriveAbuseSignal({
      secret,
      purpose: "redemption-ip",
      value: "203.0.113.42",
      now,
    });

    expect(signal).toMatchObject({
      version: "v1",
      purpose: "redemption-ip",
    });
    expect(signal.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(signal.expiresAt).toBe("2026-07-26T12:05:00.000Z");
    expect(JSON.stringify(signal)).not.toContain("203.0.113.42");
    expect(
      deriveAbuseSignal({
        secret,
        purpose: "redemption-device",
        value: "203.0.113.42",
        now,
      }).digest,
    ).not.toBe(signal.digest);
  });

  it("rejects weak secrets and unreasonable inputs", () => {
    expect(() =>
      deriveAbuseSignal({
        secret: "too-short",
        purpose: "redemption-ip",
        value: "203.0.113.42",
        now,
      }),
    ).toThrow("ABUSE_SIGNAL_SECRET_INVALID");
    expect(() =>
      deriveAbuseSignal({
        secret,
        purpose: "redemption-ip",
        value: "",
        now,
      }),
    ).toThrow("ABUSE_SIGNAL_INPUT_INVALID");
    expect(() =>
      deriveAbuseSignal({
        secret,
        purpose: "redemption-ip",
        value: "x".repeat(513),
        now,
      }),
    ).toThrow("ABUSE_SIGNAL_INPUT_INVALID");
  });
});
