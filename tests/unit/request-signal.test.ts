import { describe, expect, it } from "vitest";

import { trustedNetworkValue } from "@/lib/auth/request-signal";

function request(headers: HeadersInit = {}) {
  return new Request("https://build.ygf.example/api/redeem", {
    headers,
  });
}

describe("trusted redemption network signal", () => {
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

  it("uses one non-sensitive placeholder only in local development", () => {
    expect(
      trustedNetworkValue(request(), {}, "development"),
    ).toBe("local-development-network");
  });
});
