import { describe, expect, it } from "vitest";

import {
  decryptClaudeGiftUrl,
  encryptClaudeGiftUrl,
  isPartnerRewardSecretEnvelope,
  normalizeClaudeGiftUrl,
  resolveRewardEncryptionKey,
} from "@/lib/rewards/secret";

const KEY = Buffer.alloc(32, 7);
const KEY_BASE64 = KEY.toString("base64");
const GIFT_URL =
  "https://claude.ai/gift/redeem?gift=unit-test-private-token";

describe("Claude gift secret boundary", () => {
  it("accepts only an official HTTPS redemption URL with a gift value", () => {
    expect(normalizeClaudeGiftUrl(GIFT_URL)).toBe(GIFT_URL);
    expect(
      normalizeClaudeGiftUrl(
        "https://claude.ai/gift/redeem?gift=opaque-token&utm_source=partner",
      ),
    ).toBe(
      "https://claude.ai/gift/redeem?gift=opaque-token&utm_source=partner",
    );
    expect(
      normalizeClaudeGiftUrl("https://claude.ai/gift/redeem/opaque%2Ftoken"),
    ).toBe("https://claude.ai/gift/redeem/opaque%2Ftoken");

    for (const value of [
      "https://claude.ai/gift",
      "https://claude.ai/gift/",
      "https://claude.ai/gift/foo",
      "https://claude.ai/gift/redeem",
      "https://claude.ai/gift/redeem?code=",
      "https://claude.ai/gift/redeem?utm_source=partner",
      "https://claude.ai/gift/redeem?gift=",
      "https://claude.ai/gift/redeem?gift=one&gift=two",
      "https://claude.ai/gift/redeem?gift=one&gift=one",
      "https://claude.ai/gift/redeem/",
      "https://claude.ai/gift/redeem/opaque-token/extra",
      "http://claude.ai/gift/redeem?gift=x",
      "https://claude.ai.evil.example/gift/redeem?gift=x",
      "https://user:pass@claude.ai/gift/redeem?gift=x",
      "https://claude.ai:444/gift/redeem?gift=x",
      "https://claude.ai/invite?gift=x",
      "https://claude.ai/gift/redeem#private",
    ]) {
      expect(() => normalizeClaudeGiftUrl(value)).toThrow(
        "PARTNER_REWARD_SECRET_INVALID",
      );
    }
  });

  it("encrypts with authenticated encryption and validates the digest", () => {
    const envelope = encryptClaudeGiftUrl(GIFT_URL, KEY);

    expect(isPartnerRewardSecretEnvelope(envelope)).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain(GIFT_URL);
    expect(decryptClaudeGiftUrl(envelope, KEY)).toBe(GIFT_URL);

    const tamperedCiphertext = `${
      envelope.ciphertext[0] === "A" ? "B" : "A"
    }${envelope.ciphertext.slice(1)}`;
    expect(tamperedCiphertext).not.toBe(envelope.ciphertext);
    expect(() =>
      decryptClaudeGiftUrl(
        {
          ...envelope,
          ciphertext: tamperedCiphertext,
        },
        KEY,
      ),
    ).toThrow("PARTNER_REWARD_SECRET_INVALID");
    expect(() =>
      decryptClaudeGiftUrl(envelope, Buffer.alloc(32, 8)),
    ).toThrow("PARTNER_REWARD_SECRET_INVALID");
  });

  it("requires one canonical 256-bit base64 server key", () => {
    expect(
      resolveRewardEncryptionKey({
        YGF_REWARD_ENCRYPTION_KEY: KEY_BASE64,
      }),
    ).toEqual(KEY);
    for (const configured of [
      "",
      "short",
      Buffer.alloc(31).toString("base64"),
      Buffer.alloc(33).toString("base64"),
      KEY_BASE64.replace(/=$/u, ""),
    ]) {
      expect(() =>
        resolveRewardEncryptionKey({
          YGF_REWARD_ENCRYPTION_KEY: configured,
        }),
      ).toThrow("PARTNER_REWARD_SECRET_INVALID");
    }
  });
});
