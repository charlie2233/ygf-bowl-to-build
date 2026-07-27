import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthRuntime } from "@/lib/auth/runtime";
import { createAuthServerClient } from "@/lib/auth/server";

export async function POST(request: NextRequest) {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "supabase") {
    const client = await createAuthServerClient();
    await client.auth.signOut();
  }

  const response = NextResponse.redirect(
    new URL("/", request.url),
    303,
  );
  response.headers.set("cache-control", "private, no-store");
  return response;
}
