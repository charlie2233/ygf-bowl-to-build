import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canonicalNetworkAddress,
  getPublicValidationAdmissionContext,
  getRedemptionAdmissionInput,
  trustedNetworkValue,
} from "@/lib/auth/request-signal";

function request(headers: HeadersInit = {}) {
  return new Request("https://build.ygf.example/api/redeem", {
    headers,
  });
}

describe("trusted redemption network signal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the Vercel-owned forwarding header on Vercel", () => {
    expect(
      trustedNetworkValue(
        request({
          "cf-connecting-ip": "attacker-value",
          "x-forwarded-for": "attacker-value",
          "x-vercel-forwarded-for": "203.0.113.7",
        }),
        { VERCEL: "1" },
        "production",
      ),
    ).toBe("203.0.113.7");
  });

  it("fails closed in production outside a configured trusted edge", () => {
    expect(() =>
      trustedNetworkValue(
        request({
          "cf-connecting-ip": "203.0.113.8",
          "x-forwarded-for": "203.0.113.9",
        }),
        {},
        "production",
      ),
    ).toThrow("TRUSTED_NETWORK_SIGNAL_UNAVAILABLE");
  });

  it("canonicalizes equivalent IP forms and maps IPv4-mapped IPv6", () => {
    expect(canonicalNetworkAddress("2001:0db8:0:0:0:0:0:1")).toBe(
      "2001:db8::1",
    );
    expect(canonicalNetworkAddress("2001:db8::1")).toBe(
      "2001:db8::1",
    );
    expect(canonicalNetworkAddress("::ffff:192.0.2.1")).toBe(
      "192.0.2.1",
    );
    expect(canonicalNetworkAddress("192.0.2.1")).toBe("192.0.2.1");
  });

  it("rejects forwarded chains, malformed addresses, and zone identifiers", () => {
    for (const value of [
      "203.0.113.7, 10.0.0.1",
      "not-an-ip",
      "fe80::1%en0",
      "",
    ]) {
      expect(canonicalNetworkAddress(value)).toBeNull();
      expect(() =>
        trustedNetworkValue(
          request({ "x-vercel-forwarded-for": value }),
          { VERCEL: "1" },
          "production",
        ),
      ).toThrow("TRUSTED_NETWORK_SIGNAL_UNAVAILABLE");
    }
  });

  it("derives independent HMAC purposes for network, session, account, and code", () => {
    vi.stubEnv("YGF_DEMO_MODE", "true");
    const validation = getPublicValidationAdmissionContext(request(), {
      code: "BOWL7K2A",
      userId: "demo-user",
    });
    const redemption = getRedemptionAdmissionInput(request(), {
      code: "BOWL7K2A",
      sessionId: "claim-session",
      userId: "demo-user",
    });
    const digests = [
      validation.admission.signal.digest,
      validation.admission.sessionDigest,
      validation.admission.codeDigest,
      validation.admission.accountDigest,
      redemption.signal.digest,
      redemption.sessionDigest,
      redemption.codeDigest,
    ];

    expect(new Set(digests).size).toBe(digests.length);
    expect(digests.every((digest) => /^[0-9a-f]{64}$/u.test(digest!))).toBe(
      true,
    );
    expect(JSON.stringify({ validation, redemption })).not.toContain(
      "BOWL7K2A",
    );
    expect(JSON.stringify(validation)).not.toContain("demo-user");
  });

  it("uses one non-sensitive placeholder only in local development", () => {
    expect(
      trustedNetworkValue(request(), {}, "development"),
    ).toBe("local-development-network");
  });
});
