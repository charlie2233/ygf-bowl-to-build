import { describe, expect, it } from "vitest";

import {
  authorizeCampaignAdminClaims,
  isSameOriginMutation,
  parseAdminEmailAllowlist,
} from "@/lib/auth/admin";

describe("campaign admin authorization", () => {
  it("accepts only the exact signed app-metadata admin role", () => {
    expect(
      authorizeCampaignAdminClaims({
        claims: {
          app_metadata: { role: "admin" },
          email: "operator@example.com",
          sub: "operator-1",
        },
        environment: {},
      }),
    ).toEqual({
      email: "operator@example.com",
      id: "operator-1",
    });

    expect(
      authorizeCampaignAdminClaims({
        claims: {
          app_metadata: { role: "Admin" },
          email: "operator@example.com",
          sub: "operator-1",
        },
        environment: {},
      }),
    ).toBeNull();
  });

  it("uses an exact, normalized server-side email allowlist", () => {
    const environment = {
      YGF_ADMIN_EMAIL_ALLOWLIST:
        " first@example.com,SECOND@example.com ",
    };

    expect(parseAdminEmailAllowlist(environment)).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
    expect(
      authorizeCampaignAdminClaims({
        claims: {
          app_metadata: { role: "user" },
          email: "SECOND@example.com",
          sub: "operator-2",
        },
        environment,
      }),
    ).toEqual({
      email: "second@example.com",
      id: "operator-2",
    });
    expect(
      authorizeCampaignAdminClaims({
        claims: {
          email: "evilsecond@example.com",
          sub: "operator-3",
        },
        environment,
      }),
    ).toBeNull();
  });

  it("rejects malformed subjects, emails, roles, and allowlist entries", () => {
    expect(
      authorizeCampaignAdminClaims({
        claims: {
          app_metadata: { role: "admin" },
          sub: "",
        },
        environment: {},
      }),
    ).toBeNull();
    expect(
      parseAdminEmailAllowlist({
        YGF_ADMIN_EMAIL_ALLOWLIST:
          "valid@example.com,not an email",
      }),
    ).toEqual([]);
    expect(
      authorizeCampaignAdminClaims({
        claims: {
          app_metadata: { role: ["admin"] },
          email: "valid@example.com",
          sub: "operator-4",
        },
        environment: {},
      }),
    ).toBeNull();
  });

  it("accepts only an exact configured origin for browser mutations", () => {
    const environment = {
      YGF_PUBLIC_ORIGIN: "https://build.ygf.example",
    };
    const request = (origin?: string, site?: string) =>
      new Request("https://internal-host.example/api/redeem", {
        headers: {
          ...(origin ? { origin } : {}),
          ...(site ? { "sec-fetch-site": site } : {}),
        },
        method: "POST",
      });

    expect(
      isSameOriginMutation(
        request("https://build.ygf.example", "same-origin"),
        environment,
      ),
    ).toBe(true);
    expect(
      isSameOriginMutation(
        request("https://attacker.example", "cross-site"),
        environment,
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(request(undefined, "same-origin"), environment),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        request("https://build.ygf.example", "cross-site"),
        environment,
      ),
    ).toBe(false);
  });
});
