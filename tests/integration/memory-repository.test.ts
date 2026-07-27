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
    "partner_connections",
    "provider_policies",
  ] as const;
  const rpcFunctions = [
    "redeem_campaign_code",
    "reserve_campaign_spend",
    "commit_campaign_spend",
    "refund_campaign_spend",
  ] as const;

  function functionBody(name: string) {
    const start = sql.indexOf(
      `create or replace function public.${name}`,
    );
    const end = sql.indexOf("$$;", start);
    return start === -1 || end === -1
      ? ""
      : sql.slice(start, end + 3);
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
      expect(body).toContain("auth.uid()");
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
      expect(sql).toMatch(
        new RegExp(
          `grant execute on function public\\.${name}\\b[\\s\\S]*? to authenticated`,
          "i",
        ),
      );
    }
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
      /create policy promo_batches_admin_all[\s\S]*?public\.is_campaign_admin\(\)/i,
    );
    expect(sql).toMatch(
      /metadata\s+\?\|\s+array\[[\s\S]*?'prompt'[\s\S]*?'device'/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(?:all|insert|update|delete)[\s\S]*?\bto\s+anon\b/i,
    );
  });
});
