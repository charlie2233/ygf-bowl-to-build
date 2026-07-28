import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type {
  AgentApiKeyDigestVersion,
  AgentApiKeyPersistence,
  GeneratedAgentApiKey,
} from "@/lib/agent/types";

export const AGENT_API_KEY_PREFIX = "ygf_" as const;
export const AGENT_API_KEY_RANDOM_BYTES = 32;
export const AGENT_API_KEY_DIGEST_VERSION =
  "hmac-sha256-v1" as const satisfies AgentApiKeyDigestVersion;

const DIGEST_BYTES = 32;
const DIGEST_SECRET_MINIMUM_BYTES = 32;
const SAFE_PREFIX_LENGTH = AGENT_API_KEY_PREFIX.length + 4;
const RANDOM_MATERIAL_LENGTH = 43;
const PLAINTEXT_PATTERN =
  /^ygf_[A-Za-z0-9_-]{43}$/u;
const DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const INVALID_DIGEST = Buffer.alloc(DIGEST_BYTES);

type DigestSecret = string | Uint8Array;

interface GenerateAgentApiKeyInput {
  readonly digestSecret: DigestSecret;
}

interface VerifyAgentApiKeyInput {
  readonly digestSecret: DigestSecret;
  readonly persistence: Readonly<AgentApiKeyPersistence>;
  readonly plaintext: string;
}

function digestSecretLength(secret: DigestSecret): number {
  return typeof secret === "string"
    ? Buffer.byteLength(secret, "utf8")
    : secret.byteLength;
}

function assertDigestSecret(
  secret: DigestSecret,
): asserts secret is DigestSecret {
  if (
    (typeof secret !== "string" &&
      !(secret instanceof Uint8Array)) ||
    digestSecretLength(secret) < DIGEST_SECRET_MINIMUM_BYTES
  ) {
    throw new Error("AGENT_API_KEY_DIGEST_SECRET_INVALID");
  }
}

function digestPlaintext(
  plaintext: string,
  digestSecret: DigestSecret,
): Buffer {
  return createHmac("sha256", digestSecret)
    .update(
      `ygf-agent-api-key:${AGENT_API_KEY_DIGEST_VERSION}:`,
      "utf8",
    )
    .update(plaintext, "utf8")
    .digest();
}

function persistenceFor(
  plaintext: string,
  digestSecret: DigestSecret,
): Readonly<AgentApiKeyPersistence> {
  return Object.freeze({
    digest: digestPlaintext(plaintext, digestSecret).toString(
      "base64url",
    ),
    digestVersion: AGENT_API_KEY_DIGEST_VERSION,
    last4: plaintext.slice(-4),
    prefix: plaintext.slice(0, SAFE_PREFIX_LENGTH),
  });
}

export function digestAgentApiKey(
  plaintext: string,
  digestSecret: DigestSecret,
): string {
  assertDigestSecret(digestSecret);
  if (
    typeof plaintext !== "string" ||
    !PLAINTEXT_PATTERN.test(plaintext)
  ) {
    throw new Error("AGENT_API_KEY_INVALID");
  }
  return digestPlaintext(plaintext, digestSecret).toString(
    "base64url",
  );
}

function decodeStoredDigest(digest: string): {
  readonly bytes: Buffer;
  readonly valid: boolean;
} {
  if (!DIGEST_PATTERN.test(digest)) {
    return { bytes: INVALID_DIGEST, valid: false };
  }

  const bytes = Buffer.from(digest, "base64url");
  if (bytes.byteLength !== DIGEST_BYTES) {
    return { bytes: INVALID_DIGEST, valid: false };
  }
  return { bytes, valid: true };
}

export function generateAgentApiKey({
  digestSecret,
}: GenerateAgentApiKeyInput): GeneratedAgentApiKey {
  assertDigestSecret(digestSecret);

  const randomMaterial = randomBytes(
    AGENT_API_KEY_RANDOM_BYTES,
  ).toString("base64url");
  if (randomMaterial.length !== RANDOM_MATERIAL_LENGTH) {
    throw new Error("AGENT_API_KEY_GENERATION_FAILED");
  }

  const plaintext = `${AGENT_API_KEY_PREFIX}${randomMaterial}`;
  const generated = {
    persistence: persistenceFor(plaintext, digestSecret),
  } as GeneratedAgentApiKey;

  Object.defineProperty(generated, "plaintext", {
    configurable: false,
    enumerable: false,
    value: plaintext,
    writable: false,
  });

  return Object.freeze(generated);
}

/**
 * Always compares two fixed-size SHA-256 values with `timingSafeEqual`.
 * Format/version checks are combined only after the comparison so a valid
 * candidate never falls back to an ordinary digest string comparison.
 */
export function verifyAgentApiKey({
  digestSecret,
  persistence,
  plaintext,
}: VerifyAgentApiKeyInput): boolean {
  assertDigestSecret(digestSecret);

  const candidate =
    typeof plaintext === "string" ? plaintext : "";
  const candidateDigest = digestPlaintext(candidate, digestSecret);
  const stored = decodeStoredDigest(persistence.digest);
  const digestMatches = timingSafeEqual(
    candidateDigest,
    stored.bytes,
  );
  const formatMatches = PLAINTEXT_PATTERN.test(candidate);
  const displayFragmentsMatch =
    candidate.startsWith(persistence.prefix) &&
    candidate.endsWith(persistence.last4);

  return (
    digestMatches &&
    stored.valid &&
    formatMatches &&
    displayFragmentsMatch &&
    persistence.digestVersion === AGENT_API_KEY_DIGEST_VERSION
  );
}
