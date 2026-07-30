// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const codeHash = "a".repeat(64);

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
    select '{}'::jsonb;
  $$;
`;

interface RedemptionRow {
  ledger_entry_id: string;
  remaining_balance: number;
  reserved_balance: number;
  wallet_id: string;
  wallet_user_id: string;
}

async function redeem(
  database: PGlite,
  userId: string,
  idempotencyKey: string,
) {
  const result = await database.query<RedemptionRow>(
    `
      select *
      from public.redeem_campaign_code(
        $1::uuid,
        $2::text,
        $3::text
      );
    `,
    [userId, codeHash, idempotencyKey],
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!;
}

describe("same-account redemption retry migration", () => {
  it("returns the current wallet once, without resetting credits or allowing another account", async () => {
    const database = new PGlite({ extensions: { pgcrypto } });

    try {
      await database.exec(bootstrapSql);
      for (const migrationName of [
        "202607260001_campaign.sql",
        "202607300001_same_account_redemption_retry.sql",
        "202607300002_same_account_redemption_retry_wallet_lock.sql",
      ]) {
        await database.exec(
          await readFile(
            path.join(
              process.cwd(),
              "supabase/migrations",
              migrationName,
            ),
            "utf8",
          ),
        );
      }

      await database.query(
        `
          insert into auth.users (id)
          values ($1::uuid), ($2::uuid), ($3::uuid);
        `,
        [ownerId, otherId, adminId],
      );
      await database.query(
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
            'retry test',
            'soft-test',
            1,
            'active',
            $1::uuid,
            pg_catalog.now()
          );
        `,
        [adminId],
      );
      await database.query(
        `
          insert into public.promo_codes (
            batch_id,
            row_reference,
            code_hash,
            state
          )
          select
            id,
            'YGF-23456789-0001',
            $1::text,
            'eligible'
          from public.promo_batches;
        `,
        [codeHash],
      );

      const first = await redeem(database, ownerId, "initial-claim");

      await database.query(
        `
          update public.wallets as w
          set
            remaining_balance = w.remaining_balance - 120,
            reserved_balance = w.reserved_balance + 120
          where w.user_id = $1::uuid;
        `,
        [ownerId],
      );

      const sameKeyRetry = await redeem(
        database,
        ownerId,
        "initial-claim",
      );
      const freshKeyRetry = await redeem(
        database,
        ownerId,
        "fresh-retry",
      );

      expect(first.remaining_balance).toBe(3_000);
      expect(sameKeyRetry).toMatchObject({
        ledger_entry_id: first.ledger_entry_id,
        remaining_balance: 2_880,
        reserved_balance: 120,
        wallet_id: first.wallet_id,
        wallet_user_id: ownerId,
      });
      expect(freshKeyRetry).toEqual(sameKeyRetry);

      const grantCount = await database.query<{ count: number }>(
        `
          select count(*)::integer as count
          from public.ledger_entries
          where entry_kind = 'grant';
        `,
      );
      expect(grantCount.rows[0]?.count).toBe(1);

      await expect(
        redeem(database, otherId, "other-account"),
      ).rejects.toThrow(/CODE_ALREADY_REDEEMED/iu);
    } finally {
      await database.close();
    }
  }, 30_000);
});
