import { NextResponse, type NextRequest } from "next/server";

import {
  ACCOUNT_MERGE_COOKIE,
  anonymousAccountMergeSourceFromClaims,
  clearAccountMergeCookie,
  readAccountMergeIntentSecret,
} from "@/lib/auth/account-merge-intent";
import { isIdentityAlreadyExistsError } from "@/lib/auth/errors";
import { safeAuthNextPath } from "@/lib/auth/redirect";
import {
  createAuthServerClient,
  createBufferedAuthServerClient,
  createServiceRoleClient,
} from "@/lib/auth/server";

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
  const rawMergeCookie = request.cookies.get(
    ACCOUNT_MERGE_COOKIE,
  )?.value;
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeAuthNextPath(
    request.nextUrl.searchParams.getAll("next"),
  );
  if (!code) {
    const result = callbackRedirect(callbackErrorUrl(request));
    return rawMergeCookie
      ? clearAccountMergeCookie(result)
      : result;
  }

  if (!rawMergeCookie) {
    const client = await createAuthServerClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      return callbackRedirect(callbackErrorUrl(request, error));
    }
    return callbackRedirect(new URL(nextPath, request.url));
  }
  const intent = readAccountMergeIntentSecret(rawMergeCookie);
  if (!intent) {
    return clearAccountMergeCookie(
      callbackRedirect(callbackErrorUrl(request)),
    );
  }

  const buffered = createBufferedAuthServerClient(request);
  const { data: sourceData, error: sourceError } =
    await buffered.client.auth.getClaims();
  const source = anonymousAccountMergeSourceFromClaims(
    sourceData?.claims,
  );
  if (sourceError || !source) {
    return clearAccountMergeCookie(
      callbackRedirect(callbackErrorUrl(request)),
    );
  }

  const { error } =
    await buffered.client.auth.exchangeCodeForSession(code);
  if (error) {
    return clearAccountMergeCookie(
      callbackRedirect(callbackErrorUrl(request, error)),
    );
  }

  const { data: userData, error: userError } =
    await buffered.client.auth.getUser();
  const user = userData?.user;
  const hasExpectedProvider = user?.identities?.some(
    (identity) => identity.provider === intent.provider,
  );
  if (
    userError ||
    !user ||
    user.is_anonymous === true ||
    !hasExpectedProvider
  ) {
    return clearAccountMergeCookie(
      callbackRedirect(callbackErrorUrl(request)),
    );
  }

  const { data: mergeData, error: mergeError } =
    await createServiceRoleClient().rpc(
      "consume_account_merge_intent",
      {
        p_provider: intent.provider,
        p_source_session_id: source.sessionId,
        p_target_user_id: user.id,
        p_token_digest: intent.digest,
      },
    );
  if (
    mergeError ||
    !Array.isArray(mergeData) ||
    mergeData.length !== 1
  ) {
    return clearAccountMergeCookie(
      callbackRedirect(callbackErrorUrl(request)),
    );
  }

  return clearAccountMergeCookie(
    buffered.applyTo(
      callbackRedirect(new URL(nextPath, request.url)),
    ),
  );
}
