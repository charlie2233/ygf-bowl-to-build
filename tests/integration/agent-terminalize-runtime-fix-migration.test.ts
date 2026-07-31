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
  "202607270006_provider_budget_3usd.sql",
  "202607310001_agent_terminalize_coalesce_runtime_fix.sql",
  "202607310002_agent_terminalize_definition_guard.sql",
  "202607310003_agent_terminalize_exact_acl_guard.sql",
] as const;

const userId = "11111111-1111-4111-8111-111111111111";
const completedOwner =
  "22222222-2222-4222-8222-222222222222";
const failedOwner =
  "33333333-3333-4333-8333-333333333333";
const keyHash = "A".repeat(43);

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

async function migrationSql(name: string) {
  return readFile(
    path.join(process.cwd(), "supabase/migrations", name),
    "utf8",
  );
}

describe("Agent terminalization COALESCE runtime repair", () => {
  it("settles successful and failed provider requests after the forward migration", async () => {
    const database = new PGlite({
      extensions: { pgcrypto },
    });

    try {
      await database.exec(bootstrapSql);
      for (const migrationName of migrationNames) {
        await database.exec(await migrationSql(migrationName));
      }

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
      await database.query(
        `
          select key_id
          from public.create_agent_api_key(
            $1::uuid,
            $2::text,
            1::smallint,
            'ygf_AAAA'::text,
            'AAAA'::text,
            pg_catalog.now() + interval '1 day',
            12,
            2
          );
        `,
        [userId, keyHash],
      );

      const completedBegin = await database.query<{
        request_id: string;
      }>(
        `
          select request_id
          from public.begin_agent_request(
            $1::text,
            ('idem_' || repeat('a', 64))::text,
            repeat('b', 64)::text,
            'gpt-5.4-nano-2026-03-17'::text,
            25000::bigint,
            25,
            $2::uuid,
            pg_catalog.now() + interval '90 seconds'
          );
        `,
        [keyHash, completedOwner],
      );

      const completed = await database.query<{
        remaining_credits: number;
        request_state: string;
      }>(
        `
          select request_state, remaining_credits
          from public.terminalize_agent_request(
            $1::uuid,
            $2::uuid,
            'completed'::text,
            jsonb_build_object(
              'response',
              jsonb_build_object(
                'ygf',
                jsonb_build_object('remaining_credits', 0)
              )
            ),
            10,
            5,
            10::bigint,
            1,
            null
          );
        `,
        [completedBegin.rows[0]!.request_id, completedOwner],
      );
      expect(completed.rows).toEqual([
        {
          remaining_credits: 2999,
          request_state: "completed",
        },
      ]);

      const failedBegin = await database.query<{
        request_id: string;
      }>(
        `
          select request_id
          from public.begin_agent_request(
            $1::text,
            ('idem_' || repeat('c', 64))::text,
            repeat('d', 64)::text,
            'gpt-5.4-nano-2026-03-17'::text,
            25000::bigint,
            25,
            $2::uuid,
            pg_catalog.now() + interval '90 seconds'
          );
        `,
        [keyHash, failedOwner],
      );

      const failed = await database.query<{
        error_code: string;
        remaining_credits: number;
        request_state: string;
      }>(
        `
          select request_state, remaining_credits, error_code
          from public.terminalize_agent_request(
            $1::uuid,
            $2::uuid,
            'failed'::text,
            jsonb_build_object(
              'error',
              jsonb_build_object(
                'code',
                'provider_unavailable'
              )
            ),
            0,
            0,
            25000::bigint,
            0,
            'PROVIDER_UNAVAILABLE'::text
          );
        `,
        [failedBegin.rows[0]!.request_id, failedOwner],
      );
      expect(failed.rows).toEqual([
        {
          error_code: "PROVIDER_UNAVAILABLE",
          remaining_credits: 2999,
          request_state: "failed",
        },
      ]);

      const wallet = await database.query<{
        provider_committed_micro_usd: number;
        provider_reserved_micro_usd: number;
        remaining_balance: number;
        reserved_balance: number;
      }>(
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
      expect(wallet.rows).toEqual([
        {
          provider_committed_micro_usd: 25010,
          provider_reserved_micro_usd: 0,
          remaining_balance: 2999,
          reserved_balance: 0,
        },
      ]);

      const repairedDefinition = await database.query<{
        definition: string;
      }>(
        `
          select pg_catalog.pg_get_functiondef(
            pg_catalog.to_regprocedure(
              'public.terminalize_agent_request(uuid,uuid,text,jsonb,integer,integer,bigint,integer,text)'
            )
          ) as definition;
        `,
      );
      expect(repairedDefinition.rows[0]!.definition).not.toContain(
        "pg_catalog.coalesce",
      );
    } finally {
      await database.close();
    }
  });

  it("rejects post-repair definition or security drift", async () => {
    const database = new PGlite({
      extensions: { pgcrypto },
    });

    try {
      await database.exec(bootstrapSql);
      for (const migrationName of migrationNames.slice(0, -2)) {
        await database.exec(await migrationSql(migrationName));
      }
      await database.exec(`
        alter function public.terminalize_agent_request(
          uuid,
          uuid,
          text,
          jsonb,
          integer,
          integer,
          bigint,
          integer,
          text
        ) set search_path = public;
      `);

      await expect(
        database.exec(
          await migrationSql(
            "202607310002_agent_terminalize_definition_guard.sql",
          ),
        ),
      ).rejects.toThrow(
        "AGENT_TERMINAL_GUARD_DEFINITION_OR_SECURITY_DRIFT",
      );
    } finally {
      await database.close();
    }
  });

  it("rejects an unexpected EXECUTE grantee", async () => {
    const database = new PGlite({
      extensions: { pgcrypto },
    });

    try {
      await database.exec(bootstrapSql);
      for (const migrationName of migrationNames.slice(0, -1)) {
        await database.exec(await migrationSql(migrationName));
      }
      await database.exec(`
        create role rogue_terminal_caller nologin;
        grant execute on function public.terminalize_agent_request(
          uuid,
          uuid,
          text,
          jsonb,
          integer,
          integer,
          bigint,
          integer,
          text
        ) to rogue_terminal_caller;
      `);

      await expect(
        database.exec(
          await migrationSql(
            "202607310003_agent_terminalize_exact_acl_guard.sql",
          ),
        ),
      ).rejects.toThrow("AGENT_TERMINAL_EXACT_GUARD_ACL_DRIFT");
    } finally {
      await database.close();
    }
  });
});
