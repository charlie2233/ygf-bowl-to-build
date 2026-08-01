import { NextResponse } from "next/server";

import { readBoundedRequestText } from "@/lib/admin/http";
import {
  ACCOUNT_MERGE_TTL_SECONDS,
  anonymousAccountMergeSourceFromClaims,
  applyAccountMergeCookie,
  createAccountMergeIntentSecret,
  isAccountMergeProvider,
  type AccountMergeProvider,
} from "@/lib/auth/account-merge-intent";
import { isSameOriginMutation } from "@/lib/auth/admin";
import {
  createAuthServerClient,
  createServiceRoleClient,
} from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const MAXIMUM_BODY_BYTES = 64;
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
};

interface MergeIntentUser {
  id: string;
  isAnonymous: boolean;
  sessionId: string;
}

interface PersistMergeIntentInput {
  provider: AccountMergeProvider;
  sourceUserId: string;
  sourceSessionId: string;
  tokenDigest: string;
}

interface MergeIntentDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  getUser: () => Promise<MergeIntentUser | null>;
  nodeEnvironment?: string;
  persistIntent: (input: PersistMergeIntentInput) => Promise<void>;
}

function response(error: string, status: number) {
  return NextResponse.json(
    { error },
    { headers: PRIVATE_HEADERS, status },
  );
}

async function readProvider(request: Request) {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    return null;
  }
  try {
    const body = JSON.parse(
      await readBoundedRequestText(request, MAXIMUM_BODY_BYTES),
    ) as unknown;
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !("provider" in body) ||
      !isAccountMergeProvider(body.provider)
    ) {
      return null;
    }
    return body.provider;
  } catch {
    return null;
  }
}

export function createAccountMergeIntentHandler({
  environment = process.env,
  getUser,
  nodeEnvironment = process.env.NODE_ENV,
  persistIntent,
}: MergeIntentDependencies) {
  return async function post(request: Request) {
    if (!isSameOriginMutation(request, environment)) {
      return response("ORIGIN_FORBIDDEN", 403);
    }
    const provider = await readProvider(request);
    if (!provider) {
      return response("MERGE_INTENT_INVALID", 400);
    }

    let user: MergeIntentUser | null;
    try {
      user = await getUser();
    } catch {
      return response("MERGE_INTENT_UNAVAILABLE", 503);
    }
    if (!user) {
      return response("AUTHENTICATION_REQUIRED", 401);
    }
    if (!user.isAnonymous) {
      return response("ANONYMOUS_ACCOUNT_REQUIRED", 409);
    }

    try {
      const secret = createAccountMergeIntentSecret(provider);
      await persistIntent({
        provider,
        sourceSessionId: user.sessionId,
        sourceUserId: user.id,
        tokenDigest: secret.digest,
      });
      const result = NextResponse.json(
        {
          expiresIn: ACCOUNT_MERGE_TTL_SECONDS,
          ready: true,
        },
        { headers: PRIVATE_HEADERS, status: 201 },
      );
      return applyAccountMergeCookie(
        result,
        secret.value,
        nodeEnvironment,
      );
    } catch {
      return response("MERGE_INTENT_UNAVAILABLE", 503);
    }
  };
}

async function persistIntent({
  provider,
  sourceSessionId,
  sourceUserId,
  tokenDigest,
}: PersistMergeIntentInput) {
  const { error } = await createServiceRoleClient().rpc(
    "create_account_merge_intent",
    {
      p_provider: provider,
      p_source_session_id: sourceSessionId,
      p_source_user_id: sourceUserId,
      p_token_digest: tokenDigest,
    },
  );
  if (error) {
    throw new Error("MERGE_INTENT_UNAVAILABLE");
  }
}

const handler = createAccountMergeIntentHandler({
  async getUser() {
    const client = await createAuthServerClient();
    const { data, error } = await client.auth.getClaims();
    if (error) {
      throw new Error("MERGE_INTENT_UNAVAILABLE");
    }
    return anonymousAccountMergeSourceFromClaims(data?.claims);
  },
  persistIntent,
});

export const POST = handler;
