import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { NextResponse } from "next/server";

export const RATE_SESSION_COOKIE = "ygf_rate_session";
export const RATE_SESSION_TTL_SECONDS = 24 * 60 * 60;

const RATE_SESSION_VERSION = "v1";
const RATE_SESSION_ID_BYTES = 16;
const MAX_COOKIE_HEADER_BYTES = 8_192;
const MAX_COOKIE_VALUE_BYTES = 256;

export interface RateSession {
  id: string;
  setCookieValue?: string;
}

function signature(id: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`ygf-rate-session:${RATE_SESSION_VERSION}:`, "utf8")
    .update(id, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readCookie(header: string | null, name: string) {
  if (
    !header ||
    Buffer.byteLength(header, "utf8") > MAX_COOKIE_HEADER_BYTES
  ) {
    return null;
  }

  const matches = header
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(`${name}=`))
    .map((entry) => entry.slice(name.length + 1));
  if (
    matches.length !== 1 ||
    !matches[0] ||
    Buffer.byteLength(matches[0], "utf8") > MAX_COOKIE_VALUE_BYTES
  ) {
    return null;
  }

  try {
    return decodeURIComponent(matches[0]);
  } catch {
    return null;
  }
}

export function createRateSessionValue(secret: string) {
  const id = randomBytes(RATE_SESSION_ID_BYTES).toString("base64url");
  return {
    id,
    value: `${RATE_SESSION_VERSION}.${id}.${signature(id, secret)}`,
  };
}

export function readRateSessionValue(
  value: string | null | undefined,
  secret: string,
) {
  if (!value || Buffer.byteLength(value, "utf8") > MAX_COOKIE_VALUE_BYTES) {
    return null;
  }
  const [version, id, suppliedSignature, ...rest] = value.split(".");
  if (
    version !== RATE_SESSION_VERSION ||
    !id ||
    !/^[A-Za-z0-9_-]{22}$/u.test(id) ||
    !suppliedSignature ||
    rest.length > 0 ||
    !safeEqual(signature(id, secret), suppliedSignature)
  ) {
    return null;
  }
  return id;
}

export function resolveRateSession(
  request: Request,
  secret: string,
): RateSession {
  const existing = readRateSessionValue(
    readCookie(request.headers.get("cookie"), RATE_SESSION_COOKIE),
    secret,
  );
  if (existing) {
    return { id: existing };
  }

  const created = createRateSessionValue(secret);
  return {
    id: created.id,
    setCookieValue: created.value,
  };
}

export function applyRateSessionCookie(
  response: NextResponse,
  value: string | undefined,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
) {
  if (value) {
    response.cookies.set(RATE_SESSION_COOKIE, value, {
      httpOnly: true,
      maxAge: RATE_SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: nodeEnvironment === "production",
    });
  }
  return response;
}
