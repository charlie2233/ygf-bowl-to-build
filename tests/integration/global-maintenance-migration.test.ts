// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const migrations = [
  "202607260001_campaign.sql",
  "202607270001_agent_events.sql",
  "202607270002_agent_gateway.sql",
  "202607270003_campaign_failure_accounting.sql",
  "202607270004_agent_request_admission.sql",
  "202607270005_anonymous_share_integrity.sql",
  "202607270006_provider_budget_3usd.sql",
  "202607270007_bounded_agent_replay_cleanup.sql",
  "202607270008_partner_rewards.sql",
  "20260729060004_function_execute_hardening.sql",
  "20260729060005_global_bounded_maintenance.sql",
] as const;

const bootstrap = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema extensions;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select null::uuid; $$;
  create or replace function auth.jwt() returns jsonb language sql stable
    as $$ select '{}'::jsonb; $$;
`;

async function row<T>(database: PGlite, sql: string, params: unknown[] = []) {
  const result = await database.query<T>(sql, params);
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!;
}

async function database() {
  const value = new PGlite({ extensions: { pgcrypto } });
  await value.exec(bootstrap);
  for (const name of migrations) {
    await value.exec(
      await readFile(path.join(process.cwd(), "supabase/migrations", name), "utf8"),
    );
  }
  return value;
}

describe("global bounded maintenance migration", () => {
  it("is service-role-only, bounded, idempotent, and preserves stale Agent accounting", async () => {
    const db = await database();
    const user = "99999999-9999-4999-8999-999999999999";
    const owner = "88888888-8888-4888-8888-888888888888";
    const digest = "M".repeat(43);
    try {
      await db.query("insert into auth.users (id) values ($1::uuid);", [user]);
      const wallet = await row<{ id: string }>(
        db,
        `insert into public.wallets (user_id, created_at, expires_at)
         values (
           $1::uuid,
           pg_catalog.now(),
           pg_catalog.now() + interval '14 days'
         ) returning id;`,
        [user],
      );
      await db.exec("set role service_role;");
      const key = await row<{ key_id: string }>(
        db,
        `select key_id from public.create_agent_api_key(
          $1::uuid, $2::text, 1::smallint, 'ygf_MMMM', 'MMMM',
          pg_catalog.now() + interval '1 day', 12, 2
        );`,
        [user, digest],
      );
      const agent = await row<{ request_id: string }>(
        db,
        `select request_id from public.begin_agent_request(
          $1::text, $2::text, $3::text, 'test-model'::text,
          12000::bigint, 12, $4::uuid,
          pg_catalog.clock_timestamp() + interval '1 minute'
        );`,
        [digest, `idem_${"a".repeat(64)}`, "a".repeat(64), owner],
      );
      const task = await row<{ execution_id: string }>(
        db,
        `select execution_id from public.begin_campaign_task_execution(
          $1::uuid, 'maintenance-task'::text, $2::text, 'study'::text,
          'test-model'::text, 10000::bigint, $3::uuid, pg_catalog.now()
        );`,
        [user, "b".repeat(64), owner],
      );
      await db.query(
        "select * from public.reserve_campaign_task_spend($1::uuid, $2::uuid, pg_catalog.now());",
        [task.execution_id, owner],
      );
      await db.exec("reset role;");

      await db.query(
        "update public.agent_requests set lease_expires_at = pg_catalog.now() - interval '1 minute' where id = $1::uuid;",
        [agent.request_id],
      );
      await db.query(
        "update public.task_executions set lease_expires_at = pg_catalog.now() - interval '1 minute' where id = $1::uuid;",
        [task.execution_id],
      );
      await db.query(
        `insert into public.public_validation_attempts (
          signal_digest, signal_version, signal_purpose, signal_bucket, allowed, created_at, expires_at
        )
        select
          $1::text, 'v1', 'validate-code', bucket, true,
          pg_catalog.to_timestamp(bucket * 300 + 1),
          pg_catalog.to_timestamp((bucket + 1) * 300)
        from (
          select pg_catalog.floor(
            extract(epoch from pg_catalog.now()) / 300
          )::bigint - 1 as bucket
        ) as expired;`,
        ["c".repeat(64)],
      );
      await db.query(
        `insert into public.redemption_attempts (
          signal_digest, signal_version, signal_purpose, signal_bucket, outcome, created_at, finalized_at, expires_at
        ) values (
          $1::text, 'v1', 'redeem-code', 1, 'invalid',
          pg_catalog.now() - interval '3 minutes',
          pg_catalog.now() - interval '2 minutes',
          pg_catalog.now() - interval '1 minute'
        );`,
        ["d".repeat(64)],
      );
      await db.query(
        `insert into public.events (name, source, metadata, created_at, retain_until)
         values (
           'task_failed', 'task', '{"outcome":"failure"}'::jsonb,
           pg_catalog.now() - interval '2 minutes',
           pg_catalog.now() - interval '1 minute'
         );`,
      );

      await db.exec("set role authenticated;");
      await expect(
        db.query("select public.run_bounded_global_maintenance(100);"),
      ).rejects.toThrow(/permission denied/iu);
      await db.exec("reset role; set role anon;");
      await expect(
        db.query("select public.run_bounded_global_maintenance(100);"),
      ).rejects.toThrow(/permission denied/iu);
      await db.exec("reset role; set role service_role;");
      await expect(
        db.query("select public.run_bounded_global_maintenance(0);"),
      ).rejects.toThrow(/GLOBAL_MAINTENANCE_INVALID/iu);
      await expect(
        db.query("select public.run_bounded_global_maintenance(101);"),
      ).rejects.toThrow(/GLOBAL_MAINTENANCE_INVALID/iu);
      await expect(
        db.query(
          "select private.settle_stale_agent_request($1::uuid, pg_catalog.now());",
          [agent.request_id],
        ),
      ).rejects.toThrow(/permission denied/iu);
      const first = await row<{ result: Record<string, number> }>(
        db,
        "select public.run_bounded_global_maintenance(100) as result;",
      );
      expect(first.result).toEqual({
        agent_replays: 0,
        agent_requests: 1,
        events: 1,
        public_validations: 1,
        redemption_attempts: 1,
        task_executions: 1,
      });
      const second = await row<{ result: Record<string, number> }>(
        db,
        "select public.run_bounded_global_maintenance(100) as result;",
      );
      expect(second.result).toEqual({
        agent_replays: 0,
        agent_requests: 0,
        events: 0,
        public_validations: 0,
        redemption_attempts: 0,
        task_executions: 0,
      });
      await db.exec("reset role;");

      expect(await row(db, `select state, credits_charged, error_code from public.agent_requests where id = $1::uuid;`, [agent.request_id])).toEqual({
        credits_charged: 0,
        error_code: "REQUEST_EXPIRED",
        state: "failed",
      });
      expect(await row(db, `select remaining_balance, reserved_balance, provider_committed_micro_usd, provider_reserved_micro_usd from public.wallets where id = $1::uuid;`, [wallet.id])).toEqual({
        provider_committed_micro_usd: 22000,
        provider_reserved_micro_usd: 0,
        remaining_balance: 3000,
        reserved_balance: 0,
      });
      expect(await row(db, `select provider_committed_micro_usd, provider_reserved_micro_usd from public.agent_api_keys where id = $1::uuid;`, [key.key_id])).toEqual({
        provider_committed_micro_usd: 12000,
        provider_reserved_micro_usd: 0,
      });
      expect(await row(db, `select count(*)::integer as count from public.agent_usage_entries where request_id = $1::uuid and entry_kind = 'refund';`, [agent.request_id])).toEqual({ count: 1 });
    } finally {
      await db.close();
    }
  }, 60_000);
});
