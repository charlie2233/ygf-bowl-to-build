import { describe, expect, it } from "vitest";
import {
  buildClaimUrl,
  parseClaimFragment,
} from "@/lib/campaign/claim-url";

describe("receipt claim URLs", () => {
  it("round-trips one normalized code through a URL fragment", () => {
    const url = buildClaimUrl("https://build.ygf.example", "bowl-7k2a");

    expect(url).toBe(
      "https://build.ygf.example/redeem#code=BOWL7K2A",
    );
    expect(parseClaimFragment(new URL(url).hash)).toBe("BOWL7K2A");
    expect(new URL(url).search).toBe("");
  });

  it.each([
    "http://build.ygf.example",
    "https://build.ygf.example/path",
    "https://build.ygf.example?code=BOWL7K2A",
    "https://user@build.ygf.example",
  ])("rejects an unsafe production origin: %s", (origin) => {
    expect(() => buildClaimUrl(origin, "BOWL7K2A")).toThrow(
      "INVALID_CLAIM_ORIGIN",
    );
  });

  it("allows HTTP localhost only through an explicit development policy", () => {
    expect(() =>
      buildClaimUrl("http://localhost:3000", "BOWL7K2A"),
    ).toThrow("INVALID_CLAIM_ORIGIN");
    expect(
      buildClaimUrl("http://localhost:3000", "BOWL7K2A", {
        allowInsecureLocalhost: true,
      }),
    ).toBe("http://localhost:3000/redeem#code=BOWL7K2A");
    expect(() =>
      buildClaimUrl("http://192.168.1.2:3000", "BOWL7K2A", {
        allowInsecureLocalhost: true,
      }),
    ).toThrow("INVALID_CLAIM_ORIGIN");
  });

  it.each([
    "",
    "#code=bowl7k2a",
    "#code=BOWL-7K2A",
    "#code=BOWL7K2A&next=/wallet",
    "#code=BOWL7K2A&code=OTHER9Z9",
    "#other=BOWL7K2A",
    "?code=BOWL7K2A",
    "#code=%42OWL7K2A",
  ])("rejects a malformed or non-normalized fragment: %s", (fragment) => {
    expect(() => parseClaimFragment(fragment)).toThrow(
      "INVALID_CLAIM_FRAGMENT",
    );
  });

  it("validates a full claim URL against exact path, query, and allowlist", () => {
    const policy = {
      allowedOrigins: ["https://build.ygf.example"],
    };

    expect(
      parseClaimFragment(
        "https://build.ygf.example/redeem#code=BOWL7K2A",
        policy,
      ),
    ).toBe("BOWL7K2A");
    expect(() =>
      parseClaimFragment(
        "https://build.ygf.example/other#code=BOWL7K2A",
        policy,
      ),
    ).toThrow("INVALID_CLAIM_URL");
    expect(() =>
      parseClaimFragment(
        "https://build.ygf.example/redeem?code=BOWL7K2A#code=BOWL7K2A",
        policy,
      ),
    ).toThrow("INVALID_CLAIM_URL");
    expect(() =>
      parseClaimFragment(
        "https://lookalike.example/redeem#code=BOWL7K2A",
        policy,
      ),
    ).toThrow("INVALID_CLAIM_ORIGIN");
  });
});
