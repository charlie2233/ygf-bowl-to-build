import { describe, expect, it } from "vitest";

import { authenticatedCampaignUserFromClaims } from "@/lib/auth/user";

describe("trusted campaign auth claims", () => {
  it("derives anonymous state only from the trusted JWT claim", () => {
    expect(
      authenticatedCampaignUserFromClaims({
        email: "guest@example.test",
        is_anonymous: true,
        sub: "anonymous-user",
      }),
    ).toEqual({
      email: "guest@example.test",
      id: "anonymous-user",
      isAnonymous: true,
    });
    expect(
      authenticatedCampaignUserFromClaims({
        is_anonymous: "true",
        sub: "verified-user",
      }),
    ).toEqual({
      id: "verified-user",
      isAnonymous: false,
    });
    expect(
      authenticatedCampaignUserFromClaims({
        is_anonymous: true,
      }),
    ).toBeNull();
  });
});
