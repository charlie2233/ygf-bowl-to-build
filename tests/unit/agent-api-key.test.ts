import { describe, expect, it } from "vitest";

import {
  AGENT_API_KEY_DIGEST_VERSION,
  AGENT_API_KEY_RANDOM_BYTES,
  digestAgentApiKey,
  generateAgentApiKey,
  verifyAgentApiKey,
} from "@/lib/agent/api-key";

const DIGEST_SECRET =
  "agent-api-key-test-digest-secret-with-at-least-32-bytes";

describe("Agent API key material", () => {
  it("generates a namespaced secret with 256 bits of random material", () => {
    const first = generateAgentApiKey({ digestSecret: DIGEST_SECRET });
    const second = generateAgentApiKey({ digestSecret: DIGEST_SECRET });

    expect(AGENT_API_KEY_RANDOM_BYTES).toBe(32);
    expect(first.plaintext).toMatch(/^ygf_[A-Za-z0-9_-]{43}$/);
    expect(
      Buffer.from(first.plaintext.slice("ygf_".length), "base64url"),
    ).toHaveLength(32);
    expect(second.plaintext).not.toBe(first.plaintext);
  });

  it("keeps only a versioned keyed digest and safe display fragments", () => {
    const generated = generateAgentApiKey({
      digestSecret: DIGEST_SECRET,
    });

    expect(generated.persistence).toEqual({
      digest: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      digestVersion: AGENT_API_KEY_DIGEST_VERSION,
      last4: generated.plaintext.slice(-4),
      prefix: generated.plaintext.slice(0, 8),
    });
    expect(generated.persistence.digest).not.toContain(
      generated.plaintext,
    );
    expect(Object.keys(generated)).toEqual(["persistence"]);
    expect(JSON.stringify(generated)).not.toContain(generated.plaintext);
    expect(JSON.stringify(generated.persistence)).not.toContain(
      generated.plaintext,
    );
    expect(
      digestAgentApiKey(generated.plaintext, DIGEST_SECRET),
    ).toBe(generated.persistence.digest);
  });

  it("verifies valid material and rejects substitutions or wrong keys", () => {
    const generated = generateAgentApiKey({
      digestSecret: DIGEST_SECRET,
    });
    const verify = (plaintext: string, digestSecret = DIGEST_SECRET) =>
      verifyAgentApiKey({
        digestSecret,
        persistence: generated.persistence,
        plaintext,
      });
    const replacement =
      generated.plaintext.endsWith("x") ? "y" : "x";

    expect(verify(generated.plaintext)).toBe(true);
    expect(
      verify(`${generated.plaintext.slice(0, -1)}${replacement}`),
    ).toBe(false);
    expect(
      verify(
        generated.plaintext,
        "different-agent-api-digest-secret-at-least-32-bytes",
      ),
    ).toBe(false);
    expect(
      verifyAgentApiKey({
        digestSecret: DIGEST_SECRET,
        persistence: {
          ...generated.persistence,
          digest: "not-a-valid-digest",
        },
        plaintext: generated.plaintext,
      }),
    ).toBe(false);
  });

  it("fails safely when the server HMAC key is weak", () => {
    expect(() =>
      generateAgentApiKey({ digestSecret: "too-short" }),
    ).toThrow("AGENT_API_KEY_DIGEST_SECRET_INVALID");
    expect(() =>
      verifyAgentApiKey({
        digestSecret: "too-short",
        persistence: {
          digest: "not-a-valid-digest",
          digestVersion: AGENT_API_KEY_DIGEST_VERSION,
          last4: "safe",
          prefix: "ygf_safe",
        },
        plaintext: "ygf_should-never-appear-in-an-error",
      }),
    ).toThrow("AGENT_API_KEY_DIGEST_SECRET_INVALID");
  });
});
