import { NextResponse, type NextRequest } from "next/server";

import { isIdentityAlreadyExistsError } from "@/lib/auth/errors";
import { safeAuthNextPath } from "@/lib/auth/redirect";
import { createAuthServerClient } from "@/lib/auth/server";

function callbackRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function callbackErrorUrl(request: NextRequest, error: unknown = null) {
  const providerErrorCode = request.nextUrl.searchParams.get("error_code");
  const isIdentityConflict =
    providerErrorCode === "identity_already_exists" ||
    isIdentityAlreadyExistsError(error);
  const url = new URL("/auth", request.url);
  url.searchParams.set(
    "error",
    isIdentityConflict ? "identity-already-exists" : "callback",
  );
  url.searchParams.set(
    "next",
    safeAuthNextPath(request.nextUrl.searchParams.getAll("next")),
  );
  return url;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeAuthNextPath(
    request.nextUrl.searchParams.getAll("next"),
  );
  if (!code) {
    return callbackRedirect(callbackErrorUrl(request));
  }

  const client = await createAuthServerClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return callbackRedirect(callbackErrorUrl(request, error));
  }
  return callbackRedirect(new URL(nextPath, request.url));
}
