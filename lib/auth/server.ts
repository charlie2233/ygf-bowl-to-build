import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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
