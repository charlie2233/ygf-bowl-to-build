// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const adminId = "11111111-1111-4111-8111-111111111111";
const multiGrantOwnerId = "22222222-2222-4222-8222-222222222222";
const otherOwnerId = "33333333-3333-4333-8333-333333333333";
const sourceGuestId = "44444444-4444-4444-8444-444444444444";
const targetOwnerId = "55555555-5555-4555-8555-555555555555";
const otherTargetId = "66666666-6666-4666-8666-666666666666";
const expiredSourceId = "77777777-7777-4777-8777-777777777777";
const snapshotOwnerId = "88888888-8888-4888-8888-888888888888";

const firstCodeHash = "a".repeat(64);
const secondCodeHash = "b".repeat(64);
const unusedCodeHash = "c".repeat(64);
const sourceCodeHash = "d".repeat(64);
const targetCodeHash = "e".repeat(64);
const retiredSourceCodeHash = "f".repeat(64);
const expiredSourceCodeHash = "1".repeat(64);
const postMergeCodeHash = "8".repeat(64);
const mergeTokenDigest = "2".repeat(64);
const forgedTokenDigest = "3".repeat(64);
const expiredTokenDigest = "4".repeat(64);
const sourceKeyHash = "M".repeat(43);
const sourceSessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const expiredSessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const bootstrapSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create schema extensions;

  create table auth.users (
    id uuid primary key
  );

  create table auth.sessions (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(
      pg_catalog.current_setting('request.jwt.claim.sub', true),
      ''
    )::uuid;
  $$;

  create or replace function auth.jwt()
  returns jsonb
  language sql
  stable
  as $$
    select coalesce(
      nullif(
        pg_catalog.current_setting('request.jwt.claims', true),
        ''
      )::jsonb,
      '{}'::jsonb
    );
  $$;
`;

interface RedemptionRow {
  expires_at: string;
  initial_balance: number;
  ledger_entry_id: string;
  remaining_balance: number;
  wallet_id: string;
  wallet_user_id: string;
}

interface MergeRow {
  credits_transferred: number;
  expires_at: string;
  remaining_balance: number;
}

async function onlyRow<T>(
  database: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const result = await database.query<T>(sql, params);
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!;
}

async function asServiceRole<T>(
  database: PGlite,
  operation: () => Promise<T>,
): Promise<T> {
  await database.exec("set role service_role;");
  try {
    return await operation();
  } finally {
    await database.exec("reset role;");
  }
}

async function createMigratedDatabase() {
  const database = new PGlite({ extensions: { pgcrypto } });
  try {
    await database.exec(bootstrapSql);
    const migrationDirectory = path.join(
      process.cwd(),
      "supabase/migrations",
    );
    const migrationNames = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const migrationName of migrationNames) {
      await database.exec(
        await readFile(
          path.join(migrationDirectory, migrationName),
          "utf8",
        ),
      );
    }
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

async function seedUsers(database: PGlite, userIds: string[]) {
  const values = userIds
    .map((_, index) => `($${index + 1}::uuid)`)
    .join(", ");
  await database.query(
    `insert into auth.users (id) values ${values};`,
    userIds,
  );
}

async function seedSession(
  database: PGlite,
  userId: string,
  sessionId: string,
) {
  await database.query(
    `insert into auth.sessions (id, user_id) values ($1::uuid, $2::uuid);`,
    [sessionId, userId],
  );
}

async function seedCodes(
  database: PGlite,
  codes: ReadonlyArray<{
    codeHash: string;
    rowReference: string;
  }>,
) {
  const batch = await onlyRow<{ id: string }>(
    database,
    `
      insert into public.promo_batches (
        name,
        source,
        code_count,
        status,
        created_by,
        activated_at
      )
      values (
        'multi-grant account merge tests',
        'soft-test',
        $1::integer,
        'active',
        $2::uuid,
        pg_catalog.now()
      )
      returning id;
    `,
    [codes.length, adminId],
  );

  for (const code of codes) {
    await database.query(
      `
        insert into public.promo_codes (
          batch_id,
          row_reference,
          code_hash,
          state
        )
        values ($1::uuid, $2::text, $3::text, 'eligible');
      `,
      [batch.id, code.rowReference, code.codeHash],
    );
  }
}

async function redeem(
  database: PGlite,
  userId: string,
  codeHash: string,
  idempotencyKey: string,
) {
  return asServiceRole(database, () =>
    onlyRow<RedemptionRow>(
      database,
      `
        select *
        from public.redeem_campaign_code(
          $1::uuid,
          $2::text,
          $3::text
        );
      `,
      [userId, codeHash, idempotencyKey],
    ),
  );
}

async function consumeMerge(
  database: PGlite,
  {
    provider = "google",
    sessionId = sourceSessionId,
    targetUserId = targetOwnerId,
    tokenDigest = mergeTokenDigest,
  }: {
    provider?: string;
    sessionId?: string;
    targetUserId?: string;
    tokenDigest?: string;
  } = {},
) {
  return asServiceRole(database, () =>
    onlyRow<MergeRow>(
      database,
      `
        select *
        from public.consume_account_merge_intent(
          $1::text,
          $2::text,
          $3::uuid,
          $4::text
        );
      `,
      [tokenDigest, sessionId, targetUserId, provider],
    ),
  );
}

describe("multi-grant account merge migration", () => {
  it(
    "adds distinct card grants once while preserving same-code replay and owner isolation",
    async () => {
      const database = await createMigratedDatabase();
      try {
        await seedUsers(database, [
          adminId,
          multiGrantOwnerId,
          otherOwnerId,
        ]);
        await seedCodes(database, [
          {
            codeHash: firstCodeHash,
            rowReference: "YGF-23456789-0001",
          },
          {
            codeHash: secondCodeHash,
            rowReference: "YGF-2345678A-0002",
          },
          {
            codeHash: unusedCodeHash,
            rowReference: "YGF-2345678B-0003",
          },
        ]);

        const first = await redeem(
          database,
          multiGrantOwnerId,
          firstCodeHash,
          "first-card",
        );
        const second = await redeem(
          database,
          multiGrantOwnerId,
          secondCodeHash,
          "second-card",
        );
        const sameIdempotencyReplay = await redeem(
          database,
          multiGrantOwnerId,
          secondCodeHash,
          "second-card",
        );
        const freshIdempotencyReplay = await redeem(
          database,
          multiGrantOwnerId,
          secondCodeHash,
          "second-card-retry",
        );

        expect(first).toMatchObject({
          initial_balance: 3_000,
          remaining_balance: 3_000,
          wallet_user_id: multiGrantOwnerId,
        });
        expect(second).toMatchObject({
          initial_balance: 6_000,
          remaining_balance: 6_000,
          wallet_id: first.wallet_id,
          wallet_user_id: multiGrantOwnerId,
        });
        expect(sameIdempotencyReplay).toMatchObject({
          expires_at: second.expires_at,
          initial_balance: 6_000,
          ledger_entry_id: second.ledger_entry_id,
          remaining_balance: 6_000,
          wallet_id: first.wallet_id,
        });
        expect(freshIdempotencyReplay).toEqual(
          sameIdempotencyReplay,
        );

        const accounting = await onlyRow<{
          grant_count: number;
          granted_credits: number;
          wallet_count: number;
        }>(
          database,
          `
            select
              (
                select count(*)::integer
                from public.wallets
                where user_id = $1::uuid
              ) as wallet_count,
              (
                select count(*)::integer
                from public.ledger_entries
                where user_id = $1::uuid
                  and entry_kind = 'grant'
              ) as grant_count,
              (
                select sum(credits_delta)::integer
                from public.ledger_entries
                where user_id = $1::uuid
                  and entry_kind = 'grant'
              ) as granted_credits;
          `,
          [multiGrantOwnerId],
        );
        expect(accounting).toEqual({
          grant_count: 2,
          granted_credits: 6_000,
          wallet_count: 1,
        });

        await expect(
          redeem(
            database,
            otherOwnerId,
            secondCodeHash,
            "other-owner",
          ),
        ).rejects.toThrow("CODE_ALREADY_REDEEMED");
        await expect(
          redeem(
            database,
            multiGrantOwnerId,
            unusedCodeHash,
            "second-card",
          ),
        ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
      } finally {
        await database.close();
      }
    },
    60_000,
  );

  it(
    "merges a guest into an existing wallet once and rejects replay abuse or retired-source reuse",
    async () => {
      const database = await createMigratedDatabase();
      try {
        await seedUsers(database, [
          adminId,
          sourceGuestId,
          targetOwnerId,
          otherTargetId,
          expiredSourceId,
        ]);
        await seedSession(database, sourceGuestId, sourceSessionId);
        await seedSession(database, expiredSourceId, expiredSessionId);
        await seedCodes(database, [
          {
            codeHash: sourceCodeHash,
            rowReference: "YGF-2345678C-0004",
          },
          {
            codeHash: targetCodeHash,
            rowReference: "YGF-2345678D-0005",
          },
          {
            codeHash: retiredSourceCodeHash,
            rowReference: "YGF-2345678E-0006",
          },
          {
            codeHash: expiredSourceCodeHash,
            rowReference: "YGF-2345678F-0007",
          },
          {
            codeHash: postMergeCodeHash,
            rowReference: "YGF-2345678G-0008",
          },
        ]);

        const sourceRedemption = await redeem(
          database,
          sourceGuestId,
          sourceCodeHash,
          "source-card",
        );
        const targetRedemption = await redeem(
          database,
          targetOwnerId,
          targetCodeHash,
          "target-card",
        );
        await redeem(
          database,
          expiredSourceId,
          expiredSourceCodeHash,
          "expired-source-card",
        );

        await database.query(
          `
            update public.wallets
            set provider_committed_micro_usd = case user_id
              when $1::uuid then 2000000
              when $2::uuid then 2000000
              else provider_committed_micro_usd
            end
            where user_id in ($1::uuid, $2::uuid);
          `,
          [sourceGuestId, targetOwnerId],
        );

        const sourceKey = await asServiceRole(database, () =>
          onlyRow<{ key_id: string }>(
            database,
            `
              select key_id
              from public.create_agent_api_key(
                $1::uuid,
                $2::text,
                1::smallint,
                'ygf_MERG'::text,
                'MERG'::text,
                pg_catalog.now() + interval '1 day',
                12,
                2
              );
            `,
            [sourceGuestId, sourceKeyHash],
          ),
        );

        await asServiceRole(database, () =>
          database.query(
            `
              select public.create_account_merge_intent(
                $1::uuid,
                $2::text,
                'google'::text,
                $3::text
              );
            `,
            [sourceGuestId, sourceSessionId, mergeTokenDigest],
          ),
        );

        await database.query(
          `delete from auth.sessions where id = $1::uuid;`,
          [sourceSessionId],
        );
        await expect(
          asServiceRole(database, () =>
            database.query(
              `
                select public.create_account_merge_intent(
                  $1::uuid,
                  $2::text,
                  'google'::text,
                  $3::text
                );
              `,
              [sourceGuestId, sourceSessionId, forgedTokenDigest],
            ),
          ),
        ).rejects.toThrow("ACCOUNT_MERGE_SESSION_INVALID");
        await expect(consumeMerge(database)).rejects.toThrow(
          "ACCOUNT_MERGE_SESSION_INVALID",
        );
        await seedSession(database, sourceGuestId, sourceSessionId);

        await expect(
          consumeMerge(database, { tokenDigest: forgedTokenDigest }),
        ).rejects.toThrow("ACCOUNT_MERGE_INVALID");
        await expect(
          consumeMerge(database, { sessionId: "wrong_session" }),
        ).rejects.toThrow("ACCOUNT_MERGE_INVALID");
        await expect(
          consumeMerge(database, { provider: "apple" }),
        ).rejects.toThrow("ACCOUNT_MERGE_INVALID");

        await expect(consumeMerge(database)).rejects.toThrow(
          "PROVIDER_COST_LIMIT_EXCEEDED",
        );
        const rejectedMergeState = await onlyRow<{
          intent_consumed: boolean;
          outbox_count: number;
          tombstone_count: number;
          wallet_count: number;
        }>(
          database,
          `
            select
              (
                select consumed_at is not null
                from public.account_merge_intents
                where token_digest = $1::text
              ) as intent_consumed,
              (
                select count(*)::integer
                from public.wallets
                where user_id in ($2::uuid, $3::uuid)
              ) as wallet_count,
              (
                select count(*)::integer
                from public.merged_account_tombstones
                where source_user_id = $2::uuid
              ) as tombstone_count,
              (
                select count(*)::integer
                from public.auth_cleanup_outbox
                where source_user_id = $2::uuid
              ) as outbox_count;
          `,
          [mergeTokenDigest, sourceGuestId, targetOwnerId],
        );
        expect(rejectedMergeState).toEqual({
          intent_consumed: false,
          outbox_count: 0,
          tombstone_count: 0,
          wallet_count: 2,
        });
        await database.query(
          `
            update public.wallets
            set provider_committed_micro_usd = 1000000
            where user_id = $1::uuid;
          `,
          [sourceGuestId],
        );

        const merged = await consumeMerge(database);
        expect(merged).toMatchObject({
          credits_transferred: 3_000,
          remaining_balance: 6_000,
        });
        expect(new Date(merged.expires_at).toISOString()).toBe(
          new Date(
            [sourceRedemption.expires_at, targetRedemption.expires_at]
              .sort()
              .at(-1)!,
          ).toISOString(),
        );

        const mergedWallet = await onlyRow<{
          id: string;
          initial_balance: number;
          provider_committed_micro_usd: number;
          remaining_balance: number;
          user_id: string;
        }>(
          database,
          `
            select
              id,
              user_id,
              initial_balance,
              remaining_balance,
              provider_committed_micro_usd
            from public.wallets
            where user_id = $1::uuid;
          `,
          [targetOwnerId],
        );
        expect(mergedWallet).toEqual({
          id: targetRedemption.wallet_id,
          initial_balance: 6_000,
          provider_committed_micro_usd: 3_000_000,
          remaining_balance: 6_000,
          user_id: targetOwnerId,
        });

        const transferredState = await onlyRow<{
          grant_count: number;
          source_wallet_count: number;
        }>(
          database,
          `
            select
              (
                select count(*)::integer
                from public.wallets
                where user_id = $1::uuid
              ) as source_wallet_count,
              (
                select count(*)::integer
                from public.ledger_entries
                where user_id = $2::uuid
                  and wallet_id = $3::uuid
                  and entry_kind = 'grant'
              ) as grant_count;
          `,
          [sourceGuestId, targetOwnerId, mergedWallet.id],
        );
        expect(transferredState).toEqual({
          grant_count: 2,
          source_wallet_count: 0,
        });

        const revokedKey = await onlyRow<{
          revoked: boolean;
          user_id: string;
          wallet_id: string;
        }>(
          database,
          `
            select
              user_id,
              wallet_id,
              revoked_at is not null as revoked
            from public.agent_api_keys
            where id = $1::uuid;
          `,
          [sourceKey.key_id],
        );
        expect(revokedKey).toEqual({
          revoked: true,
          user_id: targetOwnerId,
          wallet_id: mergedWallet.id,
        });

        const targetKeyHash = "T".repeat(43);
        await asServiceRole(database, () =>
          onlyRow<{ key_id: string }>(
            database,
            `
              select key_id
              from public.create_agent_api_key(
                $1::uuid,
                $2::text,
                1::smallint,
                'ygf_BUDG'::text,
                'BUDG'::text,
                pg_catalog.now() + interval '1 day',
                12,
                2
              );
            `,
            [targetOwnerId, targetKeyHash],
          ),
        );
        await expect(
          asServiceRole(database, () =>
            database.query(
              `
                select *
                from public.begin_agent_request(
                  $1::text,
                  $2::text,
                  $3::text,
                  'gpt-5.6-terra'::text,
                  1::bigint,
                  1::integer,
                  $4::uuid,
                  pg_catalog.clock_timestamp() + interval '30 seconds'
                );
              `,
              [
                targetKeyHash,
                `idem_${"7".repeat(64)}`,
                "6".repeat(64),
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              ],
            ),
          ),
        ).rejects.toThrow("PROVIDER_COST_LIMIT_EXCEEDED");

        const toppedUp = await redeem(
          database,
          targetOwnerId,
          postMergeCodeHash,
          "post-merge-card",
        );
        expect(toppedUp).toMatchObject({
          initial_balance: 9_000,
          remaining_balance: 9_000,
          wallet_id: mergedWallet.id,
        });
        const preservedSpend = await onlyRow<{
          provider_committed_micro_usd: number;
        }>(
          database,
          `
            select provider_committed_micro_usd
            from public.wallets
            where id = $1::uuid;
          `,
          [mergedWallet.id],
        );
        expect(preservedSpend.provider_committed_micro_usd).toBe(
          3_000_000,
        );

        const replay = await consumeMerge(database);
        expect(replay).toEqual(merged);
        await expect(
          consumeMerge(database, { targetUserId: otherTargetId }),
        ).rejects.toThrow("ACCOUNT_MERGE_INVALID");

        const mergeMarkers = await onlyRow<{
          outbox_count: number;
          tombstone_count: number;
        }>(
          database,
          `
            select
              (
                select count(*)::integer
                from public.merged_account_tombstones
                where source_user_id = $1::uuid
                  and target_user_id = $2::uuid
              ) as tombstone_count,
              (
                select count(*)::integer
                from public.auth_cleanup_outbox
                where source_user_id = $1::uuid
                  and target_user_id = $2::uuid
              ) as outbox_count;
          `,
          [sourceGuestId, targetOwnerId],
        );
        expect(mergeMarkers).toEqual({
          outbox_count: 1,
          tombstone_count: 1,
        });

        await expect(
          database.query(
            `
              insert into public.wallets (
                user_id,
                initial_balance,
                remaining_balance,
                reserved_balance,
                provider_committed_micro_usd,
                provider_reserved_micro_usd,
                created_at,
                expires_at
              )
              values (
                $1::uuid,
                3000,
                3000,
                0,
                0,
                0,
                pg_catalog.now(),
                pg_catalog.now() + interval '14 days'
              );
            `,
            [sourceGuestId],
          ),
        ).rejects.toThrow("MERGED_ACCOUNT_RETIRED");
        await expect(
          redeem(
            database,
            sourceGuestId,
            retiredSourceCodeHash,
            "retired-source-card",
          ),
        ).rejects.toThrow("MERGED_ACCOUNT_RETIRED");

        await asServiceRole(database, () =>
          database.query(
            `
              select public.create_account_merge_intent(
                $1::uuid,
                $2::text,
                'apple'::text,
                $3::text
              );
            `,
            [expiredSourceId, expiredSessionId, expiredTokenDigest],
          ),
        );
        await database.query(
          `
            update public.account_merge_intents
            set
              created_at = pg_catalog.clock_timestamp()
                - interval '20 minutes',
              expires_at = pg_catalog.clock_timestamp()
                - interval '10 minutes'
            where token_digest = $1::text;
          `,
          [expiredTokenDigest],
        );
        await expect(
          consumeMerge(database, {
            provider: "apple",
            sessionId: expiredSessionId,
            targetUserId: otherTargetId,
            tokenDigest: expiredTokenDigest,
          }),
        ).rejects.toThrow("ACCOUNT_MERGE_EXPIRED");

        const expiredSourceWallet = await onlyRow<{ count: number }>(
          database,
          `
            select count(*)::integer as count
            from public.wallets
            where user_id = $1::uuid;
          `,
          [expiredSourceId],
        );
        expect(expiredSourceWallet.count).toBe(1);
        expect(sourceRedemption.wallet_id).not.toBe(
          targetRedemption.wallet_id,
        );
      } finally {
        await database.close();
      }
    },
    60_000,
  );

  it.each(["source", "target"] as const)(
    "does not resurrect an expired %s wallet while combining accounts",
    async (expiredSide) => {
      const database = await createMigratedDatabase();
      try {
        await seedUsers(database, [
          adminId,
          sourceGuestId,
          targetOwnerId,
        ]);
        await seedSession(database, sourceGuestId, sourceSessionId);
        await seedCodes(database, [
          {
            codeHash: sourceCodeHash,
            rowReference: "YGF-2345678C-0004",
          },
          {
            codeHash: targetCodeHash,
            rowReference: "YGF-2345678D-0005",
          },
        ]);

        const source = await redeem(
          database,
          sourceGuestId,
          sourceCodeHash,
          "source-expiry-card",
        );
        const target = await redeem(
          database,
          targetOwnerId,
          targetCodeHash,
          "target-expiry-card",
        );
        const expiredUserId =
          expiredSide === "source" ? sourceGuestId : targetOwnerId;
        const activeExpiry =
          expiredSide === "source" ? target.expires_at : source.expires_at;
        await database.query(
          `
            update public.wallets
            set
              created_at = pg_catalog.clock_timestamp()
                - interval '30 days',
              expires_at = pg_catalog.clock_timestamp()
                - interval '1 day'
            where user_id = $1::uuid;
          `,
          [expiredUserId],
        );

        await asServiceRole(database, () =>
          database.query(
            `
              select public.create_account_merge_intent(
                $1::uuid,
                $2::text,
                'google'::text,
                $3::text
              );
            `,
            [sourceGuestId, sourceSessionId, mergeTokenDigest],
          ),
        );
        const merged = await consumeMerge(database);

        expect(merged).toMatchObject({
          credits_transferred: expiredSide === "source" ? 0 : 3_000,
          remaining_balance: 3_000,
        });
        expect(new Date(merged.expires_at).toISOString()).toBe(
          new Date(activeExpiry).toISOString(),
        );
        const wallet = await onlyRow<{
          initial_balance: number;
          remaining_balance: number;
        }>(
          database,
          `
            select initial_balance, remaining_balance
            from public.wallets
            where user_id = $1::uuid;
          `,
          [targetOwnerId],
        );
        expect(wallet).toEqual({
          initial_balance: 6_000,
          remaining_balance: 3_000,
        });
        const expiryEntry = await onlyRow<{
          credits_delta: number;
          entry_kind: string;
        }>(
          database,
          `
            select entry_kind, credits_delta
            from public.ledger_entries
            where user_id = $1::uuid
              and entry_kind = 'expire';
          `,
          [targetOwnerId],
        );
        expect(expiryEntry).toEqual({
          credits_delta: -3_000,
          entry_kind: "expire",
        });
      } finally {
        await database.close();
      }
    },
    60_000,
  );

  it(
    "uses one active Auth-cleanup lease at a time and safely reclaims an expired lease",
    async () => {
      const database = await createMigratedDatabase();
      const cleanupSourceId = "91919191-9191-4191-8191-919191919191";
      const cleanupTargetId = "92929292-9292-4292-8292-929292929292";
      const cleanupIntentId = "93939393-9393-4393-8393-939393939393";
      const firstWorker = "94949494-9494-4494-8494-949494949494";
      const secondWorker = "95959595-9595-4595-8595-959595959595";
      try {
        await database.query(
          `
            insert into public.auth_cleanup_outbox (
              source_user_id,
              target_user_id,
              intent_id,
              created_at
            ) values (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              pg_catalog.clock_timestamp() - interval '1 hour'
            );
          `,
          [cleanupSourceId, cleanupTargetId, cleanupIntentId],
        );

        const firstClaim = await database.query<{
          source_user_id: string;
        }>(
          `select * from public.claim_auth_cleanup_outbox($1::uuid, 25);`,
          [firstWorker],
        );
        expect(firstClaim.rows).toEqual([
          { source_user_id: cleanupSourceId },
        ]);

        const overlappingClaim = await database.query<{
          source_user_id: string;
        }>(
          `select * from public.claim_auth_cleanup_outbox($1::uuid, 25);`,
          [secondWorker],
        );
        expect(overlappingClaim.rows).toEqual([]);

        const wrongCompletion = await onlyRow<{ completed: boolean }>(
          database,
          `
            select public.complete_auth_cleanup_outbox(
              $1::uuid,
              $2::uuid
            ) as completed;
          `,
          [cleanupSourceId, secondWorker],
        );
        expect(wrongCompletion.completed).toBe(false);

        await database.query(
          `
            update public.auth_cleanup_outbox
            set lease_expires_at = pg_catalog.clock_timestamp()
              - interval '1 minute'
            where source_user_id = $1::uuid;
          `,
          [cleanupSourceId],
        );
        const reclaimed = await database.query<{
          source_user_id: string;
        }>(
          `select * from public.claim_auth_cleanup_outbox($1::uuid, 25);`,
          [secondWorker],
        );
        expect(reclaimed.rows).toEqual([
          { source_user_id: cleanupSourceId },
        ]);

        const staleCompletion = await onlyRow<{ completed: boolean }>(
          database,
          `
            select public.complete_auth_cleanup_outbox(
              $1::uuid,
              $2::uuid
            ) as completed;
          `,
          [cleanupSourceId, firstWorker],
        );
        expect(staleCompletion.completed).toBe(false);
        const completion = await onlyRow<{ completed: boolean }>(
          database,
          `
            select public.complete_auth_cleanup_outbox(
              $1::uuid,
              $2::uuid
            ) as completed;
          `,
          [cleanupSourceId, secondWorker],
        );
        expect(completion.completed).toBe(true);
        await expect(
          onlyRow<{ state: string }>(
            database,
            `
              select state
              from public.auth_cleanup_outbox
              where source_user_id = $1::uuid
                and lease_token is null
                and lease_expires_at is null
                and completed_at is not null;
            `,
            [cleanupSourceId],
          ),
        ).resolves.toEqual({ state: "completed" });
      } finally {
        await database.close();
      }
    },
    60_000,
  );

  it(
    "forces RLS on merge state and grants the changed RPCs only to the service role",
    async () => {
      const database = await createMigratedDatabase();
      try {
        const relationSecurity = await database.query<{
          relforcerowsecurity: boolean;
          relname: string;
          relrowsecurity: boolean;
        }>(`
          select relname, relrowsecurity, relforcerowsecurity
          from pg_catalog.pg_class
          where oid in (
            'public.account_merge_intents'::regclass,
            'public.merged_account_tombstones'::regclass,
            'public.auth_cleanup_outbox'::regclass
          )
          order by relname;
        `);
        expect(relationSecurity.rows).toEqual([
          {
            relforcerowsecurity: true,
            relname: "account_merge_intents",
            relrowsecurity: true,
          },
          {
            relforcerowsecurity: true,
            relname: "auth_cleanup_outbox",
            relrowsecurity: true,
          },
          {
            relforcerowsecurity: true,
            relname: "merged_account_tombstones",
            relrowsecurity: true,
          },
        ]);

        const tablePrivileges = await database.query<{
          anon_dml: boolean;
          authenticated_dml: boolean;
          relname: string;
          service_dml: boolean;
        }>(`
          select
            c.relname,
            pg_catalog.has_table_privilege(
              'anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE'
            ) as anon_dml,
            pg_catalog.has_table_privilege(
              'authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'
            ) as authenticated_dml,
            pg_catalog.has_table_privilege(
              'service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE'
            ) as service_dml
          from pg_catalog.pg_class as c
          where c.oid in (
            'public.account_merge_intents'::regclass,
            'public.merged_account_tombstones'::regclass,
            'public.auth_cleanup_outbox'::regclass
          )
          order by c.relname;
        `);
        expect(tablePrivileges.rows).toEqual([
          {
            anon_dml: false,
            authenticated_dml: false,
            relname: "account_merge_intents",
            service_dml: true,
          },
          {
            anon_dml: false,
            authenticated_dml: false,
            relname: "auth_cleanup_outbox",
            service_dml: true,
          },
          {
            anon_dml: false,
            authenticated_dml: false,
            relname: "merged_account_tombstones",
            service_dml: true,
          },
        ]);

        const cleanupIndexes = await database.query<{
          indexdef: string;
          indexname: string;
        }>(`
          select indexname, indexdef
          from pg_catalog.pg_indexes
          where schemaname = 'public'
            and indexname in (
              'auth_cleanup_outbox_pending_claim_idx',
              'auth_cleanup_outbox_processing_lease_idx'
            )
          order by indexname;
        `);
        expect(cleanupIndexes.rows.map((row) => row.indexname)).toEqual([
          "auth_cleanup_outbox_pending_claim_idx",
          "auth_cleanup_outbox_processing_lease_idx",
        ]);
        expect(cleanupIndexes.rows[0]?.indexdef).toContain(
          "(created_at, source_user_id)",
        );
        expect(cleanupIndexes.rows[0]?.indexdef).toContain(
          "WHERE (state = 'pending'::text)",
        );
        expect(cleanupIndexes.rows[1]?.indexdef).toContain(
          "(lease_expires_at, created_at, source_user_id)",
        );
        expect(cleanupIndexes.rows[1]?.indexdef).toContain(
          "WHERE (state = 'processing'::text)",
        );

        const functionAcl = await database.query<{
          exact_grantees: boolean;
          execute_grants: number;
          function_name: string;
          owner_grants: number;
          service_grants: number;
        }>(`
          select
            p.proname as function_name,
            pg_catalog.count(*)::integer as execute_grants,
            pg_catalog.count(*) filter (
              where r.rolname = 'postgres'
            )::integer as owner_grants,
            pg_catalog.count(*) filter (
              where r.rolname = 'service_role'
            )::integer as service_grants,
            pg_catalog.bool_and(
              r.rolname in ('postgres', 'service_role')
            ) as exact_grantees
          from pg_catalog.pg_proc as p
          cross join lateral pg_catalog.aclexplode(
            coalesce(
              p.proacl,
              pg_catalog.acldefault('f'::"char", p.proowner)
            )
          ) as acl_entry
          left join pg_catalog.pg_roles as r
            on r.oid = acl_entry.grantee
          where p.oid in (
            'public.claim_auth_cleanup_outbox(uuid,integer)'::regprocedure,
            'public.complete_auth_cleanup_outbox(uuid,uuid)'::regprocedure,
            'public.create_account_merge_intent(uuid,text,text,text)'::regprocedure,
            'public.consume_account_merge_intent(text,text,uuid,text)'::regprocedure,
            'public.redeem_campaign_code(uuid,text,text)'::regprocedure,
            'public.get_partner_reward_summary(uuid)'::regprocedure
          )
            and acl_entry.privilege_type = 'EXECUTE'
          group by p.proname
          order by p.proname;
        `);
        expect(functionAcl.rows).toEqual([
          {
            exact_grantees: true,
            execute_grants: 2,
            function_name: "claim_auth_cleanup_outbox",
            owner_grants: 1,
            service_grants: 1,
          },
          {
            exact_grantees: true,
            execute_grants: 2,
            function_name: "complete_auth_cleanup_outbox",
            owner_grants: 1,
            service_grants: 1,
          },
          {
            exact_grantees: true,
            execute_grants: 2,
            function_name: "consume_account_merge_intent",
            owner_grants: 1,
            service_grants: 1,
          },
          {
            exact_grantees: true,
            execute_grants: 2,
            function_name: "create_account_merge_intent",
            owner_grants: 1,
            service_grants: 1,
          },
          {
            exact_grantees: true,
            execute_grants: 2,
            function_name: "get_partner_reward_summary",
            owner_grants: 1,
            service_grants: 1,
          },
          {
            exact_grantees: true,
            execute_grants: 2,
            function_name: "redeem_campaign_code",
            owner_grants: 1,
            service_grants: 1,
          },
        ]);

        await database.exec("set role authenticated;");
        await expect(
          database.query(
            `
              select public.create_account_merge_intent(
                $1::uuid,
                'session'::text,
                'google'::text,
                $2::text
              );
            `,
            [sourceGuestId, mergeTokenDigest],
          ),
        ).rejects.toThrow(/permission denied/iu);
        await database.exec("reset role;");
      } finally {
        await database.close();
      }
    },
    60_000,
  );

  it(
    "accepts credit snapshots above 3000 and rejects snapshots above the three-million ceiling",
    async () => {
      const database = await createMigratedDatabase();
      try {
        await seedUsers(database, [snapshotOwnerId]);
        const wallet = await onlyRow<{ id: string }>(
          database,
          `
            insert into public.wallets (
              user_id,
              initial_balance,
              remaining_balance,
              reserved_balance,
              provider_committed_micro_usd,
              provider_reserved_micro_usd,
              created_at,
              expires_at
            )
            values (
              $1::uuid,
              6000,
              6000,
              0,
              0,
              0,
              pg_catalog.now(),
              pg_catalog.now() + interval '14 days'
            )
            returning id;
          `,
          [snapshotOwnerId],
        );

        const reservation = await onlyRow<{ id: string }>(
          database,
          `
            insert into public.ledger_entries (
              wallet_id,
              user_id,
              entry_kind,
              state,
              credits_delta,
              provider_cost_micro_usd,
              idempotency_key,
              balance_after,
              reserved_after,
              provider_committed_after_micro_usd,
              provider_reserved_after_micro_usd
            )
            values (
              $1::uuid,
              $2::uuid,
              'reserve',
              'committed',
              -120,
              0,
              'snapshot-reservation',
              5880,
              0,
              0,
              0
            )
            returning id;
          `,
          [wallet.id, snapshotOwnerId],
        );
        const session = await onlyRow<{ id: string }>(
          database,
          `
            insert into public.task_sessions (
              user_id,
              reservation_id,
              task_type,
              title,
              model_id,
              input_units,
              output_units,
              provider_cost_micro_usd,
              status
            )
            values (
              $1::uuid,
              $2::uuid,
              'study',
              'Snapshot test',
              'gpt-5.6-terra',
              0,
              0,
              0,
              'completed'
            )
            returning id;
          `,
          [snapshotOwnerId, reservation.id],
        );
        const task = await onlyRow<{
          id: string;
          remaining_credits: number;
        }>(
          database,
          `
            with authoritative_clock as (
              select pg_catalog.clock_timestamp() as completed_at
            )
            insert into public.task_executions (
              user_id,
              idempotency_key,
              request_fingerprint,
              task_type,
              model_id,
              provider_cost_ceiling_micro_usd,
              state,
              owner_token,
              lease_expires_at,
              result_payload,
              result_expires_at,
              remaining_credits,
              session_id,
              error_code,
              created_at,
              updated_at
            )
            select
              $1::uuid,
              'snapshot-task',
              $2::text,
              'study',
              'gpt-5.6-terra',
              0,
              'completed',
              $3::uuid,
              null,
              '{}'::jsonb,
              completed_at + interval '5 minutes',
              6000,
              $4::uuid,
              null,
              completed_at,
              completed_at
            from authoritative_clock
            returning id, remaining_credits;
          `,
          [
            snapshotOwnerId,
            "5".repeat(64),
            "99999999-9999-4999-8999-999999999999",
            session.id,
          ],
        );
        expect(task.remaining_credits).toBe(6_000);

        const key = await onlyRow<{ key_id: string }>(
          database,
          `
            select key_id
            from public.create_agent_api_key(
              $1::uuid,
              $2::text,
              1::smallint,
              'ygf_SNAP'::text,
              'SNAP'::text,
              pg_catalog.now() + interval '1 day',
              12,
              2
            );
          `,
          [snapshotOwnerId, "S".repeat(43)],
        );
        const request = await onlyRow<{
          id: string;
          remaining_credits: number;
        }>(
          database,
          `
            with authoritative_clock as (
              select pg_catalog.clock_timestamp() as completed_at
            )
            insert into public.agent_requests (
              key_id,
              user_id,
              wallet_id,
              idempotency_key,
              request_fingerprint,
              model_id,
              provider_cost_ceiling_micro_usd,
              credit_ceiling,
              provider_cost_micro_usd,
              credits_charged,
              input_units,
              output_units,
              state,
              owner_token,
              lease_expires_at,
              result_payload,
              result_expires_at,
              remaining_credits,
              error_code,
              created_at,
              completed_at,
              updated_at
            )
            select
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::text,
              $5::text,
              'gpt-5.6-terra',
              1,
              1,
              0,
              0,
              0,
              0,
              'completed',
              $6::uuid,
              null,
              '{"response":{"text":"ok"}}'::jsonb,
              completed_at + interval '5 minutes',
              6000,
              null,
              completed_at,
              completed_at,
              completed_at
            from authoritative_clock
            returning id, remaining_credits;
          `,
          [
            key.key_id,
            snapshotOwnerId,
            wallet.id,
            `idem_${"6".repeat(64)}`,
            "6".repeat(64),
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          ],
        );
        expect(request.remaining_credits).toBe(6_000);

        const usage = await onlyRow<{
          balance_after: number;
          id: string;
        }>(
          database,
          `
            insert into public.agent_usage_entries (
              request_id,
              key_id,
              user_id,
              wallet_id,
              entry_kind,
              credits_delta,
              provider_cost_micro_usd,
              balance_after,
              reserved_after,
              provider_committed_after_micro_usd,
              provider_reserved_after_micro_usd
            )
            values (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::uuid,
              'commit',
              0,
              0,
              6000,
              0,
              0,
              0
            )
            returning id, balance_after;
          `,
          [request.id, key.key_id, snapshotOwnerId, wallet.id],
        );
        expect(usage.balance_after).toBe(6_000);

        await expect(
          database.query(
            `
              update public.wallets
              set
                initial_balance = 3003000,
                remaining_balance = 3003000
              where id = $1::uuid;
            `,
            [wallet.id],
          ),
        ).rejects.toThrow(/wallets_initial_balance_check/iu);
        await expect(
          database.query(
            `
              update public.task_executions
              set remaining_credits = 3000001
              where id = $1::uuid;
            `,
            [task.id],
          ),
        ).rejects.toThrow(/task_executions_remaining_credits_check/iu);
        await expect(
          database.query(
            `
              update public.agent_requests
              set remaining_credits = 3000001
              where id = $1::uuid;
            `,
            [request.id],
          ),
        ).rejects.toThrow(/agent_requests_remaining_credits_check/iu);
        await expect(
          database.query(
            `
              update public.agent_usage_entries
              set balance_after = 3000001
              where id = $1::uuid;
            `,
            [usage.id],
          ),
        ).rejects.toThrow(/agent_usage_entries_balance_after_check/iu);
      } finally {
        await database.close();
      }
    },
    60_000,
  );
});
