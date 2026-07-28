import { afterEach, describe, expect, it, vi } from "vitest";

import { browserRandomUuid } from "@/lib/browser/uuid";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browserRandomUuid", () => {
  it("uses the native browser UUID when the secure-context API exists", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
    });

    expect(browserRandomUuid()).toBe(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
  });

  it("creates an RFC 4122 v4 UUID from getRandomValues on LAN HTTP", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    expect(browserRandomUuid()).toBe(
      "abababab-abab-4bab-abab-abababababab",
    );
  });

  it("never falls back to non-cryptographic randomness", () => {
    vi.stubGlobal("crypto", {});

    expect(() => browserRandomUuid()).toThrow(
      "SECURE_RANDOM_UNAVAILABLE",
    );
  });
});
