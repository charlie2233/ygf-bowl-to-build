// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const campaignMigration =
  "202607260001_campaign.sql";
const runtimeFixMigration =
  "20260729234500_admin_batch_coalesce_runtime_fix.sql";
const adminId = "11111111-1111-4111-8111-111111111111";
const createRequestId =
  "22222222-2222-4222-8222-222222222222";
const activateRequestId =
  "33333333-3333-4333-8333-333333333333";
const codeHash = "a".repeat(64);
const rowReference = "YGF-23456789-0001";

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

describe("admin batch COALESCE runtime repair", () => {
  it(
    "creates and activates a hashed batch after the forward migration",
    async () => {
      const database = new PGlite({
        extensions: { pgcrypto },
      });

      try {
        await database.exec(bootstrapSql);
        await database.exec(
          await migrationSql(campaignMigration),
        );
        await database.exec(
          await migrationSql(runtimeFixMigration),
        );

        await database.query(
          "insert into auth.users (id) values ($1::uuid);",
          [adminId],
        );
        await database.query(
          `
            update public.profiles
            set campaign_role = 'admin'
            where id = $1::uuid;
          `,
          [adminId],
        );

        const created = await database.query<{
          batch_id: string;
          batch_status: string;
          code_count: number;
        }>(
          `
            select batch_id, batch_status, code_count
            from public.create_campaign_admin_batch(
              $1::uuid,
              $2::uuid,
              'Runtime repair acceptance'::text,
              'soft-test'::text,
              pg_catalog.now() + interval '1 day',
              array[$3::text],
              array[$4::text]
            );
          `,
          [adminId, createRequestId, codeHash, rowReference],
        );

        expect(created.rows).toHaveLength(1);
        expect(created.rows[0]).toMatchObject({
          batch_status: "pending",
          code_count: 1,
        });

        const batchId = created.rows[0]!.batch_id;
        const activated = await database.query<{
          batch_id: string;
          batch_status: string;
          code_count: number;
        }>(
          `
            select batch_id, batch_status, code_count
            from public.activate_campaign_admin_batch(
              $1::uuid,
              $2::uuid,
              $3::uuid
            );
          `,
          [adminId, activateRequestId, batchId],
        );

        expect(activated.rows).toEqual([
          {
            batch_id: batchId,
            batch_status: "active",
            code_count: 1,
          },
        ]);

        const inventory = await database.query<{
          state: string;
        }>(
          `
            select state
            from public.promo_codes
            where batch_id = $1::uuid;
          `,
          [batchId],
        );
        expect(inventory.rows).toEqual([
          { state: "eligible" },
        ]);
      } finally {
        await database.close();
      }
    },
    60_000,
  );
});
