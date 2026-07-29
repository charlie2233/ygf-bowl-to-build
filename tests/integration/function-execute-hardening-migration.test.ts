// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const baseMigrationNames = [
  "202607260001_campaign.sql",
  "202607270001_agent_events.sql",
  "202607270002_agent_gateway.sql",
  "202607270003_campaign_failure_accounting.sql",
  "202607270004_agent_request_admission.sql",
  "202607270005_anonymous_share_integrity.sql",
  "202607270006_provider_budget_3usd.sql",
  "202607270007_bounded_agent_replay_cleanup.sql",
  "202607270008_partner_rewards.sql",
] as const;

const hardeningMigrationName =
  "20260729060004_function_execute_hardening.sql";

const adminId = "11111111-1111-4111-8111-111111111111";
const regularId = "22222222-2222-4222-8222-222222222222";

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

describe("function execute hardening migration", () => {
  it(
    "moves internal helpers, removes leaked grants, and preserves trigger and RLS behavior",
    async () => {
      const database = new PGlite({
        extensions: { pgcrypto },
      });

      try {
        await database.exec(bootstrapSql);
        for (const migrationName of baseMigrationNames) {
          await database.exec(await migrationSql(migrationName));
        }

        // Supabase grants EXECUTE on new public functions to API roles through
        // default privileges. Reproduce the resulting live-project ACLs.
        await database.exec(`
          grant execute on function public.handle_campaign_auth_user()
            to anon, authenticated, service_role;
          grant execute on function public.is_campaign_admin()
            to anon, authenticated, service_role;
        `);

        await database.exec(await migrationSql(hardeningMigrationName));

        const functions = await database.query<{
          authenticated_can_execute_admin: boolean;
          authenticated_can_execute_trigger: boolean;
          anon_can_execute_admin: boolean;
          anon_can_execute_trigger: boolean;
          private_admin: string | null;
          private_trigger: string | null;
          public_admin: string | null;
          public_trigger: string | null;
          service_can_execute_admin: boolean;
          service_can_execute_trigger: boolean;
        }>(`
          select
            pg_catalog.to_regprocedure(
              'public.handle_campaign_auth_user()'
            )::text as public_trigger,
            pg_catalog.to_regprocedure(
              'public.is_campaign_admin()'
            )::text as public_admin,
            pg_catalog.to_regprocedure(
              'private.handle_campaign_auth_user()'
            )::text as private_trigger,
            pg_catalog.to_regprocedure(
              'private.is_campaign_admin()'
            )::text as private_admin,
            pg_catalog.has_function_privilege(
              'anon',
              'private.handle_campaign_auth_user()',
              'EXECUTE'
            ) as anon_can_execute_trigger,
            pg_catalog.has_function_privilege(
              'authenticated',
              'private.handle_campaign_auth_user()',
              'EXECUTE'
            ) as authenticated_can_execute_trigger,
            pg_catalog.has_function_privilege(
              'service_role',
              'private.handle_campaign_auth_user()',
              'EXECUTE'
            ) as service_can_execute_trigger,
            pg_catalog.has_function_privilege(
              'anon',
              'private.is_campaign_admin()',
              'EXECUTE'
            ) as anon_can_execute_admin,
            pg_catalog.has_function_privilege(
              'authenticated',
              'private.is_campaign_admin()',
              'EXECUTE'
            ) as authenticated_can_execute_admin,
            pg_catalog.has_function_privilege(
              'service_role',
              'private.is_campaign_admin()',
              'EXECUTE'
            ) as service_can_execute_admin;
        `);
        expect(functions.rows).toEqual([
          {
            authenticated_can_execute_admin: true,
            authenticated_can_execute_trigger: false,
            anon_can_execute_admin: false,
            anon_can_execute_trigger: false,
            private_admin: "private.is_campaign_admin()",
            private_trigger: "private.handle_campaign_auth_user()",
            public_admin: null,
            public_trigger: null,
            service_can_execute_admin: true,
            service_can_execute_trigger: false,
          },
        ]);

        await database.query(
          `
            insert into auth.users (id)
            values ($1::uuid), ($2::uuid);
          `,
          [adminId, regularId],
        );
        await database.query(
          `
            update public.profiles
            set campaign_role = 'admin'
            where id = $1::uuid;
          `,
          [adminId],
        );

        const profileCount = await database.query<{ count: number }>(
          `
            select pg_catalog.count(*)::integer as count
            from public.profiles;
          `,
        );
        expect(profileCount.rows).toEqual([{ count: 2 }]);

        await database.exec("set role authenticated;");
        await database.exec(
          `set request.jwt.claim.sub = '${regularId}';`,
        );
        const regularProfiles = await database.query<{ id: string }>(
          "select id from public.profiles order by id;",
        );
        expect(regularProfiles.rows).toEqual([{ id: regularId }]);
        await database.exec("reset role;");

        await database.exec("set role authenticated;");
        await database.exec(
          `set request.jwt.claim.sub = '${adminId}';`,
        );
        const adminProfiles = await database.query<{ id: string }>(
          "select id from public.profiles order by id;",
        );
        expect(adminProfiles.rows).toEqual([
          { id: adminId },
          { id: regularId },
        ]);
        await database.exec("reset role;");
      } finally {
        await database.close();
      }
    },
    60_000,
  );
});
