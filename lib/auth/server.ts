import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { resolveAuthRuntime } from "@/lib/auth/runtime";

export async function createAuthServerClient() {
  const runtime = resolveAuthRuntime();
  if (runtime.mode !== "supabase") {
    throw new Error("Supabase auth is unavailable in demo mode");
  }
  const cookieStore = await cookies();

  return createServerClient(runtime.url, runtime.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot always write cookies. proxy.ts owns refresh.
        }
      },
    },
  });
}

interface BufferedCookie {
  name: string;
  options: CookieOptions;
  value: string;
}

export function createBufferedAuthServerClient(
  request: NextRequest,
) {
  const runtime = resolveAuthRuntime();
  if (runtime.mode !== "supabase") {
    throw new Error("Supabase auth is unavailable in demo mode");
  }
  const bufferedCookies = new Map<string, BufferedCookie>();
  const bufferedHeaders = new Map<string, string>();
  const client = createServerClient(
    runtime.url,
    runtime.publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(({ name, value }) => ({
            name,
            value,
          }));
        },
        setAll(cookiesToSet, headersToSet) {
          for (const cookie of cookiesToSet) {
            bufferedCookies.set(cookie.name, {
              name: cookie.name,
              options: { ...cookie.options },
              value: cookie.value,
            });
          }
          for (const [name, value] of Object.entries(headersToSet)) {
            bufferedHeaders.set(name, value);
          }
        },
      },
    },
  );

  return {
    applyTo(response: NextResponse) {
      for (const { name, options, value } of bufferedCookies.values()) {
        response.cookies.set(name, value, options);
      }
      for (const [name, value] of bufferedHeaders) {
        response.headers.set(name, value);
      }
      return response;
    },
    client,
  };
}

export function createServiceRoleClient() {
  const runtime = resolveAuthRuntime();
  if (runtime.mode !== "supabase") {
    throw new Error("Supabase service access is unavailable in demo mode");
  }

  return createClient(runtime.url, runtime.serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
