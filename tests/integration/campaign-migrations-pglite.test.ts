// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const migrationNames = [
  "202607260001_campaign.sql",
  "202607270001_agent_events.sql",
  "202607270002_agent_gateway.sql",
  "202607270003_campaign_failure_accounting.sql",
  "202607270004_agent_request_admission.sql",
  "202607270005_anonymous_share_integrity.sql",
] as const;

const userId = "11111111-1111-4111-8111-111111111111";
const firstOwner = "22222222-2222-4222-8222-222222222222";
const staleOwner = "33333333-3333-4333-8333-333333333333";
const nextOwner = "44444444-4444-4444-8444-444444444444";
const legacyUserId = "55555555-5555-4555-8555-555555555555";
const legacyOwner = "66666666-6666-4666-8666-666666666666";
const expiredUserId = "77777777-7777-4777-8777-777777777777";
const legacyKeyHash = "L".repeat(43);

const bootstrapSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create schema extensions;

  create table auth.users (
    id uuid primary key
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

interface BeginRow {
  execution_id: string;
  execution_state: string;
  error_code: string | null;
  remaining_credits: number | null;
  session_id: string | null;
}

interface ReserveRow {
  ledger_entry_id: string;
  ledger_state: string;
  provider_committed_micro_usd: number;
  provider_reserved_micro_usd: number;
  remaining_balance: number;
  reserved_balance: number;
}

interface TerminalRow {
  error_code: string | null;
  execution_id: string;
  execution_state: string;
  remaining_credits: number;
  session_id: string;
}

interface WalletRow {
  provider_committed_micro_usd: number;
  provider_reserved_micro_usd: number;
  remaining_balance: number;
  reserved_balance: number;
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

async function beginTask(
  database: PGlite,
  {
    ceiling,
    fingerprint,
    idempotencyKey,
    ownerToken,
  }: {
    ceiling: number;
    fingerprint: string;
    idempotencyKey: string;
    ownerToken: string;
  },
) {
  return onlyRow<BeginRow>(
    database,
    `
      select *
      from public.begin_campaign_task_execution(
        $1::uuid,
        $2::text,
        $3::text,
        'study'::text,
        'test-model'::text,
        $4::bigint,
        $5::uuid,
        pg_catalog.now()
      );
    `,
    [userId, idempotencyKey, fingerprint, ceiling, ownerToken],
  );
}

async function reserveTask(
  database: PGlite,
  executionId: string,
  ownerToken: string,
) {
  return onlyRow<ReserveRow>(
    database,
    `
      select *
      from public.reserve_campaign_task_spend(
        $1::uuid,
        $2::uuid,
        pg_catalog.now()
      );
    `,
    [executionId, ownerToken],
  );
}

async function failTask(
  database: PGlite,
  {
    executionId,
    ownerToken,
    providerCostMicroUsd,
    reservationId,
  }: {
    executionId: string;
    ownerToken: string;
    providerCostMicroUsd: number;
    reservationId: string;
  },
) {
  return onlyRow<TerminalRow>(
    database,
    `
      select *
      from public.terminalize_campaign_task_execution(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        'failed'::text,
        '{"error":"PROVIDER_UNAVAILABLE"}'::jsonb,
        'Study help attempt'::text,
        0,
        0,
        $4::bigint,
        null::text,
        'PROVIDER_UNAVAILABLE'::text,
        pg_catalog.now()
      );
    `,
    [
      executionId,
      ownerToken,
      reservationId,
      providerCostMicroUsd,
    ],
  );
}

describe("disposable Postgres campaign migrations", () => {
  it(
    "applies and executes accounting in PGlite; multi-session locks remain a LIVE_SUPABASE_GATE",
    async () => {
      const database = new PGlite({
        extensions: { pgcrypto },
      });

      try {
        await database.exec(bootstrapSql);
        for (const migrationName of migrationNames) {
          if (
            migrationName ===
            "202607270004_agent_request_admission.sql"
          ) {
            await database.query(
              "insert into auth.users (id) values ($1::uuid);",
              [legacyUserId],
            );
            await database.query(
              `
                with authoritative_clock as (
                  select pg_catalog.now() as created_at
                )
                insert into public.wallets (
                  user_id,
                  created_at,
                  expires_at
                )
                select
                  $1::uuid,
                  authoritative_clock.created_at,
                  authoritative_clock.created_at + interval '14 days'
                from authoritative_clock;
              `,
              [legacyUserId],
            );
            await database.query(
              `
                select key_id
                from public.create_agent_api_key(
                  $1::uuid,
                  $2::text,
                  1::smallint,
                  'ygf_LLLL'::text,
                  'LLLL'::text,
                  pg_catalog.now() + interval '1 day',
                  12,
                  2
                );
              `,
              [legacyUserId, legacyKeyHash],
            );
            await database.query(
              `
                select *
                from public.begin_agent_request(
                  $1::text,
                  'legacy-raw-retry-token'::text,
                  $2::text,
                  'demo-model'::text,
                  840::bigint,
                  10,
                  $3::uuid,
                  pg_catalog.now() + interval '1 minute'
                );
              `,
              [legacyKeyHash, "f".repeat(64), legacyOwner],
            );
          }
          const migration = await readFile(
            path.join(
              process.cwd(),
              "supabase/migrations",
              migrationName,
            ),
            "utf8",
          );
          try {
            await database.exec(migration);
          } catch (error) {
            throw new Error(
              `PGlite failed to apply ${migrationName}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              { cause: error },
            );
          }
        }

        const legacyConstraint = await onlyRow<{
          convalidated: boolean;
        }>(
          database,
          `
            select c.convalidated
            from pg_catalog.pg_constraint as c
            where c.conname =
              'agent_requests_hashed_idempotency_key';
          `,
        );
        expect(legacyConstraint.convalidated).toBe(false);
        const legacyRequests = await onlyRow<{ count: number }>(
          database,
          `
            select count(*)::integer as count
            from public.agent_requests
            where idempotency_key = 'legacy-raw-retry-token';
          `,
        );
        expect(legacyRequests.count).toBe(1);
        await expect(
          database.query(
            `
              insert into public.agent_requests (
                key_id,
                user_id,
                wallet_id,
                idempotency_key,
                request_fingerprint,
                model_id,
                provider_cost_ceiling_micro_usd,
                credit_ceiling,
                owner_token,
                lease_expires_at
              )
              select
                r.key_id,
                r.user_id,
                r.wallet_id,
                'new-raw-retry-token',
                r.request_fingerprint,
                r.model_id,
                r.provider_cost_ceiling_micro_usd,
                r.credit_ceiling,
                $1::uuid,
                pg_catalog.now() + interval '1 minute'
              from public.agent_requests as r
              where r.idempotency_key = 'legacy-raw-retry-token';
            `,
            [nextOwner],
          ),
        ).rejects.toThrow(
          "agent_requests_hashed_idempotency_key",
        );

        const shapeConstraint = await onlyRow<{
          definition: string;
        }>(
          database,
          `
            select pg_catalog.pg_get_constraintdef(c.oid) as definition
            from pg_catalog.pg_constraint as c
            where c.conname = 'ledger_entries_shape_v2';
          `,
        );
        expect(shapeConstraint.definition).toContain(
          "entry_kind = 'refund'::text",
        );
        expect(shapeConstraint.definition).not.toContain(
          "provider_cost_micro_usd = 0",
        );

        const staleIndex = await onlyRow<{ indexdef: string }>(
          database,
          `
            select indexdef
            from pg_catalog.pg_indexes
            where schemaname = 'public'
              and indexname =
                'task_executions_user_stale_running_idx';
          `,
        );
        expect(staleIndex.indexdef).toContain(
          "(user_id, lease_expires_at, id)",
        );
        expect(staleIndex.indexdef).toContain(
          "WHERE (state = 'running'::text)",
        );
        const namedIndexes = await database.query<{
          indexname: string;
        }>(`
          select indexname
          from pg_catalog.pg_indexes
          where schemaname = 'public'
            and indexname in (
              'agent_requests_wallet_state_idx',
              'task_executions_user_stale_running_idx'
            )
          order by indexname;
        `);
        expect(namedIndexes.rows.map((row) => row.indexname)).toEqual([
          "agent_requests_wallet_state_idx",
          "task_executions_user_stale_running_idx",
        ]);

        const privileges = await database.query<{
          authenticated_can_execute: boolean;
          service_role_can_execute: boolean;
          signature: string;
        }>(`
          select
            signature,
            pg_catalog.has_function_privilege(
              'authenticated',
              signature,
              'EXECUTE'
            ) as authenticated_can_execute,
            pg_catalog.has_function_privilege(
              'service_role',
              signature,
              'EXECUTE'
            ) as service_role_can_execute
          from pg_catalog.unnest(
            array[
              'public.reserve_campaign_spend(text,bigint)',
              'public.commit_campaign_spend(uuid,bigint,text)',
              'public.refund_campaign_spend(uuid,text)',
              'public.begin_campaign_task_execution(uuid,text,text,text,text,bigint,uuid,timestamptz)',
              'public.reserve_campaign_task_spend(uuid,uuid,timestamptz)',
              'public.settle_stale_campaign_task_execution(uuid,uuid,timestamptz)',
              'public.terminalize_campaign_task_execution(uuid,uuid,uuid,text,jsonb,text,integer,integer,bigint,text,text,timestamptz)'
            ]::text[]
          ) as signature
          order by signature;
        `);
        expect(privileges.rows).toHaveLength(7);
        expect(
          privileges.rows.every(
            (row) => row.authenticated_can_execute === false,
          ),
        ).toBe(true);
        expect(
          privileges.rows.every(
            (row) => row.service_role_can_execute === true,
          ),
        ).toBe(true);
        const sharePrivileges = await onlyRow<{
          authenticated_can_execute: boolean;
          authenticated_can_select: boolean;
          service_role_can_execute: boolean;
          service_role_can_select: boolean;
        }>(
          database,
          `
            select
              pg_catalog.has_function_privilege(
                'authenticated',
                'public.record_share_card_generation(uuid,uuid)',
                'EXECUTE'
              ) as authenticated_can_execute,
              pg_catalog.has_function_privilege(
                'service_role',
                'public.record_share_card_generation(uuid,uuid)',
                'EXECUTE'
              ) as service_role_can_execute,
              pg_catalog.has_table_privilege(
                'authenticated',
                'public.share_card_generations',
                'SELECT'
              ) as authenticated_can_select,
              pg_catalog.has_table_privilege(
                'service_role',
                'public.share_card_generations',
                'SELECT'
              ) as service_role_can_select;
          `,
        );
        expect(sharePrivileges).toEqual({
          authenticated_can_execute: false,
          authenticated_can_select: false,
          service_role_can_execute: true,
          service_role_can_select: true,
        });

        await database.query(
          "insert into auth.users (id) values ($1::uuid);",
          [userId],
        );
        await database.query(
          `
            with authoritative_clock as (
              select pg_catalog.now() as created_at
            )
            insert into public.wallets (
              user_id,
              created_at,
              expires_at
            )
            select
              $1::uuid,
              authoritative_clock.created_at,
              authoritative_clock.created_at + interval '14 days'
            from authoritative_clock;
          `,
          [userId],
        );
        const wallet = await onlyRow<{ id: string }>(
          database,
          "select id from public.wallets where user_id = $1::uuid;",
          [userId],
        );

        await database.exec("set role service_role;");
        const firstShare = await onlyRow<{ recorded: boolean }>(
          database,
          `
            select public.record_share_card_generation(
              $1::uuid,
              $2::uuid
            ) as recorded;
          `,
          [userId, wallet.id],
        );
        const replayedShare = await onlyRow<{ recorded: boolean }>(
          database,
          `
            select public.record_share_card_generation(
              $1::uuid,
              $2::uuid
            ) as recorded;
          `,
          [userId, wallet.id],
        );
        expect(firstShare.recorded).toBe(true);
        expect(replayedShare.recorded).toBe(false);
        await database.exec("reset role;");
        const shareCounts = await onlyRow<{
          event_count: number;
          marker_count: number;
        }>(
          database,
          `
            select
              (
                select pg_catalog.count(*)::integer
                from public.share_card_generations
                where wallet_id = $1::uuid
                  and user_id = $2::uuid
              ) as marker_count,
              (
                select pg_catalog.count(*)::integer
                from public.events
                where user_id = $2::uuid
                  and name = 'share_card_generated'
              ) as event_count;
          `,
          [wallet.id, userId],
        );
        expect(shareCounts).toEqual({
          event_count: 1,
          marker_count: 1,
        });
        await database.exec("set role service_role;");
        await expect(
          database.query(
            `
              select public.record_share_card_generation(
                $1::uuid,
                $2::uuid
              );
            `,
            [legacyUserId, wallet.id],
          ),
        ).rejects.toThrow("WALLET_NOT_FOUND");
        await database.exec("reset role;");
        await database.query(
          "insert into auth.users (id) values ($1::uuid);",
          [expiredUserId],
        );
        await database.query(
          `
            with authoritative_clock as (
              select pg_catalog.clock_timestamp() - interval '15 days'
                as created_at
            )
            insert into public.wallets (
              user_id,
              created_at,
              expires_at
            )
            select
              $1::uuid,
              authoritative_clock.created_at,
              authoritative_clock.created_at + interval '14 days'
            from authoritative_clock;
          `,
          [expiredUserId],
        );
        const expiredWallet = await onlyRow<{ id: string }>(
          database,
          "select id from public.wallets where user_id = $1::uuid;",
          [expiredUserId],
        );
        await database.exec("set role service_role;");
        await expect(
          database.query(
            `
              select public.record_share_card_generation(
                $1::uuid,
                $2::uuid
              );
            `,
            [expiredUserId, expiredWallet.id],
          ),
        ).rejects.toThrow("WALLET_EXPIRED");

        const agentKey = await onlyRow<{ key_id: string }>(
          database,
          `
            select key_id
            from public.create_agent_api_key(
              $1::uuid,
              $2::text,
              1::smallint,
              'ygf_AAAA'::text,
              'AAAA'::text,
              pg_catalog.now() + interval '1 day',
              1,
              1
            );
          `,
          [userId, "A".repeat(43)],
        );
        expect(agentKey.key_id).toMatch(
          /^[0-9a-f-]{36}$/u,
        );
        await database.query(
          "select public.admit_agent_api_key_request($1::text);",
          ["A".repeat(43)],
        );
        await expect(
          database.query(
            "select public.admit_agent_api_key_request($1::text);",
            ["A".repeat(43)],
          ),
        ).rejects.toThrow("AGENT_RATE_LIMITED");
        for (let index = 0; index < 9; index += 1) {
          await database.query(
            `
              insert into public.agent_api_keys (
                user_id, wallet_id, key_hash, hash_version, key_prefix,
                key_last4, expires_at, revoked_at
              )
              values (
                $1::uuid, $2::uuid, lpad($3::text, 43, 'b'), 1,
                'ygf_BBBB', 'BBBB', pg_catalog.now() + interval '1 day',
                pg_catalog.now()
              );
            `,
            [userId, wallet.id, String(index)],
          );
        }
        await expect(
          database.query(
            `
              insert into public.agent_api_keys (
                user_id, wallet_id, key_hash, hash_version, key_prefix,
                key_last4, expires_at, revoked_at
              )
              values (
                $1::uuid, $2::uuid, lpad('z', 43, 'b'), 1,
                'ygf_BBBB', 'BBBB', pg_catalog.now() + interval '1 day',
                pg_catalog.now()
              );
            `,
            [userId, wallet.id],
          ),
        ).rejects.toThrow("AGENT_KEY_LIMIT_REACHED");
        const firstExecution = await beginTask(database, {
          ceiling: 12_000,
          fingerprint: "a".repeat(64),
          idempotencyKey: "pglite-failed-task",
          ownerToken: firstOwner,
        });
        expect(firstExecution.execution_state).toBe("owner");
        const firstReservation = await reserveTask(
          database,
          firstExecution.execution_id,
          firstOwner,
        );
        expect(firstReservation).toMatchObject({
          ledger_state: "reserved",
          provider_reserved_micro_usd: 12_000,
          remaining_balance: 2_880,
          reserved_balance: 120,
        });

        await expect(
          failTask(database, {
            executionId: firstExecution.execution_id,
            ownerToken: firstOwner,
            providerCostMicroUsd: 11_999,
            reservationId: firstReservation.ledger_entry_id,
          }),
        ).rejects.toThrow("INVALID_TASK_EXECUTION_RESULT");

        await database.exec("reset role;");
        await expect(
          onlyRow<WalletRow>(
            database,
            `
              select
                remaining_balance,
                reserved_balance,
                provider_committed_micro_usd,
                provider_reserved_micro_usd
              from public.wallets
              where user_id = $1::uuid;
            `,
            [userId],
          ),
        ).resolves.toMatchObject({
          provider_committed_micro_usd: 0,
          provider_reserved_micro_usd: 12_000,
          remaining_balance: 2_880,
          reserved_balance: 120,
        });

        await database.exec("set role service_role;");
        const firstFailure = await failTask(database, {
          executionId: firstExecution.execution_id,
          ownerToken: firstOwner,
          providerCostMicroUsd: 12_000,
          reservationId: firstReservation.ledger_entry_id,
        });
        const firstReplay = await failTask(database, {
          executionId: firstExecution.execution_id,
          ownerToken: firstOwner,
          providerCostMicroUsd: 12_000,
          reservationId: firstReservation.ledger_entry_id,
        });
        expect(firstFailure).toEqual(firstReplay);
        expect(firstFailure).toMatchObject({
          error_code: "PROVIDER_UNAVAILABLE",
          execution_state: "failed",
          remaining_credits: 3_000,
        });
        await database.exec("reset role;");

        const firstWallet = await onlyRow<WalletRow>(
          database,
          `
            select
              remaining_balance,
              reserved_balance,
              provider_committed_micro_usd,
              provider_reserved_micro_usd
            from public.wallets
            where user_id = $1::uuid;
          `,
          [userId],
        );
        expect(firstWallet).toEqual({
          provider_committed_micro_usd: 12_000,
          provider_reserved_micro_usd: 0,
          remaining_balance: 3_000,
          reserved_balance: 0,
        });
        const firstLedger = await database.query<{
          credits_delta: number;
          entry_kind: string;
          provider_cost_micro_usd: number;
          state: string;
        }>(
          `
            select
              entry_kind,
              state,
              credits_delta,
              provider_cost_micro_usd
            from public.ledger_entries
            where id = $1::uuid
              or reservation_id = $1::uuid
            order by entry_kind;
          `,
          [firstReservation.ledger_entry_id],
        );
        expect(firstLedger.rows).toEqual([
          {
            credits_delta: 120,
            entry_kind: "refund",
            provider_cost_micro_usd: 12_000,
            state: "refunded",
          },
          {
            credits_delta: -120,
            entry_kind: "reserve",
            provider_cost_micro_usd: 12_000,
            state: "refunded",
          },
        ]);
        const firstTerminalCounts = await onlyRow<{
          ledger_count: number;
          session_count: number;
        }>(
          database,
          `
            select
              (
                select pg_catalog.count(*)::integer
                from public.ledger_entries
                where id = $1::uuid
                  or reservation_id = $1::uuid
              ) as ledger_count,
              (
                select pg_catalog.count(*)::integer
                from public.task_sessions
                where reservation_id = $1::uuid
              ) as session_count;
          `,
          [firstReservation.ledger_entry_id],
        );
        expect(firstTerminalCounts).toEqual({
          ledger_count: 2,
          session_count: 1,
        });

        await database.exec("set role service_role;");
        const staleExecution = await beginTask(database, {
          ceiling: 10_000,
          fingerprint: "b".repeat(64),
          idempotencyKey: "pglite-stale-key-a",
          ownerToken: staleOwner,
        });
        const staleReservation = await reserveTask(
          database,
          staleExecution.execution_id,
          staleOwner,
        );
        await database.exec("reset role;");
        await database.query(
          `
            update public.task_executions
            set lease_expires_at =
              pg_catalog.now() - interval '1 second'
            where id = $1::uuid;
          `,
          [staleExecution.execution_id],
        );

        await database.exec("set role service_role;");
        const nextExecution = await beginTask(database, {
          ceiling: 1_000,
          fingerprint: "c".repeat(64),
          idempotencyKey: "pglite-later-key-b",
          ownerToken: nextOwner,
        });
        expect(nextExecution.execution_state).toBe("owner");
        await database.exec("reset role;");

        const staleResult = await onlyRow<{
          error_code: string;
          provider_cost_micro_usd: number;
          remaining_credits: number;
          state: string;
        }>(
          database,
          `
            select
              e.state,
              s.provider_cost_micro_usd,
              e.remaining_credits,
              e.error_code
            from public.task_executions as e
            join public.task_sessions as s
              on s.id = e.session_id
            where e.id = $1::uuid;
          `,
          [staleExecution.execution_id],
        );
        expect(staleResult).toEqual({
          error_code: "PROVIDER_UNAVAILABLE",
          provider_cost_micro_usd: 10_000,
          remaining_credits: 3_000,
          state: "failed",
        });
        const staleWallet = await onlyRow<WalletRow>(
          database,
          `
            select
              remaining_balance,
              reserved_balance,
              provider_committed_micro_usd,
              provider_reserved_micro_usd
            from public.wallets
            where user_id = $1::uuid;
          `,
          [userId],
        );
        expect(staleWallet).toEqual({
          provider_committed_micro_usd: 22_000,
          provider_reserved_micro_usd: 0,
          remaining_balance: 3_000,
          reserved_balance: 0,
        });
        const staleLedger = await database.query<{
          credits_delta: number;
          entry_kind: string;
          provider_cost_micro_usd: number;
          state: string;
        }>(
          `
            select
              entry_kind,
              state,
              credits_delta,
              provider_cost_micro_usd
            from public.ledger_entries
            where id = $1::uuid
              or reservation_id = $1::uuid
            order by entry_kind;
          `,
          [staleReservation.ledger_entry_id],
        );
        expect(staleLedger.rows).toEqual([
          {
            credits_delta: 120,
            entry_kind: "refund",
            provider_cost_micro_usd: 10_000,
            state: "refunded",
          },
          {
            credits_delta: -120,
            entry_kind: "reserve",
            provider_cost_micro_usd: 10_000,
            state: "refunded",
          },
        ]);
      } finally {
        await database.close();
      }
    },
    60_000,
  );
});
