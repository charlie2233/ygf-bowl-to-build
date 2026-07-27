import { domainError } from "@/lib/campaign/types";

const CODE_LENGTH = 8;
const SHA256_HEX_LENGTH = 64;
const ACCEPTED_CODE_INPUT = /^[A-Za-z0-9\s-]+$/;
const NORMALIZED_CODE = /^[A-Z0-9]{8}$/;

export function normalizeCode(input: string): string {
  if (
    typeof input !== "string" ||
    input.length > 64 ||
    !ACCEPTED_CODE_INPUT.test(input)
  ) {
    return domainError("INVALID_CODE");
  }

  const normalized = input.replace(/[\s-]/g, "").toUpperCase();

  if (
    normalized.length !== CODE_LENGTH ||
    !NORMALIZED_CODE.test(normalized)
  ) {
    return domainError("INVALID_CODE");
  }

  return normalized;
}

export async function hashCode(input: string): Promise<string> {
  const normalized = normalizeCode(input);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function constantTimeEqualHex(left: string, right: string): boolean {
  if (
    left.length !== SHA256_HEX_LENGTH ||
    right.length !== SHA256_HEX_LENGTH ||
    !/^[a-f0-9]+$/i.test(left) ||
    !/^[a-f0-9]+$/i.test(right)
  ) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < SHA256_HEX_LENGTH; index += 2) {
    difference |=
      Number.parseInt(left.slice(index, index + 2), 16) ^
      Number.parseInt(right.slice(index, index + 2), 16);
  }
  return difference === 0;
}

export async function matchesCodeHash(
  code: string,
  expectedHash: string,
): Promise<boolean> {
  const actualHash = await hashCode(code);
  return constantTimeEqualHex(actualHash, expectedHash);
}
