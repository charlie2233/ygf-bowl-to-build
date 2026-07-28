import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { SITE_PATHNAME_HEADER } from "@/lib/i18n/site";

function nextResponseFor(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(SITE_PATHNAME_HEADER, request.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export async function updateAuthSession(request: NextRequest) {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "demo") {
    return nextResponseFor(request);
  }

  let response = nextResponseFor(request);
  const client = createServerClient(runtime.url, runtime.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = nextResponseFor(request);
        for (const { name, options, value } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        response.headers.set("cache-control", "private, no-store");
      },
    },
  });

  await client.auth.getClaims();
  return response;
}
