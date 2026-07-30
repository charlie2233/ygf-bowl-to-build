import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import {
  applyRateSessionCookie,
  createRateSessionValue,
  RATE_SESSION_COOKIE,
  readRateSessionValue,
  resolveRateSession,
} from "@/lib/auth/rate-session";

const SECRET = "s".repeat(32);

describe("signed abuse-control session", () => {
  it("round-trips a 128-bit opaque identifier without exposing the secret", () => {
    const created = createRateSessionValue(SECRET);

    expect(created.id).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(readRateSessionValue(created.value, SECRET)).toBe(created.id);
    expect(created.value).not.toContain(SECRET);
  });

  it("rejects tampering, duplicate cookies, and a signature from another secret", () => {
    const created = createRateSessionValue(SECRET);
    const request = new Request("https://malatangai.com/api/code/validate", {
      headers: {
        cookie: `${RATE_SESSION_COOKIE}=${created.value}; ${RATE_SESSION_COOKIE}=${created.value}`,
      },
    });

    expect(
      readRateSessionValue(`${created.value}x`, SECRET),
    ).toBeNull();
    expect(
      readRateSessionValue(created.value, "x".repeat(32)),
    ).toBeNull();
    expect(resolveRateSession(request, SECRET).setCookieValue).toBeTruthy();
  });

  it("reuses one valid HttpOnly-cookie value rather than rotating per request", () => {
    const created = createRateSessionValue(SECRET);
    const request = new Request("https://malatangai.com/api/code/validate", {
      headers: {
        cookie: `${RATE_SESSION_COOKIE}=${encodeURIComponent(created.value)}`,
      },
    });

    expect(resolveRateSession(request, SECRET)).toEqual({
      id: created.id,
    });
  });

  it("applies the shared production cookie policy in one helper", () => {
    const created = createRateSessionValue(SECRET);
    const response = applyRateSessionCookie(
      NextResponse.json({ ok: true }),
      created.value,
      "production",
    );
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain(`${RATE_SESSION_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/iu);
    expect(cookie).toMatch(/SameSite=lax/iu);
    expect(cookie).toMatch(/Secure/iu);
    expect(cookie).toMatch(/Max-Age=86400/iu);
    expect(cookie).toMatch(/Path=\//iu);
  });
});
