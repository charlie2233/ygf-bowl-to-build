const DEFAULT_AUTH_NEXT_PATH = "/redeem";
const ALLOWED_AUTH_NEXT_PATHS = new Set(["/redeem", "/wallet"]);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const MAXIMUM_DECODE_PASSES = 3;

function singleValue(
  value: string | string[] | null | undefined,
): string | null {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] ?? null : null;
  }
  return value ?? null;
}

function decodeBounded(value: string): string | null {
  let decoded = value;

  try {
    for (let pass = 0; pass < MAXIMUM_DECODE_PASSES; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return decoded;
      }
      decoded = next;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function safeAuthNextPath(
  value: string | string[] | null | undefined,
): string {
  const candidate = singleValue(value);
  if (!candidate) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  const decoded = decodeBounded(candidate);
  if (
    !decoded ||
    CONTROL_CHARACTER_PATTERN.test(decoded) ||
    decoded.includes("\\") ||
    !decoded.startsWith("/") ||
    decoded.startsWith("//")
  ) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  const base = new URL("https://auth-next.invalid");
  let resolved: URL;
  try {
    resolved = new URL(decoded, base);
  } catch {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  if (
    resolved.origin !== base.origin ||
    resolved.pathname !== decoded ||
    resolved.search.length > 0 ||
    resolved.hash.length > 0 ||
    !ALLOWED_AUTH_NEXT_PATHS.has(resolved.pathname)
  ) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  return resolved.pathname;
}
