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
  "202607270007_bounded_agent_replay_cleanup.sql",
  "202607270008_partner_rewards.sql",
  "20260729060004_function_execute_hardening.sql",
] as const;

const adminId = "11111111-1111-4111-8111-111111111111";
const regularOwnerId =
  "22222222-2222-4222-8222-222222222222";
const rewardOwnerId =
  "33333333-3333-4333-8333-333333333333";
const expiredOwnerId =
  "44444444-4444-4444-8444-444444444444";
const otherUserId = "55555555-5555-4555-8555-555555555555";

const regularCodeHash = "a".repeat(64);
const rewardCodeHash = "b".repeat(64);
const expiredCodeHash = "c".repeat(64);
const duplicateTargetCodeHash = "d".repeat(64);
const rewardDigest = "e".repeat(64);
const expiredRewardDigest = "f".repeat(64);

const regularRowReference = "YGF-23456789-0001";
const rewardRowReference = "YGF-2345678A-0002";
const expiredRowReference = "YGF-2345678B-0003";
const duplicateTargetRowReference = "YGF-2345678C-0004";

const rewardRequestId =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const expiredRewardRequestId =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const duplicateRequestId =
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const unauthorizedRequestId =
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const ciphertext = "Q2lwaGVydGV4dFJld2FyZA";
const iv = "AAAAAAAAAAAAAAAA";
const tag = "AQEBAQEBAQEBAQEBAQEBAQ";

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

interface AssignmentRow {
  assigned_at: string;
  promo_code_id: string;
  reward_expires_at: string;
  reward_id: string;
  reward_kind: string;
  reward_revealed_at: string | null;
  reward_state: string;
  row_reference: string;
}

interface SummaryRow {
  reward_expires_at: string;
  reward_id: string;
  reward_kind: string;
  reward_revealed_at: string | null;
  reward_state: string;
}

interface RevocationRow extends SummaryRow {
  row_reference: string;
}

