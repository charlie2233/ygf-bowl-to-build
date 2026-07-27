import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hashCode } from "@/lib/campaign/code";
import type {
  RecordEventInput,
  RecordSessionInput,
} from "@/lib/repositories/campaign-repository";
import { MemoryCampaignRepository } from "@/lib/repositories/memory-campaign-repository";

const START = new Date("2026-07-26T12:00:00.000Z");

function demoRepository() {
  let current = new Date(START);
  const repository = new MemoryCampaignRepository({
    demoMode: true,
    now: () => new Date(current),
  });

  return {
    repository,
    setNow(value: string) {
      current = new Date(value);
    },
  };
}

async function redeemDemo(
  repository: MemoryCampaignRepository,
  userId = "user-1",
) {
  return repository.redeemCode({
    code: "BOWL7K2A",
    userId,
    idempotencyKey: `redeem-${userId}`,
  });
}

describe("MemoryCampaignRepository redemption", () => {
  it("gates the deterministic seed behind explicit demo mode", async () => {
    const productionLike = new MemoryCampaignRepository({
      now: () => new Date(START),
    });
    const demo = demoRepository().repository;

    await expect(
      productionLike.validateCode({ code: "BOWL7K2A" }),
    ).resolves.toEqual({ eligible: false });
    await expect(
      demo.validateCode({ code: "BOWL7K2A" }),
    ).resolves.toEqual({ eligible: true });
    expect(JSON.stringify(demo)).not.toContain("BOWL7K2A");
  });

  it("redeems once, retries idempotently, and enforces one account per person", async () => {
    const { repository } = demoRepository();
    const first = await redeemDemo(repository);
    const retry = await redeemDemo(repository);

    expect(retry).toEqual(first);
    expect(first.wallet).toMatchObject({
      userId: "user-1",
      initialBalance: 3_000,
      remainingBalance: 3_000,
      reservedBalance: 0,
      createdAt: "2026-07-26T12:00:00.000Z",
      expiresAt: "2026-08-09T12:00:00.000Z",
    });
    await expect(
      repository.redeemCode({
        code: "MISSING9",
        userId: "user-1",
        idempotencyKey: "redeem-user-1",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      repository.redeemCode({
        code: "BOWL7K2A",
        userId: "user-2",
        idempotencyKey: "redeem-user-2",
      }),
    ).rejects.toMatchObject({ code: "CODE_ALREADY_REDEEMED" });

    const secondCode = "OTHER9Z9";
    await repository.createBatch({
      name: "second batch",
      codeHashes: [await hashCode(secondCode)],
    });
    await expect(
      repository.redeemCode({
        code: secondCode,
        userId: "user-1",
        idempotencyKey: "second-code-same-user",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_ALREADY_REDEEMED" });
  });

  it("returns typed errors for expired, revoked, and unknown codes", async () => {
    const { repository, setNow } = demoRepository();
    const expiredCode = "EXPIRE99";
    const revokedCode = "REVOKE99";

    await repository.createBatch({
      name: "state batch",
      codeHashes: [
        await hashCode(expiredCode),
        await hashCode(revokedCode),
      ],
      expiresAt: "2026-07-26T13:00:00.000Z",
    });
    await repository.revokeCode({ code: revokedCode });
    setNow("2026-07-26T13:00:00.000Z");

    await expect(
      repository.validateCode({ code: expiredCode }),
    ).resolves.toEqual({ eligible: false });
    await expect(
      repository.redeemCode({
        code: expiredCode,
        userId: "expired-user",
        idempotencyKey: "expired-redemption",
      }),
    ).rejects.toMatchObject({ code: "CODE_EXPIRED" });
    await expect(
      repository.redeemCode({
        code: revokedCode,
        userId: "revoked-user",
        idempotencyKey: "revoked-redemption",
      }),
    ).rejects.toMatchObject({ code: "CODE_REVOKED" });
    await expect(
      repository.redeemCode({
        code: "MISSING9",
        userId: "unknown-user",
        idempotencyKey: "unknown-redemption",
      }),
    ).rejects.toMatchObject({ code: "CODE_NOT_FOUND" });
  });
});

describe("MemoryCampaignRepository spending", () => {
  it("reserves, commits, and refunds atomically and idempotently", async () => {
    const { repository } = demoRepository();
    await redeemDemo(repository);

    const reservation = await repository.reserveSpend({
      userId: "user-1",
      idempotencyKey: "task-1",
      providerCostMicroUsd: 30_000,
    });
    expect(reservation.wallet).toMatchObject({
      remainingBalance: 2_880,
      reservedBalance: 120,
      providerReservedMicroUsd: 30_000,
    });
    await expect(
      repository.reserveSpend({
        userId: "user-1",
        idempotencyKey: "task-1",
        providerCostMicroUsd: 30_000,
      }),
    ).resolves.toEqual(reservation);
    await expect(
      repository.reserveSpend({
        userId: "user-1",
        idempotencyKey: "task-1",
        providerCostMicroUsd: 30_001,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const committed = await repository.commitSpend({
      userId: "user-1",
      reservationId: reservation.reservation.id,
      providerCostMicroUsd: 24_000,
      idempotencyKey: "commit-task-1",
    });
    await expect(
      repository.commitSpend({
        userId: "user-1",
        reservationId: reservation.reservation.id,
        providerCostMicroUsd: 24_000,
        idempotencyKey: "commit-task-1",
      }),
    ).resolves.toEqual(committed);
    await expect(
      repository.commitSpend({
        userId: "user-1",
        reservationId: reservation.reservation.id,
        providerCostMicroUsd: 24_000,
        idempotencyKey: "different-commit-key",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(committed.wallet).toMatchObject({
      remainingBalance: 2_880,
      reservedBalance: 0,
      providerCommittedMicroUsd: 24_000,
      providerReservedMicroUsd: 0,
    });
    await expect(
      repository.reserveSpend({
        userId: "user-1",
        idempotencyKey: "task-1",
        providerCostMicroUsd: 30_000,
      }),
    ).resolves.toEqual(reservation);

    const refundable = await repository.reserveSpend({
      userId: "user-1",
      idempotencyKey: "task-2",
      providerCostMicroUsd: 10_000,
    });
    const refunded = await repository.refundSpend({
      userId: "user-1",
      reservationId: refundable.reservation.id,
      idempotencyKey: "refund-task-2",
    });
    await expect(
      repository.refundSpend({
        userId: "user-1",
        reservationId: refundable.reservation.id,
        idempotencyKey: "refund-task-2",
      }),
    ).resolves.toEqual(refunded);
    await expect(
      repository.refundSpend({
        userId: "user-1",
        reservationId: refundable.reservation.id,
        idempotencyKey: "different-refund-key",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(refunded.wallet).toMatchObject({
      remainingBalance: 2_880,
      reservedBalance: 0,
      providerCommittedMicroUsd: 24_000,
      providerReservedMicroUsd: 0,
    });
    await expect(
      repository.reserveSpend({
        userId: "user-1",
        idempotencyKey: "task-2",
        providerCostMicroUsd: 10_000,
      }),
    ).resolves.toEqual(refundable);
  });

  it("refuses expired wallets and enforces the integer provider-cost cap", async () => {
    const { repository, setNow } = demoRepository();
    await redeemDemo(repository);

    const costly = await repository.reserveSpend({
      userId: "user-1",
      idempotencyKey: "costly-task",
      providerCostMicroUsd: 240_000,
    });
    await repository.commitSpend({
      userId: "user-1",
      reservationId: costly.reservation.id,
      providerCostMicroUsd: 240_000,
      idempotencyKey: "commit-costly-task",
    });
    await expect(
      repository.reserveSpend({
        userId: "user-1",
        idempotencyKey: "over-cap",
        providerCostMicroUsd: 10_001,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_COST_LIMIT_EXCEEDED",
    });

    setNow("2026-08-09T12:00:00.000Z");
    await expect(
      repository.reserveSpend({
        userId: "user-1",
        idempotencyKey: "expired-wallet",
        providerCostMicroUsd: 1,
      }),
    ).rejects.toMatchObject({ code: "WALLET_EXPIRED" });
  });
});

describe("MemoryCampaignRepository privacy and operations", () => {
  it("stores history metadata and only an explicitly saved output", async () => {
    const { repository } = demoRepository();
    await redeemDemo(repository);
    const first = await repository.reserveSpend({
      userId: "user-1",
      idempotencyKey: "history-1",
      providerCostMicroUsd: 5_000,
    });
    await repository.commitSpend({
      userId: "user-1",
      reservationId: first.reservation.id,
      providerCostMicroUsd: 4_000,
      idempotencyKey: "commit-history-1",
    });

    await repository.recordSession({
      userId: "user-1",
      reservationId: first.reservation.id,
      taskType: "study",
      title: "Study plan",
      model: "demo/model",
      inputUnits: 20,
      outputUnits: 40,
      providerCostMicroUsd: 4_000,
      status: "completed",
      prompt: "raw prompt must never be retained",
    } as RecordSessionInput & { prompt: string });

    const second = await repository.reserveSpend({
      userId: "user-1",
      idempotencyKey: "history-2",
      providerCostMicroUsd: 5_000,
    });
    await repository.commitSpend({
      userId: "user-1",
      reservationId: second.reservation.id,
      providerCostMicroUsd: 4_000,
      idempotencyKey: "commit-history-2",
    });
    await repository.recordSession({
      userId: "user-1",
      reservationId: second.reservation.id,
      taskType: "career",
      title: "Interview checklist",
      model: "demo/model",
      inputUnits: 25,
      outputUnits: 50,
      providerCostMicroUsd: 4_000,
      status: "completed",
      savedOutput: "A user explicitly saved this result.",
    });
    await repository.recordEvent({
      userId: "user-1",
      name: "task_completed",
      source: "wallet",
      metadata: { taskType: "career" },
      rawPrompt: "event prompt must never be retained",
    } as RecordEventInput & { rawPrompt: string });

    const history = await repository.listHistory({ userId: "user-1" });
    expect(history).toHaveLength(2);
    expect(history[0]).not.toHaveProperty("prompt");
    expect(history[0]).not.toHaveProperty("savedOutput");
    expect(history[1].savedOutput).toBe(
      "A user explicitly saved this result.",
    );

    const serialized = JSON.stringify(repository);
    expect(serialized).not.toContain("BOWL7K2A");
    expect(serialized).not.toContain("raw prompt must never be retained");
    expect(serialized).not.toContain("event prompt must never be retained");
  });

  it("creates batches, revokes codes, records events, and reports a dashboard", async () => {
    const { repository } = demoRepository();
    const code = "BATCH9Z9";
    const batch = await repository.createBatch({
      name: "manager batch",
      codeHashes: [await hashCode(code)],
      expiresAt: "2026-08-01T12:00:00.000Z",
    });
    await repository.recordEvent({
      name: "batch_distributed",
      source: "counter-card",
      metadata: { count: 1 },
    });

    expect(batch).toMatchObject({
      name: "manager batch",
      codeCount: 1,
    });
    await expect(
      repository.validateCode({ code }),
    ).resolves.toEqual({ eligible: true });
    await repository.revokeCode({ code });
    await expect(
      repository.validateCode({ code }),
    ).resolves.toEqual({ eligible: false });

    await expect(repository.getDashboard()).resolves.toMatchObject({
      batchCount: 2,
      codeCount: 2,
      redeemedCount: 0,
      activeWalletCount: 0,
      eventCount: 1,
      providerCostMicroUsd: 0,
    });
  });

  it("accepts only controlled event names, sources, and bounded primitive metadata", async () => {
    const { repository } = demoRepository();
    const safe = await repository.recordEvent({
      name: "task_completed",
      source: "wallet",
      metadata: {
        taskType: "career",
        outcome: "success",
        credits: 120,
        latencyBucket: "under-30s",
        isReturning: false,
      },
    });

    expect(safe).toMatchObject({
      name: "task_completed",
      source: "wallet",
      metadata: {
        taskType: "career",
        outcome: "success",
        credits: 120,
        latencyBucket: "under-30s",
        isReturning: false,
      },
    });

    const unsafe = [
      {
        name: "task_completed",
        source: "203.0.113.42",
        metadata: { taskType: "career" },
      },
      {
        name: "task_completed",
        source: "2001:db8::1",
        metadata: { taskType: "career" },
      },
      {
        name: "task_completed",
        source: "wallet",
        metadata: { detail: "BOWL7K2A" },
      },
      {
        name: "task_completed",
        source: "wallet",
        metadata: { promoCode: "BOWL7K2A" },
      },
      {
        name: "task_completed",
        source: "wallet",
        metadata: { outcome: { nested: "success" } },
      },
      {
        name: "task_completed",
        source: "wallet",
        metadata: { arbitrary: "safe-looking" },
      },
      {
        name: "task_completed",
        source: "wallet",
        metadata: { outcome: ["success"] },
      },
      {
        name: "task_completed",
        source: "wallet",
        metadata: { outcome: "x".repeat(300) },
      },
    ] as const;

    for (const event of unsafe) {
      await expect(
        repository.recordEvent(
          event as unknown as RecordEventInput,
        ),
      ).rejects.toMatchObject({ code: "EVENT_INVALID" });
    }

    const serialized = JSON.stringify(repository);
    expect(serialized).not.toContain("203.0.113.42");
    expect(serialized).not.toContain("2001:db8::1");
    expect(serialized).not.toContain("BOWL7K2A");
    expect(serialized).not.toContain("safe-looking");
  });

  it("maps malformed batch metadata to a typed domain error", async () => {
    const { repository } = demoRepository();

    await expect(
      repository.createBatch({
        name: "invalid expiry",
        codeHashes: [await hashCode("INVALID9")],
        expiresAt: "not-a-date",
      }),
    ).rejects.toMatchObject({ code: "BATCH_INVALID" });
  });
});

describe("Supabase campaign migration contract", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/202607260001_campaign.sql",
  );
  const sql = existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8")
    : "";
  const tables = [
    "profiles",
    "promo_batches",
    "promo_codes",
    "wallets",
    "ledger_entries",
    "task_sessions",
    "events",
    "redemption_attempts",
    "public_validation_attempts",
    "partner_connections",
    "provider_policies",
  ] as const;
  const rpcFunctions = [
    "redeem_campaign_code",
    "reserve_campaign_spend",
    "commit_campaign_spend",
    "refund_campaign_spend",
  ] as const;

  function functionBody(name: string, candidateSql = sql) {
    const start = candidateSql.search(
      new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b`,
        "i",
      ),
    );
    const end = candidateSql.indexOf("$$;", start);
    return start === -1 || end === -1
      ? ""
      : candidateSql.slice(start, end + 3);
  }

  function tableDefinition(name: string, candidateSql = sql) {
    const start = candidateSql.search(
      new RegExp(`create\\s+table\\s+public\\.${name}\\b`, "i"),
    );
    const end = candidateSql.indexOf("\n);", start);
    return start === -1 || end === -1
      ? ""
      : candidateSql.slice(start, end + 3);
  }

  function assertSecureRedeemBoundary(candidateSql: string) {
    const grants = Array.from(
      candidateSql.matchAll(
        /grant\s+execute\s+on\s+function\s+public\.redeem_campaign_code\s*\([^;]*\)\s+to\s+[^;]+;/gi,
      ),
      (match) => match[0],
    );
    const revoke = candidateSql.match(
      /revoke\s+all\s+on\s+function\s+public\.redeem_campaign_code\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*\)\s+from\s+([^;]+);/i,
    );

    if (
      /create\s+or\s+replace\s+function\s+public\.redeem_campaign_code\s*\(\s*p_code_hash\s+text\s*,\s*p_idempotency_key\s+text\s*\)/i.test(
        candidateSql,
      ) ||
      /redeem_campaign_code\s*\(\s*text\s*,\s*text\s*\)/i.test(
        candidateSql,
      )
    ) {
      throw new Error("legacy redemption overload remains");
    }
    if (!revoke) {
      throw new Error("privileged redemption revoke is missing");
    }
    for (const role of ["public", "anon", "authenticated"]) {
      if (!new RegExp(`\\b${role}\\b`, "i").test(revoke[1])) {
        throw new Error(`privileged redemption does not revoke ${role}`);
      }
    }
    if (
      grants.length === 0 ||
      !grants.some((grant) =>
        /redeem_campaign_code\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*\)\s+to\s+service_role\s*;/i.test(
          grant,
        ),
      )
    ) {
      throw new Error("service-role redemption grant is missing");
    }
    if (
      grants.some((grant) =>
        /\bto\b[^;]*\b(?:public|anon|authenticated)\b/i.test(grant),
      )
    ) {
      throw new Error("unsafe redemption grant remains");
    }
  }

  function assertServiceRoleOnlyFunction(
    candidateSql: string,
    name: string,
    signaturePattern: string,
  ) {
    const grants =
      candidateSql.match(
        new RegExp(
          `grant\\s+(?:execute|all(?:\\s+privileges)?)\\s+on\\s+function\\s+public\\s*\\.\\s*${name}\\s*\\([^;]*?;`,
          "gi",
        ),
      ) ?? [];

    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(
      new RegExp(
        `public\\s*\\.\\s*${name}\\s*\\(\\s*${signaturePattern}\\s*\\)\\s+to\\s+service_role\\s*;`,
        "i",
      ),
    );
    for (const grant of grants) {
      const roles = grant.match(/\)\s+to\s+([^;]+);/i)?.[1] ?? "";
      expect(roles).not.toMatch(/\b(?:public|anon|authenticated)\b/i);
    }

    expect(candidateSql).toMatch(
      new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\s*\\.\\s*${name}\\s*\\(\\s*${signaturePattern}\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`,
        "i",
      ),
    );
  }

  function assertRedemptionAdmissionContract(candidateSql: string) {
    const body = functionBody(
      "admit_campaign_redemption_attempt",
      candidateSql,
    );
    const normalized = body.replace(/\s+/g, " ");

    expect(body).toMatch(
      /admit_campaign_redemption_attempt\(\s*p_user_id uuid,\s*p_signal_digest text,\s*p_signal_version text,\s*p_signal_purpose text,\s*p_signal_bucket bigint,\s*p_signal_expires_at timestamptz\s*\)/i,
    );
    expect(normalized).toContain(
      "if v_user_lock_key <= v_signal_lock_key then",
    );
    expect(normalized).toContain(
      "if v_user_lock_key <= v_signal_lock_key then v_first_lock_key := v_user_lock_key; v_second_lock_key := v_signal_lock_key; else v_first_lock_key := v_signal_lock_key; v_second_lock_key := v_user_lock_key; end if;",
    );
    expect(normalized).toContain(
      "perform pg_catalog.pg_advisory_xact_lock(v_first_lock_key);",
    );
    expect(normalized).toContain(
      "perform pg_catalog.pg_advisory_xact_lock(v_second_lock_key);",
    );
    expect(normalized.indexOf("v_first_lock_key);")).toBeLessThan(
      normalized.indexOf("v_second_lock_key);"),
    );
    expect(normalized).toContain("v_user_admitted_count < 5");
    expect(normalized).toContain("v_signal_admitted_count < 20");
    expect(body.match(/outcome\s*<>\s*'throttled'/gi)).toHaveLength(2);
    expect(normalized).toContain(
      "where a.user_id = p_user_id and a.signal_bucket = p_signal_bucket and a.outcome <> 'throttled'",
    );
    expect(normalized).toContain(
      "where a.signal_version = p_signal_version and a.signal_purpose = p_signal_purpose and a.signal_digest = p_signal_digest and a.signal_bucket = p_signal_bucket and a.outcome <> 'throttled'",
    );
    expect(body.match(/insert into public\.redemption_attempts/gi)).toHaveLength(
      1,
    );
    expect(normalized).toContain(
      "case when v_allowed then 'unavailable' else 'throttled' end",
    );
    expect(normalized).toContain("p_signal_version <> 'v1'");
    expect(normalized).toContain(
      "p_signal_digest !~ '^[0-9a-f]{64}$'",
    );
    expect(normalized).toContain(
      "p_signal_purpose !~ '^[a-z][a-z0-9-]{0,63}$'",
    );
    expect(normalized).toContain(
      "p_signal_bucket <> v_current_signal_bucket",
    );
    expect(normalized).toContain(
      "p_signal_expires_at is distinct from v_expected_expires_at",
    );

    assertServiceRoleOnlyFunction(
      candidateSql,
      "admit_campaign_redemption_attempt",
      "uuid\\s*,\\s*text\\s*,\\s*text\\s*,\\s*text\\s*,\\s*bigint\\s*,\\s*timestamptz",
    );
  }

  function assertRedemptionFinalizationContract(candidateSql: string) {
    const body = functionBody(
      "finish_campaign_redemption_attempt",
      candidateSql,
    );
    const normalized = body.replace(/\s+/g, " ");

    expect(body).toMatch(
      /finish_campaign_redemption_attempt\(\s*p_attempt_id uuid,\s*p_outcome text\s*\)\s*returns void/i,
    );
    expect(normalized).toContain(
      "p_outcome not in ('accepted', 'invalid', 'unavailable')",
    );
    expect(normalized).toContain("for update;");
    expect(normalized).toContain("v_attempt.outcome = 'throttled'");
    expect(normalized).toContain("v_attempt.finalized_at is not null");
    expect(normalized).toContain("finalized_at = v_now");

    assertServiceRoleOnlyFunction(
      candidateSql,
      "finish_campaign_redemption_attempt",
      "uuid\\s*,\\s*text",
    );
  }

  function assertAtomicRedemptionResult(candidateSql: string) {
    const body = functionBody("redeem_campaign_code", candidateSql);
    const normalized = body.replace(/\s+/g, " ");
    const retryStart = normalized.indexOf("if found then");
    const retryEnd = normalized.indexOf("return;", retryStart);
    const retryBranch = normalized.slice(retryStart, retryEnd);
    const firstResult = normalized.slice(
      normalized.lastIndexOf("return query"),
    );

    expect(normalized).toContain(
      "returns table ( code_id uuid, redeemed_at timestamptz, wallet_id uuid, wallet_user_id uuid, initial_balance integer, remaining_balance integer, reserved_balance integer, provider_committed_micro_usd bigint, provider_reserved_micro_usd bigint, wallet_created_at timestamptz, expires_at timestamptz, ledger_entry_id uuid, ledger_state text )",
    );
    expect(retryBranch).toContain(
      "select v_prior.promo_code_id, v_prior.created_at, v_prior.wallet_id, w.user_id, w.initial_balance, v_prior.balance_after, v_prior.reserved_after, v_prior.provider_committed_after_micro_usd, v_prior.provider_reserved_after_micro_usd, w.created_at, w.expires_at, v_prior.id, v_prior.state",
    );
    expect(retryBranch).not.toMatch(
      /\bw\.(?:remaining_balance|reserved_balance|provider_committed_micro_usd|provider_reserved_micro_usd)\b/i,
    );
    expect(firstResult).toContain(
      "select v_code.id, v_grant.created_at, v_wallet.id, v_wallet.user_id, v_wallet.initial_balance, v_wallet.remaining_balance, v_wallet.reserved_balance, v_wallet.provider_committed_micro_usd, v_wallet.provider_reserved_micro_usd, v_wallet.created_at, v_wallet.expires_at, v_grant.id, v_grant.state;",
    );
  }

  function assertPublicValidationAdmissionContract(candidateSql: string) {
    const table = tableDefinition(
      "public_validation_attempts",
      candidateSql,
    );
    const tableNormalized = table.replace(/\s+/g, " ");
    const body = functionBody(
      "admit_campaign_public_validation",
      candidateSql,
    );
    const normalized = body.replace(/\s+/g, " ");
    const tableGrants =
      candidateSql.match(
        /grant\s+[^;]+\s+on\s+table\s+[^;]*public_validation_attempts[^;]*;/gi,
      ) ?? [];

    expect(tableNormalized).toContain("signal_digest text not null");
    expect(tableNormalized).toContain(
      "signal_version text not null check (signal_version = 'v1')",
    );
    expect(tableNormalized).toContain(
      "signal_purpose text not null check (signal_purpose = 'validate-code')",
    );
    expect(tableNormalized).toContain("allowed boolean not null");
    expect(tableNormalized).toContain(
      "check ( expires_at = pg_catalog.to_timestamp( ((signal_bucket + 1) * 300)::double precision ) )",
    );
    expect(candidateSql).toMatch(
      /create index public_validation_attempts_admitted_signal_bucket_idx\s+on public\.public_validation_attempts\s*\(\s*signal_version,\s*signal_purpose,\s*signal_digest,\s*signal_bucket\s*\)\s+where allowed;/i,
    );
    expect(candidateSql).toMatch(
      /create index public_validation_attempts_expires_at_idx\s+on public\.public_validation_attempts\s*\(expires_at,\s*id\);/i,
    );
    expect(candidateSql).toMatch(
      /alter table public\.public_validation_attempts\s+enable row level security;/i,
    );
    expect(candidateSql).toMatch(
      /alter table public\.public_validation_attempts\s+force row level security;/i,
    );
    expect(candidateSql).toMatch(
      /create policy public_validation_attempts_admin_select\s+on public\.public_validation_attempts\s+for select\s+to authenticated\s+using \(\(select public\.is_campaign_admin\(\)\)\);/i,
    );
    expect(candidateSql).toMatch(
      /revoke all on table public\.public_validation_attempts\s+from anon,\s*authenticated;/i,
    );
    expect(tableGrants).toHaveLength(0);

    expect(body).toMatch(
      /admit_campaign_public_validation\(\s*p_signal_digest text,\s*p_signal_version text,\s*p_signal_purpose text,\s*p_signal_bucket bigint,\s*p_signal_expires_at timestamptz\s*\)\s*returns boolean/i,
    );
    expect(normalized).toContain("security definer");
    expect(normalized).toContain("set search_path = pg_catalog");
    expect(normalized).toContain("p_signal_version <> 'v1'");
    expect(normalized).toContain(
      "p_signal_digest !~ '^[0-9a-f]{64}$'",
    );
    expect(normalized).toContain(
      "p_signal_purpose <> 'validate-code'",
    );
    expect(normalized).toContain(
      "p_signal_bucket <> v_current_signal_bucket",
    );
    expect(normalized).toContain(
      "p_signal_expires_at is distinct from v_expected_expires_at",
    );
    expect(normalized).toContain(
      "perform pg_catalog.pg_advisory_xact_lock(v_signal_lock_key);",
    );
    expect(normalized).toContain("and a.allowed");
    expect(normalized).toContain("v_admitted_count < 30");
    expect(normalized).toContain(
      "with expired_attempts as ( select a.id from public.public_validation_attempts as a where a.expires_at <= v_now order by a.expires_at, a.id limit 500 for update skip locked ) delete from public.public_validation_attempts as a using expired_attempts as expired where a.id = expired.id;",
    );
    expect(
      body.match(/insert into public\.public_validation_attempts/gi),
    ).toHaveLength(1);
    expect(normalized).toContain(
      "values ( p_signal_digest, p_signal_version, p_signal_purpose, p_signal_bucket, v_allowed, v_now, p_signal_expires_at )",
    );

    assertServiceRoleOnlyFunction(
      candidateSql,
      "admit_campaign_public_validation",
      "text\\s*,\\s*text\\s*,\\s*text\\s*,\\s*bigint\\s*,\\s*timestamptz",
    );
  }

  it("creates every campaign table with RLS and at least one policy", () => {
    expect(existsSync(migrationPath)).toBe(true);

    for (const table of tables) {
      expect(sql).toMatch(
        new RegExp(`create table public\\.${table}\\b`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+enable row level security`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `create policy [\\s\\S]*?\\s+on public\\.${table}\\b`,
          "i",
        ),
      );
    }
  });

  it("uses hashes and integer ledgers without plaintext claim or raw-signal columns", () => {
    const promoCodes = sql.slice(
      sql.search(/create table public\.promo_codes\b/i),
      sql.search(
        /create table public\.wallets\b/i,
      ),
    );

    expect(promoCodes).toMatch(/\bcode_hash\s+text\b/i);
    expect(promoCodes).not.toMatch(
      /\b(?:code|plaintext_code|raw_code)\s+text\b/i,
    );
    expect(sql).toMatch(/\bprovider_cost_micro_usd\s+bigint\b/i);
    expect(sql).toMatch(/\bcredits_delta\s+integer\b/i);
    expect(sql).not.toMatch(
      /\b(?:raw_ip|ip_address|device_id|raw_signal|plaintext_code)\b/i,
    );
    expect(sql).not.toMatch(/\bprompt\s+(?:text|jsonb)\b/i);
    expect(sql).not.toContain("BOWL7K2A");
  });

  it("defines fixed-search-path SECURITY DEFINER RPCs with identity checks and row locks", () => {
    for (const name of rpcFunctions) {
      const body = functionBody(name);

      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = pg_catalog");
      if (name === "redeem_campaign_code") {
        expect(body).toContain("v_user_id uuid := p_user_id");
      } else {
        expect(body).toContain("auth.uid()");
      }
      expect(body).toMatch(/\bfor update\b/i);
      if (
        name === "commit_campaign_spend" ||
        name === "refund_campaign_spend"
      ) {
        expect(body).toMatch(
          /idempotency_key\s*=\s*p_idempotency_key/i,
        );
      }
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\b[\\s\\S]*? from public`,
          "i",
        ),
      );
      if (name !== "redeem_campaign_code") {
        expect(sql).toMatch(
          new RegExp(
            `grant execute on function public\\.${name}\\b[^;]*? to authenticated`,
            "i",
          ),
        );
      }
    }
  });

  it("keeps privileged redemption behind the service-role boundary", () => {
    const redeemBody = functionBody("redeem_campaign_code");

    expect(redeemBody).toMatch(
      /redeem_campaign_code\(\s*p_user_id uuid,\s*p_code_hash text,\s*p_idempotency_key text\s*\)/i,
    );
    expect(redeemBody).toContain("v_user_id uuid := p_user_id");
    expect(redeemBody).not.toContain("auth.uid()");
    expect(() => assertSecureRedeemBoundary(sql)).not.toThrow();
    expect(() =>
      assertSecureRedeemBoundary(
        `${sql}
          GRANT EXECUTE ON FUNCTION public.redeem_campaign_code(
            uuid, text, text
          ) TO authenticated;`,
      ),
    ).toThrow(/unsafe redemption grant/i);
    expect(() =>
      assertSecureRedeemBoundary(
        `${sql}
          CREATE OR REPLACE FUNCTION PUBLIC.REDEEM_CAMPAIGN_CODE(
            P_CODE_HASH TEXT,
            P_IDEMPOTENCY_KEY TEXT
          ) RETURNS void LANGUAGE sql AS 'SELECT';`,
      ),
    ).toThrow(/legacy redemption overload/i);
    expect(() =>
      assertSecureRedeemBoundary(
        `${sql}
          GRANT EXECUTE ON FUNCTION PUBLIC.REDEEM_CAMPAIGN_CODE(
            TEXT, TEXT
          ) TO SERVICE_ROLE;`,
      ),
    ).toThrow(/legacy redemption overload/i);
  });

  it("returns complete exact redemption snapshots from the atomic RPC", () => {
    assertAtomicRedemptionResult(sql);

    const liveBalanceRetry = sql.replace(
      "v_prior.balance_after,",
      "w.remaining_balance,",
    );
    expect(liveBalanceRetry).not.toBe(sql);
    expect(() => assertAtomicRedemptionResult(liveBalanceRetry)).toThrow();
  });

  it("atomically admits bounded redemption attempts through trusted server RPCs", () => {
    assertRedemptionAdmissionContract(sql);
    assertRedemptionFinalizationContract(sql);
  });

  it("detects unsafe admission grant, locking, count, and outcome mutations", () => {
    const unsafeGrant = `${sql}
grant execute on function public.admit_campaign_redemption_attempt(
  uuid, text, text, text, bigint, timestamptz
) to authenticated;
`;
    expect(() => assertRedemptionAdmissionContract(unsafeGrant)).toThrow();

    const missingSignalLock = sql.replace(
      "perform pg_catalog.pg_advisory_xact_lock(v_second_lock_key);",
      "perform pg_catalog.pg_advisory_xact_lock(v_first_lock_key);",
    );
    expect(missingSignalLock).not.toBe(sql);
    expect(() =>
      assertRedemptionAdmissionContract(missingSignalLock),
    ).toThrow();

    const expandedUserLimit = sql.replace(
      "v_user_admitted_count < 5",
      "v_user_admitted_count < 6",
    );
    expect(expandedUserLimit).not.toBe(sql);
    expect(() =>
      assertRedemptionAdmissionContract(expandedUserLimit),
    ).toThrow();

    const expandedSignalLimit = sql.replace(
      "v_signal_admitted_count < 20",
      "v_signal_admitted_count < 21",
    );
    expect(expandedSignalLimit).not.toBe(sql);
    expect(() =>
      assertRedemptionAdmissionContract(expandedSignalLimit),
    ).toThrow();

    const admittedAsAccepted = sql.replace(
      "case when v_allowed then 'unavailable' else 'throttled' end",
      "case when v_allowed then 'accepted' else 'throttled' end",
    );
    expect(admittedAsAccepted).not.toBe(sql);
    expect(() =>
      assertRedemptionAdmissionContract(admittedAsAccepted),
    ).toThrow();

    const throttledFinalization = sql.replace(
      "p_outcome not in ('accepted', 'invalid', 'unavailable')",
      "p_outcome not in ('accepted', 'invalid', 'unavailable', 'throttled')",
    );
    expect(throttledFinalization).not.toBe(sql);
    expect(() =>
      assertRedemptionFinalizationContract(throttledFinalization),
    ).toThrow();
  });

  it("shares public validation admission through one bounded database gate", () => {
    assertPublicValidationAdmissionContract(sql);
  });

  it("detects unsafe public-validation grant, lock, limit, and retention mutations", () => {
    const unsafeGrant = `${sql}
grant execute on function public.admit_campaign_public_validation(
  text, text, text, bigint, timestamptz
) to anon;
`;
    expect(() =>
      assertPublicValidationAdmissionContract(unsafeGrant),
    ).toThrow();

    const missingLock = sql.replace(
      "perform pg_catalog.pg_advisory_xact_lock(v_signal_lock_key);",
      "perform true;",
    );
    expect(missingLock).not.toBe(sql);
    expect(() =>
      assertPublicValidationAdmissionContract(missingLock),
    ).toThrow();

    const expandedLimit = sql.replace(
      "v_admitted_count < 30",
      "v_admitted_count < 31",
    );
    expect(expandedLimit).not.toBe(sql);
    expect(() =>
      assertPublicValidationAdmissionContract(expandedLimit),
    ).toThrow();

    const generalizedPurpose = sql.replace(
      "p_signal_purpose <> 'validate-code'",
      "p_signal_purpose !~ '^[a-z][a-z0-9-]{0,63}$'",
    );
    expect(generalizedPurpose).not.toBe(sql);
    expect(() =>
      assertPublicValidationAdmissionContract(generalizedPurpose),
    ).toThrow();

    const deniedNotRecorded = sql.replace(
      "p_signal_bucket,\n    v_allowed,",
      "p_signal_bucket,\n    true,",
    );
    expect(deniedNotRecorded).not.toBe(sql);
    expect(() =>
      assertPublicValidationAdmissionContract(deniedNotRecorded),
    ).toThrow();

    const missingRetention = sql.replace(
      "where a.expires_at <= v_now\n    order by a.expires_at, a.id",
      "where false\n    order by a.expires_at, a.id",
    );
    expect(missingRetention).not.toBe(sql);
    expect(() =>
      assertPublicValidationAdmissionContract(missingRetention),
    ).toThrow();

    const unboundedRetention = sql.replace(
      "limit 500\n    for update skip locked",
      "for update skip locked",
    );
    expect(unboundedRetention).not.toBe(sql);
    expect(() =>
      assertPublicValidationAdmissionContract(unboundedRetention),
    ).toThrow();

    const unboundedRetentionIndex = sql.replace(
      "(expires_at, id);",
      "(expires_at);",
    );
    expect(unboundedRetentionIndex).not.toBe(sql);
    expect(() =>
      assertPublicValidationAdmissionContract(unboundedRetentionIndex),
    ).toThrow();
  });

  it("adds admin separation, idempotency indexes, and updated-at triggers", () => {
    expect(functionBody("is_campaign_admin")).toContain(
      "set search_path = pg_catalog",
    );
    expect(sql).toMatch(
      /create unique index ledger_entries_user_kind_idempotency_idx/i,
    );
    expect(sql).toMatch(
      /create unique index ledger_entries_terminal_reservation_idx[\s\S]*?where/i,
    );
    expect(sql).toMatch(
      /create unique index promo_codes_code_hash_idx/i,
    );
    expect(sql).toMatch(
      /create trigger [\s\S]*?execute function public\.set_updated_at\(\)/i,
    );
    expect(sql).toMatch(
      /create policy promo_batches_admin_select[\s\S]*?for select[\s\S]*?public\.is_campaign_admin\(\)/i,
    );
    expect(functionBody("is_safe_campaign_event_payload")).toMatch(
      /\(code\|claim\|promo\|prompt\|input\|ip\|device\|email\|secret\|token\|address\)/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(?:all|insert|update|delete)[\s\S]*?\bto\s+anon\b/i,
    );
  });

  it("preserves first snapshots, checks redemption keys before code lookup, and constrains events", () => {
    const reserveBody = functionBody("reserve_campaign_spend");
    const redeemBody = functionBody("redeem_campaign_code");
    const eventValidator = functionBody(
      "is_safe_campaign_event_payload",
    );
    const priorLookup = redeemBody.indexOf(
      "and l.idempotency_key = p_idempotency_key",
    );
    const submittedCodeLookup = redeemBody.indexOf(
      "where c.code_hash = p_code_hash",
    );

    expect(reserveBody.match(/'reserved'::text/g)?.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(priorLookup).toBeGreaterThanOrEqual(0);
    expect(submittedCodeLookup).toBeGreaterThan(priorLookup);
    expect(redeemBody).toContain("v_prior_code_hash");
    expect(eventValidator).toContain("set search_path = pg_catalog");
    expect(eventValidator).toContain("jsonb_each");
    expect(eventValidator).toContain("taskType");
    expect(eventValidator).toContain("latencyBucket");
    expect(sql).toMatch(
      /check\s*\(\s*public\.is_safe_campaign_event_payload\(name,\s*source,\s*metadata\)\s*\)/i,
    );
  });
});
