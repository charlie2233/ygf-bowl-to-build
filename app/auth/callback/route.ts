import { NextResponse, type NextRequest } from "next/server";

import { safeAuthNextPath } from "@/lib/auth/redirect";
import { createAuthServerClient } from "@/lib/auth/server";

function callbackRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeAuthNextPath(
    request.nextUrl.searchParams.getAll("next"),
  );
  if (!code) {
    return callbackRedirect(
      new URL("/auth?error=callback", request.url),
    );
  }

  const client = await createAuthServerClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return callbackRedirect(
      new URL("/auth?error=callback", request.url),
    );
  }
  return callbackRedirect(new URL(nextPath, request.url));
}
