import { randomUUID } from "node:crypto";

import type { RuntimeEnvironment } from "@/lib/auth/runtime";

export const TURNSTILE_ACTION = "redeem-code";
export const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const MAX_TURNSTILE_TOKEN_BYTES = 2_048;
const MAX_TURNSTILE_RESPONSE_BYTES = 16 * 1_024;
const TURNSTILE_TIMEOUT_MS = 5_000;
const MIN_PRODUCTION_SITE_KEY_BYTES = 20;
const MIN_PRODUCTION_SECRET_KEY_BYTES = 30;
const CLOUDFLARE_TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);
const CLOUDFLARE_TEST_SECRET_KEYS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type TurnstileConfiguration =
  | { kind: "disabled" }
  | { kind: "misconfigured" }
  | {
      expectedHostname: string;
      kind: "ready";
      secretKey: string;
      siteKey: string;
    };

export type TurnstileVerification =
  | { kind: "accepted" }
  | { kind: "not-required" }
  | { kind: "rejected" }
  | { kind: "unavailable" };

function boundedCredential(
  value: string | undefined,
  maximumBytes: number,
) {
  const candidate = value?.trim();
  return candidate &&
    Buffer.byteLength(candidate, "utf8") <= maximumBytes &&
    /^[A-Za-z0-9_-]+$/u.test(candidate)
    ? candidate
    : null;
}

function isObviousPlaceholder(value: string) {
  const normalized = value.toLowerCase().replace(/-+/gu, "_");
  return /(?:^|_)(?:changeme|example|here|placeholder|replace|your)(?:_|$)/u.test(
    normalized,
  );
}

function expectedHostname(
  environment: RuntimeEnvironment,
  nodeEnvironment: string | undefined,
) {
  const configuredOrigin = environment.YGF_PUBLIC_ORIGIN?.trim();
  if (!configuredOrigin) {
    return null;
  }

  try {
    const url = new URL(configuredOrigin);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (nodeEnvironment === "production" && url.protocol !== "https:")
    ) {
      return null;
    }
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function resolveTurnstileConfiguration(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
): TurnstileConfiguration {
  if (environment.YGF_TURNSTILE_ENABLED !== "true") {
    return { kind: "disabled" };
  }

  const siteKey = boundedCredential(
    environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    32,
  );
  const secretKey = boundedCredential(
    environment.TURNSTILE_SECRET_KEY,
    128,
  );
  const hostname = expectedHostname(environment, nodeEnvironment);
  const usesCloudflareTestCredential =
    nodeEnvironment === "production" &&
    ((siteKey !== null && CLOUDFLARE_TEST_SITE_KEYS.has(siteKey)) ||
      (secretKey !== null &&
        CLOUDFLARE_TEST_SECRET_KEYS.has(secretKey)));
  const usesUndersizedProductionCredential =
    nodeEnvironment === "production" &&
    ((siteKey !== null &&
      Buffer.byteLength(siteKey, "utf8") <
        MIN_PRODUCTION_SITE_KEY_BYTES) ||
      (secretKey !== null &&
        Buffer.byteLength(secretKey, "utf8") <
          MIN_PRODUCTION_SECRET_KEY_BYTES));
  const usesObviousProductionPlaceholder =
    nodeEnvironment === "production" &&
    ((siteKey !== null && isObviousPlaceholder(siteKey)) ||
      (secretKey !== null && isObviousPlaceholder(secretKey)));
  if (
    !siteKey ||
    !secretKey ||
    !hostname ||
    usesCloudflareTestCredential ||
    usesUndersizedProductionCredential ||
    usesObviousProductionPlaceholder
  ) {
    return { kind: "misconfigured" };
  }

  return {
    expectedHostname: hostname,
    kind: "ready",
    secretKey,
    siteKey,
  };
}

export function turnstileClientConfiguration(
  configuration: TurnstileConfiguration,
) {
  return configuration.kind === "disabled"
    ? { required: false, siteKey: null }
    : configuration.kind === "ready"
      ? { required: true, siteKey: configuration.siteKey }
      : { required: true, siteKey: null };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/u.test(declaredLength) ||
      Number(declaredLength) > MAX_TURNSTILE_RESPONSE_BYTES)
  ) {
    throw new Error("TURNSTILE_RESPONSE_INVALID");
  }
  if (!response.body) {
    throw new Error("TURNSTILE_RESPONSE_INVALID");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_TURNSTILE_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("TURNSTILE_RESPONSE_INVALID");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    reader.releaseLock();
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function verifyTurnstileToken(
  token: unknown,
  configuration: TurnstileConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): Promise<TurnstileVerification> {
  if (configuration.kind === "disabled") {
    return { kind: "not-required" };
  }
  if (configuration.kind !== "ready") {
    return { kind: "unavailable" };
  }
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    Buffer.byteLength(token, "utf8") > MAX_TURNSTILE_TOKEN_BYTES
  ) {
    return { kind: "rejected" };
  }

  try {
    const response = await fetchImplementation(TURNSTILE_SITEVERIFY_URL, {
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        response: token,
        secret: configuration.secretKey,
      }),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { kind: "unavailable" };
    }

    const result = record(await readBoundedJson(response));
    if (!result) {
      return { kind: "unavailable" };
    }
    if (result.success !== true) {
      const errorCodes = Array.isArray(result["error-codes"])
        ? result["error-codes"]
        : [];
      return errorCodes.some(
        (code) =>
          code === "internal-error" ||
          code === "missing-input-secret" ||
          code === "invalid-input-secret" ||
          code === "bad-request",
      )
        ? { kind: "unavailable" }
        : { kind: "rejected" };
    }
    if (
      result.action !== TURNSTILE_ACTION ||
      result.hostname !== configuration.expectedHostname
    ) {
      return { kind: "rejected" };
    }
    return { kind: "accepted" };
  } catch {
    return { kind: "unavailable" };
  }
}
