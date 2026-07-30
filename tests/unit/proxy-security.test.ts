import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

describe("redeem query retirement proxy", () => {
  it.each(["code", "claim", "token", "termsAccepted", "CODE"])(
    "removes the retired %s query before auth or page rendering",
    async (key) => {
      const request = new NextRequest(
        `https://malatangai.com/redeem?${key}=private-value&source=legacy`,
      );

      const response = await proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://malatangai.com/redeem",
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    },
  );
});
