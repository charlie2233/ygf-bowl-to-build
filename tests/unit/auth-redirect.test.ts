import { describe, expect, it } from "vitest";

import { safeAuthNextPath } from "@/lib/auth/redirect";

describe("safe auth redirects", () => {
  it.each(["/connect/agent", "/redeem", "/wallet"] as const)(
    "allows the known internal destination %s",
    (destination) => {
      expect(safeAuthNextPath(destination)).toBe(destination);
      expect(safeAuthNextPath([destination])).toBe(destination);
    },
  );

  it.each([
    "/\\evil.example",
    "%2f%5cevil.example",
    "%2f%2fevil.example",
    "%68%74%74%70%73%3a%2f%2fevil.example%2fwallet",
    "/%5cevil.example",
    "//evil.example",
    "https://evil.example/wallet",
    "javascript:alert(1)",
    "/redeem\u0000",
    "/wallet\n",
    "/redeem%0a",
    "/redeem?next=/wallet",
    "/wallet#credits",
    "/connect/agent/",
    "/connect/agent/keys",
    "/connect/agent?next=/wallet",
    "/connect/agent#developer-api-key",
    "/redeem/../wallet",
    "%",
  ])("rejects the unsafe destination %j", (destination) => {
    expect(safeAuthNextPath(destination)).toBe("/redeem");
  });

  it("rejects duplicate next parameters instead of choosing one", () => {
    expect(safeAuthNextPath(["/wallet", "/redeem"])).toBe("/redeem");
  });
});
