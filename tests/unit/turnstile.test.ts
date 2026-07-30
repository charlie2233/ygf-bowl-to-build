import { describe, expect, it, vi } from "vitest";

import {
  resolveTurnstileConfiguration,
  TURNSTILE_ACTION,
  TURNSTILE_SITEVERIFY_URL,
  turnstileClientConfiguration,
  verifyTurnstileToken,
} from "@/lib/auth/turnstile";

const READY_ENVIRONMENT = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "production_site_key_123",
  TURNSTILE_SECRET_KEY: "production_secret_key_123456789",
  YGF_PUBLIC_ORIGIN: "https://malatangai.com",
  YGF_TURNSTILE_ENABLED: "true",
} as const;

const CLOUDFLARE_TEST_SITE_KEYS = [
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
] as const;

const CLOUDFLARE_TEST_SECRET_KEYS = [
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
] as const;

describe("Cloudflare Turnstile boundary", () => {
  it("is opt-in and fails closed when explicitly enabled but incomplete", () => {
    expect(resolveTurnstileConfiguration({})).toEqual({
      kind: "disabled",
    });
    expect(
      resolveTurnstileConfiguration(
        { YGF_TURNSTILE_ENABLED: "true" },
        "production",
      ),
    ).toEqual({ kind: "misconfigured" });
    expect(
      turnstileClientConfiguration({ kind: "misconfigured" }),
    ).toEqual({ required: true, siteKey: null });
  });

  it.each(CLOUDFLARE_TEST_SITE_KEYS)(
    "rejects Cloudflare test site key %s in production",
    (siteKey) => {
      expect(
        resolveTurnstileConfiguration(
          {
            ...READY_ENVIRONMENT,
            NEXT_PUBLIC_TURNSTILE_SITE_KEY: siteKey,
          },
          "production",
        ),
      ).toEqual({ kind: "misconfigured" });
    },
  );

  it.each(CLOUDFLARE_TEST_SECRET_KEYS)(
    "rejects Cloudflare test secret %s in production",
    (secretKey) => {
      expect(
        resolveTurnstileConfiguration(
          {
            ...READY_ENVIRONMENT,
            TURNSTILE_SECRET_KEY: secretKey,
          },
          "production",
        ),
      ).toEqual({ kind: "misconfigured" });
    },
  );

  it.each(["development", "test"] as const)(
    "allows official test credentials outside production in %s",
    (nodeEnvironment) => {
      for (const siteKey of CLOUDFLARE_TEST_SITE_KEYS) {
        expect(
          resolveTurnstileConfiguration(
            {
              ...READY_ENVIRONMENT,
              NEXT_PUBLIC_TURNSTILE_SITE_KEY: siteKey,
              TURNSTILE_SECRET_KEY: CLOUDFLARE_TEST_SECRET_KEYS[0],
            },
            nodeEnvironment,
          ),
        ).toMatchObject({ kind: "ready", siteKey });
      }
      for (const secretKey of CLOUDFLARE_TEST_SECRET_KEYS) {
        expect(
          resolveTurnstileConfiguration(
            {
              ...READY_ENVIRONMENT,
              NEXT_PUBLIC_TURNSTILE_SITE_KEY:
                CLOUDFLARE_TEST_SITE_KEYS[0],
              TURNSTILE_SECRET_KEY: secretKey,
            },
            nodeEnvironment,
          ),
        ).toMatchObject({ kind: "ready", secretKey });
      }
    },
  );

  it("rejects clearly undersized production placeholders but allows them outside production", () => {
    const placeholderEnvironment = {
      ...READY_ENVIRONMENT,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site_key_123",
      TURNSTILE_SECRET_KEY: "secret_key_123",
    };

    expect(
      resolveTurnstileConfiguration(
        placeholderEnvironment,
        "production",
      ),
    ).toEqual({ kind: "misconfigured" });
    expect(
      resolveTurnstileConfiguration(placeholderEnvironment, "test"),
    ).toMatchObject({
      kind: "ready",
      secretKey: "secret_key_123",
      siteKey: "site_key_123",
    });
  });

  it("rejects long obvious production placeholders while allowing test fixtures outside production", () => {
    const placeholders = [
      {
        secretKey:
          "your_turnstile_secret_key_here_123456",
        siteKey: "your_turnstile_site_key_here",
      },
      {
        secretKey:
          "placeholder_secret_key_1234567890123",
        siteKey: "placeholder_site_key_123456",
      },
    ] as const;

    for (const { secretKey, siteKey } of placeholders) {
      const placeholderEnvironment = {
        ...READY_ENVIRONMENT,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: siteKey,
        TURNSTILE_SECRET_KEY: secretKey,
      };

      expect(
        resolveTurnstileConfiguration(
          placeholderEnvironment,
          "production",
        ),
      ).toEqual({ kind: "misconfigured" });
      expect(
        resolveTurnstileConfiguration(
          placeholderEnvironment,
          "development",
        ),
      ).toMatchObject({
        kind: "ready",
        secretKey,
        siteKey,
      });
    }
  });

  it("validates a bounded token server-side with exact action and hostname", async () => {
    const configuration = resolveTurnstileConfiguration(
      READY_ENVIRONMENT,
      "production",
    );
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json({
        action: TURNSTILE_ACTION,
        hostname: "malatangai.com",
        success: true,
      }),
    );

    await expect(
      verifyTurnstileToken(
        "browser-token",
        configuration,
        fetchImplementation,
      ),
    ).resolves.toEqual({ kind: "accepted" });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0]!;
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const submitted = JSON.parse(String(init?.body)) as Record<
      string,
      unknown
    >;
    expect(submitted).toMatchObject({
      response: "browser-token",
      secret: "production_secret_key_123456789",
    });
    expect(submitted.idempotency_key).toMatch(
      /^[0-9a-f-]{36}$/u,
    );
    expect(submitted).not.toHaveProperty("remoteip");
  });

  it.each([
    {
      response: {
        action: "other-action",
        hostname: "malatangai.com",
        success: true,
      },
    },
    {
      response: {
        action: TURNSTILE_ACTION,
        hostname: "attacker.example",
        success: true,
      },
    },
    {
      response: {
        "error-codes": ["timeout-or-duplicate"],
        success: false,
      },
    },
  ])("rejects mismatched and single-use failure responses", async ({
    response,
  }) => {
    const configuration = resolveTurnstileConfiguration(
      READY_ENVIRONMENT,
      "production",
    );
    await expect(
      verifyTurnstileToken(
        "browser-token",
        configuration,
        async () => Response.json(response),
      ),
    ).resolves.toEqual({ kind: "rejected" });
  });

  it("maps provider outages and malformed responses to unavailable", async () => {
    const configuration = resolveTurnstileConfiguration(
      READY_ENVIRONMENT,
      "production",
    );
    await expect(
      verifyTurnstileToken(
        "browser-token",
        configuration,
        async () => {
          throw new Error("network unavailable");
        },
      ),
    ).resolves.toEqual({ kind: "unavailable" });
    await expect(
      verifyTurnstileToken(
        "browser-token",
        configuration,
        async () =>
          Response.json({
            "error-codes": ["internal-error"],
            success: false,
          }),
      ),
    ).resolves.toEqual({ kind: "unavailable" });
    await expect(
      verifyTurnstileToken(
        "browser-token",
        configuration,
        async () => new Response("not-json"),
      ),
    ).resolves.toEqual({ kind: "unavailable" });
  });

  it("rejects missing and oversized tokens without contacting Siteverify", async () => {
    const configuration = resolveTurnstileConfiguration(
      READY_ENVIRONMENT,
      "production",
    );
    const fetchImplementation = vi.fn<typeof fetch>();

    await expect(
      verifyTurnstileToken("", configuration, fetchImplementation),
    ).resolves.toEqual({ kind: "rejected" });
    await expect(
      verifyTurnstileToken(
        "x".repeat(2_049),
        configuration,
        fetchImplementation,
      ),
    ).resolves.toEqual({ kind: "rejected" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
