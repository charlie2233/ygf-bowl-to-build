import { describe, expect, it, vi } from "vitest";

import {
  getOAuthProviderAvailability,
  parseOAuthProviderAvailability,
} from "@/lib/auth/provider-availability";

describe("public OAuth provider availability", () => {
  it("strictly parses only enabled Google and Apple booleans", () => {
    expect(
      parseOAuthProviderAvailability({
        external: {
          apple: false,
          github: true,
          google: true,
        },
      }),
    ).toEqual({ apple: false, google: true });
    expect(
      parseOAuthProviderAvailability({
        external: {
          apple: "true",
          google: 1,
        },
      }),
    ).toEqual({ apple: false, google: false });
    expect(parseOAuthProviderAvailability({ external: null })).toEqual({
      apple: false,
      google: false,
    });
  });

  it("fetches the public settings endpoint with only the publishable key", async () => {
    const fetchImplementation = vi.fn<
      (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            external: { apple: true, google: false },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
    );

    await expect(
      getOAuthProviderAvailability(
        {
          publishableKey: "publishable-key",
          url: "https://project.supabase.co",
        },
        fetchImplementation,
      ),
    ).resolves.toEqual({ apple: true, google: false });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [input, init] = fetchImplementation.mock.calls[0];
    expect(String(input)).toBe(
      "https://project.supabase.co/auth/v1/settings",
    );
    expect(String(input)).not.toContain("publishable-key");
    expect(init).toMatchObject({
      cache: "no-store",
      headers: {
        Accept: "application/json",
        apikey: "publishable-key",
      },
      method: "GET",
    });
    expect(Object.keys(init?.headers ?? {})).toEqual([
      "Accept",
      "apikey",
    ]);
  });

  it.each([
    {
      name: "non-success response",
      response: () => new Response(null, { status: 503 }),
    },
    {
      name: "invalid JSON",
      response: () =>
        new Response("{", {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    },
    {
      name: "unexpected settings shape",
      response: () =>
        new Response(JSON.stringify({ external: [] }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    },
  ])("fails closed for $name", async ({ response }) => {
    const fetchImplementation = vi.fn(async () => response());

    await expect(
      getOAuthProviderAvailability(
        {
          publishableKey: "publishable-key",
          url: "https://project.supabase.co/",
        },
        fetchImplementation,
      ),
    ).resolves.toEqual({ apple: false, google: false });
  });

  it("fails closed when the settings request throws", async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error("network unavailable");
    });

    await expect(
      getOAuthProviderAvailability(
        {
          publishableKey: "publishable-key",
          url: "https://project.supabase.co",
        },
        fetchImplementation,
      ),
    ).resolves.toEqual({ apple: false, google: false });
  });
});
