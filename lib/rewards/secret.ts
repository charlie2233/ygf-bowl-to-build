import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { RuntimeEnvironment } from "@/lib/auth/runtime";
import type { PartnerRewardSecretEnvelope } from "@/lib/rewards/types";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_AAD = Buffer.from(
  "ygf:partner-reward:claude-pro-gift:v1",
  "utf8",
);
const DIGEST_DOMAIN = "ygf:partner-reward:url-digest:v1";
const OFFICIAL_CLAUDE_HOST = "claude.ai";
const MAX_GIFT_URL_BYTES = 2_048;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const HEX_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

function invalidSecret(): never {
  throw new Error("PARTNER_REWARD_SECRET_INVALID");
}

export function normalizeClaudeGiftUrl(value: unknown): string {
  if (typeof value !== "string") {
    return invalidSecret();
  }
  const candidate = value.trim();
  if (
    candidate.length < 1 ||
    Buffer.byteLength(candidate, "utf8") > MAX_GIFT_URL_BYTES ||
    /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    return invalidSecret();
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return invalidSecret();
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== OFFICIAL_CLAUDE_HOST ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== "" ||
    !isProviderGiftRedemptionPath(parsed)
  ) {
    return invalidSecret();
  }

  const normalized = parsed.toString();
  if (Buffer.byteLength(normalized, "utf8") > MAX_GIFT_URL_BYTES) {
    return invalidSecret();
  }
  return normalized;
}

function isProviderGiftRedemptionPath(parsed: URL): boolean {
  if (parsed.pathname === "/gift/redeem") {
    const giftValues = parsed.searchParams.getAll("gift");
    return (
      giftValues.length === 1 && giftValues[0]?.trim().length > 0
    );
  }

  if (!parsed.pathname.startsWith("/gift/redeem/")) {
    return false;
  }

  const token = parsed.pathname.slice("/gift/redeem/".length);
  return token.length > 0 && !token.includes("/");
}

export function resolveRewardEncryptionKey(
  environment: RuntimeEnvironment = process.env,
): Buffer {
  const configured =
    environment.YGF_REWARD_ENCRYPTION_KEY?.trim() ?? "";
  if (
    configured.length === 0 ||
    !/^[A-Za-z0-9+/]{43}=$/u.test(configured)
  ) {
    return invalidSecret();
  }

  const key = Buffer.from(configured, "base64");
  if (
    key.length !== 32 ||
    key.toString("base64") !== configured
  ) {
    return invalidSecret();
  }
  return key;
}

function rewardDigest(url: string, key: Buffer): string {
  return createHmac("sha256", key)
    .update(DIGEST_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(url, "utf8")
    .digest("hex");
}

function decodeEnvelopePart(
  value: string,
  expectedBytes?: number,
): Buffer {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    return invalidSecret();
  }
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.length < 1 ||
    (expectedBytes !== undefined &&
      decoded.length !== expectedBytes) ||
    decoded.toString("base64url") !== value
  ) {
    return invalidSecret();
  }
  return decoded;
}

export function isPartnerRewardSecretEnvelope(
  value: unknown,
): value is PartnerRewardSecretEnvelope {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }
  const envelope = value as Partial<PartnerRewardSecretEnvelope>;
  if (
    typeof envelope.ciphertext !== "string" ||
    typeof envelope.digest !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.tag !== "string" ||
    !HEX_DIGEST_PATTERN.test(envelope.digest)
  ) {
    return false;
  }
  try {
    const ciphertext = decodeEnvelopePart(envelope.ciphertext);
    decodeEnvelopePart(envelope.iv, 12);
    decodeEnvelopePart(envelope.tag, 16);
    return ciphertext.length <= MAX_GIFT_URL_BYTES;
  } catch {
    return false;
  }
}

export function encryptClaudeGiftUrl(
  value: unknown,
  key: Buffer,
): PartnerRewardSecretEnvelope {
  if (key.length !== 32) {
    return invalidSecret();
  }
  const url = normalizeClaudeGiftUrl(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  cipher.setAAD(ENCRYPTION_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(url, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64url"),
    digest: rewardDigest(url, key),
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
  };
}

export function decryptClaudeGiftUrl(
  envelope: PartnerRewardSecretEnvelope,
  key: Buffer,
): string {
  try {
    if (
      key.length !== 32 ||
      !isPartnerRewardSecretEnvelope(envelope)
    ) {
      return invalidSecret();
    }
    const ciphertext = decodeEnvelopePart(envelope.ciphertext);
    if (ciphertext.length > MAX_GIFT_URL_BYTES) {
      return invalidSecret();
    }
    const iv = decodeEnvelopePart(envelope.iv, 12);
    const tag = decodeEnvelopePart(envelope.tag, 16);
    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      iv,
    );
    decipher.setAAD(ENCRYPTION_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const url = normalizeClaudeGiftUrl(plaintext);
    const expectedDigest = Buffer.from(
      rewardDigest(url, key),
      "hex",
    );
    const suppliedDigest = Buffer.from(envelope.digest, "hex");
    if (
      expectedDigest.length !== suppliedDigest.length ||
      !timingSafeEqual(expectedDigest, suppliedDigest)
    ) {
      return invalidSecret();
    }
    return url;
  } catch {
    return invalidSecret();
  }
}
