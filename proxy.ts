import { NextResponse, type NextRequest } from "next/server";

import { updateAuthSession } from "@/lib/auth/proxy";

const RETIRED_REDEEM_QUERY_KEYS = new Set([
  "claim",
  "code",
  "termsaccepted",
  "token",
]);

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/redeem" &&
    Array.from(request.nextUrl.searchParams.keys()).some((key) =>
      RETIRED_REDEEM_QUERY_KEYS.has(key.toLowerCase()),
    )
  ) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.search = "";
    const response = NextResponse.redirect(cleanUrl, 307);
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  }

  const response = await updateAuthSession(request);
  if (request.nextUrl.pathname === "/redeem") {
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("referrer-policy", "no-referrer");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
