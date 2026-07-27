import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthRuntime } from "@/lib/auth/runtime";

export async function updateAuthSession(request: NextRequest) {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "demo") {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const client = createServerClient(runtime.url, runtime.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
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