interface RevealRow extends SummaryRow {
  secret_ciphertext: string;
  secret_digest: string;
  secret_iv: string;
  secret_tag: string;
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

async function assignReward(
  database: PGlite,
  {
    digest,
    requestId,
    rowReference,
    secret = { ciphertext, iv, tag },
  }: {
    digest: string;
    requestId: string;
    rowReference: string;
    secret?: {
      ciphertext: string;
      iv: string;
      tag: string;
    };
  },
) {
  return onlyRow<AssignmentRow>(
    database,
    `
      select *
      from public.assign_partner_reward(
        $1::uuid,
        $2::uuid,
        $3::text,
        'claude-pro-gift'::text,
        $4::text,
        $5::text,
        $6::text,
        $7::text,
        '2099-01-01T00:00:00Z'::timestamptz
      );
    `,
    [
      adminId,
      requestId,
      rowReference,
      secret.ciphertext,
      secret.iv,
      secret.tag,
      digest,
    ],
  );
}

async function redeem(
  database: PGlite,
  userId: string,
  codeHash: string,
) {
  return onlyRow<{ code_id: string }>(
    database,
    `
      select code_id
      from public.redeem_campaign_code(
        $1::uuid,
        $2::text,
        $3::text
      );
    `,
    [userId, codeHash, `redeem-${userId}`],
  );
}

describe("partner reward migration", () => {
  it(
    "keeps Claude gift envelopes service-only and owner-bound",
    async () => {
      const database = new PGlite({
        extensions: { pgcrypto },
      });

      try {
        await database.exec(bootstrapSql);
        for (const migrationName of migrationNames) {
          const migration = await readFile(
            path.join(
              process.cwd(),
              "supabase/migrations",
              migrationName,
            ),
            "utf8",
          );
          await database.exec(migration);
        }

        await database.query(
          `
            insert into auth.users (id)
            values
              ($1::uuid),
              ($2::uuid),
              ($3::uuid),
              ($4::uuid),
              ($5::uuid);
          `,
          [
            adminId,
            regularOwnerId,
            rewardOwnerId,
            expiredOwnerId,
            otherUserId,
          ],
        );
        await database.query(
          `
            update public.profiles
            set campaign_role = 'admin'
            where id = $1::uuid;
          `,
          [adminId],
        );

        const batch = await onlyRow<{ id: string }>(
          database,
          `
            insert into public.promo_batches (
              name,
              source,
              code_count,
              status,
              created_by,
              expires_at,
              activated_at
            )
            values (
              'Partner reward integration',
              'soft-test',
              4,
              'active',
              $1::uuid,
              pg_catalog.clock_timestamp() + interval '14 days',
              pg_catalog.clock_timestamp()
            )
            returning id;
          `,
          [adminId],
        );
        await database.query(
          `
            insert into public.promo_codes (
              batch_id,
              row_reference,
              code_hash,
              state,
              expires_at
            )
            values
              (
                $1::uuid,
                $2::text,
                $3::text,
                'eligible',
                pg_catalog.clock_timestamp() + interval '14 days'
              ),
              (
                $1::uuid,
                $4::text,
                $5::text,
                'eligible',
                pg_catalog.clock_timestamp() + interval '14 days'
              ),
              (
                $1::uuid,
                $6::text,
                $7::text,
                'eligible',
                pg_catalog.clock_timestamp() + interval '14 days'
              ),
              (
                $1::uuid,
                $8::text,
                $9::text,
                'eligible',
                pg_catalog.clock_timestamp() + interval '14 days'
              );
          `,
          [
            batch.id,
            regularRowReference,
            regularCodeHash,
            rewardRowReference,
            rewardCodeHash,
            expiredRowReference,
            expiredCodeHash,
            duplicateTargetRowReference,
            duplicateTargetCodeHash,
          ],
        );

        const relationSecurity = await onlyRow<{
          relforcerowsecurity: boolean;
          relrowsecurity: boolean;
        }>(
          database,
          `
            select relrowsecurity, relforcerowsecurity
            from pg_catalog.pg_class
            where oid = 'public.partner_rewards'::regclass;
          `,
        );
        expect(relationSecurity).toEqual({
          relforcerowsecurity: true,
          relrowsecurity: true,
        });

        const privileges = await onlyRow<{
          anon_can_execute_assign: boolean;
          anon_can_execute_reveal: boolean;
          anon_can_execute_revoke: boolean;
          anon_can_execute_summary: boolean;
          anon_can_select: boolean;
          authenticated_can_execute_assign: boolean;
          authenticated_can_execute_reveal: boolean;
          authenticated_can_execute_revoke: boolean;
          authenticated_can_execute_summary: boolean;
          authenticated_can_select: boolean;
          service_can_execute_assign: boolean;
          service_can_execute_reveal: boolean;
          service_can_execute_revoke: boolean;
          service_can_execute_summary: boolean;
          service_can_select: boolean;
        }>(
          database,
          `
            select
              pg_catalog.has_table_privilege(
                'anon',
                'public.partner_rewards',
                'SELECT'
              ) as anon_can_select,
              pg_catalog.has_table_privilege(
                'authenticated',
                'public.partner_rewards',
                'SELECT'
              ) as authenticated_can_select,
              pg_catalog.has_table_privilege(
                'service_role',
                'public.partner_rewards',
                'SELECT'
              ) as service_can_select,
              pg_catalog.has_function_privilege(
                'anon',
                'public.assign_partner_reward(uuid,uuid,text,text,text,text,text,text,timestamptz)',
                'EXECUTE'
              ) as anon_can_execute_assign,
              pg_catalog.has_function_privilege(
                'anon',
                'public.get_partner_reward_summary(uuid)',
                'EXECUTE'
              ) as anon_can_execute_summary,
              pg_catalog.has_function_privilege(
                'anon',
                'public.reveal_partner_reward(uuid,uuid)',
                'EXECUTE'
              ) as anon_can_execute_reveal,
              pg_catalog.has_function_privilege(
                'anon',
                'public.revoke_partner_reward(uuid,text)',
                'EXECUTE'
              ) as anon_can_execute_revoke,
              pg_catalog.has_function_privilege(
                'authenticated',
                'public.assign_partner_reward(uuid,uuid,text,text,text,text,text,text,timestamptz)',
                'EXECUTE'
              ) as authenticated_can_execute_assign,
              pg_catalog.has_function_privilege(
                'authenticated',
                'public.get_partner_reward_summary(uuid)',
                'EXECUTE'
              ) as authenticated_can_execute_summary,
              pg_catalog.has_function_privilege(
                'authenticated',
                'public.reveal_partner_reward(uuid,uuid)',
                'EXECUTE'
              ) as authenticated_can_execute_reveal,
              pg_catalog.has_function_privilege(
                'authenticated',
                'public.revoke_partner_reward(uuid,text)',
                'EXECUTE'
              ) as authenticated_can_execute_revoke,
              pg_catalog.has_function_privilege(
                'service_role',
                'public.assign_partner_reward(uuid,uuid,text,text,text,text,text,text,timestamptz)',
                'EXECUTE'
              ) as service_can_execute_assign,
              pg_catalog.has_function_privilege(
                'service_role',
                'public.get_partner_reward_summary(uuid)',
                'EXECUTE'
              ) as service_can_execute_summary,
              pg_catalog.has_function_privilege(
                'service_role',
                'public.reveal_partner_reward(uuid,uuid)',
                'EXECUTE'
              ) as service_can_execute_reveal,
              pg_catalog.has_function_privilege(
                'service_role',
                'public.revoke_partner_reward(uuid,text)',
                'EXECUTE'
              ) as service_can_execute_revoke;
          `,
        );
        expect(privileges).toEqual({
          anon_can_execute_assign: false,
          anon_can_execute_reveal: false,
          anon_can_execute_revoke: false,
          anon_can_execute_summary: false,
          anon_can_select: false,
          authenticated_can_execute_assign: false,
          authenticated_can_execute_reveal: false,
          authenticated_can_execute_revoke: false,
          authenticated_can_execute_summary: false,
          authenticated_can_select: false,
          service_can_execute_assign: true,
          service_can_execute_reveal: true,
          service_can_execute_revoke: true,
          service_can_execute_summary: true,
          service_can_select: true,
        });

        await database.exec("set role authenticated;");
        await database.exec(
          `set request.jwt.claim.sub = '${rewardOwnerId}';`,
        );
        await expect(
          database.query("select * from public.partner_rewards;"),
        ).rejects.toThrow(/permission denied/iu);
        await expect(
          database.query(
            `
              select *
              from public.reveal_partner_reward($1::uuid, null::uuid);
            `,
            [rewardOwnerId],
          ),
        ).rejects.toThrow(/permission denied/iu);
        await database.exec("reset role;");

        await database.exec("set role service_role;");
        await expect(
          database.query(
            `
              select *
              from public.assign_partner_reward(
                $1::uuid,
                $2::uuid,
                $3::text,
                'claude-pro-gift'::text,
                $4::text,
                $5::text,
                $6::text,
                $7::text,
                '2099-01-01T00:00:00Z'::timestamptz
              );
            `,
            [
              otherUserId,
              unauthorizedRequestId,
              rewardRowReference,
              ciphertext,
              iv,
              tag,
              rewardDigest,
            ],
          ),
        ).rejects.toThrow("ADMIN_REQUIRED");
        await expect(
          database.query(
            `
              select *
              from public.revoke_partner_reward(
                $1::uuid,
                $2::text
              );
            `,
            [otherUserId, rewardRowReference],
          ),
        ).rejects.toThrow("ADMIN_REQUIRED");
        const assignment = await assignReward(database, {
          digest: rewardDigest,
          requestId: rewardRequestId,
          rowReference: rewardRowReference,
        });
        expect(assignment).toMatchObject({
          reward_kind: "claude-pro-gift",
          reward_revealed_at: null,
          reward_state: "assigned",
          row_reference: rewardRowReference,
        });
        const replayedAssignment = await assignReward(database, {
          digest: rewardDigest,
          requestId: rewardRequestId,
          rowReference: rewardRowReference,
          secret: {
            ciphertext: "QWx0ZXJuYXRlQ2lwaGVydGV4dA",
            iv: "CCCCCCCCCCCCCCCC",
            tag: "AgICAgICAgICAgICAgICAg",
          },
        });
        expect(replayedAssignment.reward_id).toBe(
          assignment.reward_id,
        );
        await expect(
          assignReward(database, {
            digest: "0".repeat(64),
            requestId: rewardRequestId,
            rowReference: rewardRowReference,
          }),
        ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
        await expect(
          database.query(
            `
              select *
              from public.reveal_partner_reward(
                $1::uuid,
                $2::uuid
              );
            `,
            [rewardOwnerId, assignment.reward_id],
          ),
        ).rejects.toThrow("PARTNER_REWARD_NOT_FOUND");

        const expiredAssignment = await assignReward(database, {
          digest: expiredRewardDigest,
          requestId: expiredRewardRequestId,
          rowReference: expiredRowReference,
        });
        await expect(
          assignReward(database, {
            digest: rewardDigest,
            requestId: duplicateRequestId,
            rowReference: duplicateTargetRowReference,
          }),
        ).rejects.toThrow(
          "PARTNER_REWARD_SECRET_ALREADY_ASSIGNED",
        );

        await redeem(
          database,
          regularOwnerId,
          regularCodeHash,
        );
        const regularSummary =
          await database.query<SummaryRow>(
            `
              select *
              from public.get_partner_reward_summary($1::uuid);
            `,
            [regularOwnerId],
          );
        expect(regularSummary.rows).toEqual([]);

        await redeem(database, rewardOwnerId, rewardCodeHash);
        const rewardSummary = await onlyRow<SummaryRow>(
          database,
          `
            select *
            from public.get_partner_reward_summary($1::uuid);
          `,
          [rewardOwnerId],
        );
        expect(rewardSummary).toMatchObject({
          reward_kind: "claude-pro-gift",
          reward_revealed_at: null,
          reward_id: assignment.reward_id,
          reward_state: "assigned",
        });

        const firstReveal = await onlyRow<RevealRow>(
          database,
          `
            select *
            from public.reveal_partner_reward(
              $1::uuid,
              $2::uuid
            );
          `,
          [rewardOwnerId, assignment.reward_id],
        );
        expect(firstReveal).toMatchObject({
          reward_id: assignment.reward_id,
          secret_ciphertext: ciphertext,
          secret_digest: rewardDigest,
          secret_iv: iv,
          secret_tag: tag,
          reward_state: "revealed",
        });
        expect(firstReveal.reward_revealed_at).not.toBeNull();

        const replayedReveal = await onlyRow<RevealRow>(
          database,
          `
            select *
            from public.reveal_partner_reward(
              $1::uuid,
              null::uuid
            );
          `,
          [rewardOwnerId],
        );
        expect(replayedReveal).toEqual(firstReveal);

        await expect(
          database.query<RevealRow>(
            `
              select *
              from public.reveal_partner_reward(
                $1::uuid,
                $2::uuid
              );
            `,
            [otherUserId, assignment.reward_id],
          ),
        ).rejects.toThrow("PARTNER_REWARD_NOT_FOUND");

        const revoked = await onlyRow<RevocationRow>(
          database,
          `
            select *
            from public.revoke_partner_reward(
              $1::uuid,
              $2::text
            );
          `,
          [adminId, rewardRowReference],
        );
        expect(revoked).toMatchObject({
          reward_id: assignment.reward_id,
          reward_state: "revoked",
          row_reference: rewardRowReference,
        });
        expect(JSON.stringify(revoked)).not.toContain(ciphertext);
        const replayedRevocation = await onlyRow<RevocationRow>(
          database,
          `
            select *
            from public.revoke_partner_reward(
              $1::uuid,
              $2::text
            );
          `,
          [adminId, rewardRowReference],
        );
        expect(replayedRevocation).toEqual(revoked);
        await expect(
          database.query<RevealRow>(
            `
              select *
              from public.reveal_partner_reward(
                $1::uuid,
                $2::uuid
              );
            `,
            [rewardOwnerId, assignment.reward_id],
          ),
        ).rejects.toThrow("PARTNER_REWARD_REVOKED");

        await database.query(
          `
            update public.partner_rewards
            set
              assigned_at =
                pg_catalog.clock_timestamp() - interval '2 days',
              expires_at =
                pg_catalog.clock_timestamp() - interval '1 day'
            where id = $1::uuid;
          `,
          [expiredAssignment.reward_id],
        );
        await redeem(database, expiredOwnerId, expiredCodeHash);
        const expiredSummary = await onlyRow<SummaryRow>(
          database,
          `
            select *
            from public.get_partner_reward_summary($1::uuid);
          `,
          [expiredOwnerId],
        );
        expect(expiredSummary.reward_state).toBe("expired");
        const expiredRevocation = await onlyRow<RevocationRow>(
          database,
          `
            select *
            from public.revoke_partner_reward(
              $1::uuid,
              $2::text
            );
          `,
          [adminId, expiredRowReference],
        );
        expect(expiredRevocation).toMatchObject({
          reward_id: expiredAssignment.reward_id,
          reward_state: "expired",
          row_reference: expiredRowReference,
        });
        await expect(
          database.query<RevealRow>(
            `
              select *
              from public.reveal_partner_reward(
                $1::uuid,
                $2::uuid
              );
            `,
            [expiredOwnerId, expiredAssignment.reward_id],
          ),
        ).rejects.toThrow("PARTNER_REWARD_EXPIRED");
        await database.exec("reset role;");

        const storedShape = await onlyRow<{
          envelope_count: number;
          raw_url_column_count: number;
        }>(
          database,
          `
            select
              (
                select pg_catalog.count(*)::integer
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'partner_rewards'
                  and column_name in (
                    'secret_ciphertext',
                    'secret_iv',
                    'secret_tag',
                    'secret_digest'
                  )
              ) as envelope_count,
              (
                select pg_catalog.count(*)::integer
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'partner_rewards'
                  and column_name ~ '(raw|plain|gift)?_?url'
              ) as raw_url_column_count;
          `,
        );
        expect(storedShape).toEqual({
          envelope_count: 4,
          raw_url_column_count: 0,
        });
      } finally {
        await database.close();
      }
    },
    60_000,
  );
});
