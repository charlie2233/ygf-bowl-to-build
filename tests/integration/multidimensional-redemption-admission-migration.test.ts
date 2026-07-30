// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

const migrationNames = [
  "202607260001_campaign.sql",
  "202607300001_same_account_redemption_retry.sql",
  "202607300002_same_account_redemption_retry_wallet_lock.sql",
  "202607300003_multidimensional_redemption_admission.sql",
] as const;
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202607300003_multidimensional_redemption_admission.sql",
);
const bootstrapSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema extensions;
  create table auth.users (id uuid primary key);
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

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const codeHash = "f".repeat(64);

let migration = "";

beforeAll(async () => {
  migration = await readFile(migrationPath, "utf8");
});

function functionBody(name: string) {
  const match = new RegExp(
    `create function public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`,
    "iu",
  ).exec(migration);
  expect(match?.[0]).toBeTruthy();
  return match![0].replace(/\s+/gu, " ").toLowerCase();
}

async function createMigratedDatabase() {
  const database = new PGlite({ extensions: { pgcrypto } });
  await database.exec(bootstrapSql);
  for (const migrationName of migrationNames) {
    await database.exec(
      await readFile(
        path.join(process.cwd(), "supabase/migrations", migrationName),
        "utf8",
      ),
    );
  }
  return database;
}

async function createPreV2Database() {
  const database = new PGlite({ extensions: { pgcrypto } });
  await database.exec(bootstrapSql);
  for (const migrationName of migrationNames.slice(0, -1)) {
    await database.exec(
      await readFile(
        path.join(process.cwd(), "supabase/migrations", migrationName),
        "utf8",
      ),
    );
  }
  return database;
}

function digest(index: number, fill: "a" | "c" | "d") {
  return index.toString(16).padStart(64, fill);
}

async function admitValidation(
  database: PGlite,
  index: number,
  sessionDigest = "d".repeat(64),
) {
  const result = await database.query<{ allowed: boolean }>(
    `
      select public.admit_campaign_public_validation_v2(
        $1::text,
        'v1'::text,
        'validate-code'::text,
        pg_catalog.floor(
          pg_catalog.date_part('epoch', pg_catalog.now()) / 300
        )::bigint,
        pg_catalog.to_timestamp(
          (
            pg_catalog.floor(
              pg_catalog.date_part('epoch', pg_catalog.now()) / 300
            ) + 1
          ) * 300
        ),
        $2::text,
        $3::text,
        null::text
      ) as allowed;
    `,
    [digest(index, "a"), sessionDigest, digest(index, "c")],
  );
  return result.rows[0]!.allowed;
}

async function admitRedemption(
  database: PGlite,
  index: number,
  userId = ownerId,
) {
  const result = await database.query<{
    allowed: boolean;
    attempt_id: string | null;
  }>(
    `
      select *
      from public.admit_campaign_redemption_attempt_v2(
        $1::uuid,
        $2::text,
        'v1'::text,
        'redeem'::text,
        pg_catalog.floor(
          pg_catalog.date_part('epoch', pg_catalog.now()) / 300
        )::bigint,
        pg_catalog.to_timestamp(
          (
            pg_catalog.floor(
              pg_catalog.date_part('epoch', pg_catalog.now()) / 300
            ) + 1
          ) * 300
        ),
        $3::text,
        $4::text
      );
    `,
    [
      userId,
      digest(index, "a"),
      digest(index, "d"),
      "c".repeat(64),
    ],
  );
  return result.rows[0]!;
}

describe("multidimensional redemption admission migration", () => {
  it("uses versioned, write-bounded functions with sorted locks and reviewed limits", () => {
    const validation = functionBody(
      "admit_campaign_public_validation_v2",
    );
    expect(validation).toContain(
      "select distinct candidate.lock_key from pg_catalog.unnest",
    );
    expect(validation).toContain("order by candidate.lock_key");
    expect(validation).toContain("v_signal_admitted_count < 300");
    expect(validation).toContain("v_session_admitted_count < 12");
    expect(validation).toContain("v_code_admitted_count < 20");
    expect(validation).toContain("v_account_admitted_count < 10");
    expect(validation).toContain(
      "'ygf:public-validation:signal:' || p_signal_version || ':' || p_signal_purpose",
    );
    expect(validation).toContain(
      "'ygf:public-validation:session:v2:'",
    );
    expect(validation).not.toContain("delete from");
    expect(validation).not.toContain("skip locked");

    const redemption = functionBody(
      "admit_campaign_redemption_attempt_v2",
    );
    expect(redemption).toContain(
      "select distinct candidate.lock_key from pg_catalog.unnest",
    );
    expect(redemption).toContain("order by candidate.lock_key");
    expect(redemption).toContain("v_user_admitted_count < 5");
    expect(redemption).toContain("v_signal_admitted_count < 200");
    expect(redemption).toContain("v_session_admitted_count < 5");
    expect(redemption).toContain("v_code_admitted_count < 10");
    expect(redemption).toContain("'ygf:redemption:user:v1:'");
    expect(redemption).toContain(
      "'ygf:redemption:signal:' || p_signal_version || ':' || p_signal_purpose",
    );
    expect(redemption).toContain("'ygf:redemption:session:v2:'");
    expect(redemption).toContain("'ygf:redemption:code:v2:'");
    expect(redemption).toContain(
      "v_now + interval '1 hour'",
    );
    expect(redemption).not.toContain("delete from");
    expect(redemption).not.toContain("skip locked");

    expect(migration).not.toMatch(
      /drop function public\.admit_campaign_(?:public_validation|redemption_attempt)/iu,
    );
    expect(migration).toContain("not valid");
    expect(migration).toContain("validate constraint");
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration).toContain("set local statement_timeout = '120s'");
    expect(migration).toContain("limit 10001");
  });

  it(
    "rolls back cleanly and removes customized default EXECUTE grants before exposing v2",
    async () => {
      const database = await createPreV2Database();
      try {
        await database.exec(`
          create role shadow_executor nologin;
          create role shadow_inheritor nologin
            in role shadow_executor;
          alter default privileges for role postgres in schema public
            grant execute on functions to shadow_executor
            with grant option;
          grant execute on function
            public.admit_campaign_public_validation(
              text,
              text,
              text,
              bigint,
              timestamptz
            ),
            public.admit_campaign_redemption_attempt(
              uuid,
              text,
              text,
              text,
              bigint,
              timestamptz
            ),
            public.finish_campaign_redemption_attempt(uuid, text),
            public.redeem_campaign_code(uuid, text, text)
          to shadow_executor with grant option;
        `);

        await database.exec("begin;");
        await expect(
          database.exec(`${migration}\nselect 1 / 0;`),
        ).rejects.toThrow();
        await database.exec("rollback;");

        const rolledBack = await database.query<{
          legacy_redemption: string | null;
          legacy_validation: string | null;
          shadow_legacy_redemption: boolean;
          shadow_legacy_validation: boolean;
          v2_redemption: string | null;
          v2_validation: string | null;
        }>(`
          select
            pg_catalog.to_regprocedure(
              'public.admit_campaign_public_validation(text,text,text,bigint,timestamptz)'
            )::text as legacy_validation,
            pg_catalog.to_regprocedure(
              'public.admit_campaign_redemption_attempt(uuid,text,text,text,bigint,timestamptz)'
            )::text as legacy_redemption,
            pg_catalog.to_regprocedure(
              'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)'
            )::text as v2_validation,
            pg_catalog.to_regprocedure(
              'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)'
            )::text as v2_redemption,
            pg_catalog.has_function_privilege(
              'shadow_executor',
              'public.admit_campaign_public_validation(text,text,text,bigint,timestamptz)',
              'EXECUTE'
            ) as shadow_legacy_validation,
            pg_catalog.has_function_privilege(
              'shadow_executor',
              'public.admit_campaign_redemption_attempt(uuid,text,text,text,bigint,timestamptz)',
              'EXECUTE'
            ) as shadow_legacy_redemption;
        `);
        expect(rolledBack.rows[0]?.legacy_validation).not.toBeNull();
        expect(rolledBack.rows[0]?.legacy_redemption).not.toBeNull();
        expect(rolledBack.rows[0]?.v2_validation).toBeNull();
        expect(rolledBack.rows[0]?.v2_redemption).toBeNull();
        expect(rolledBack.rows[0]?.shadow_legacy_validation).toBe(
          true,
        );
        expect(rolledBack.rows[0]?.shadow_legacy_redemption).toBe(
          true,
        );

        await database.exec(migration);

        const directExecuteAcl = await database.query<{
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
          join pg_catalog.pg_namespace as n
            on n.oid = p.pronamespace
          cross join lateral pg_catalog.aclexplode(
            coalesce(
              p.proacl,
              pg_catalog.acldefault('f'::"char", p.proowner)
            )
          ) as acl_entry
          left join pg_catalog.pg_roles as r
            on r.oid = acl_entry.grantee
          where n.nspname = 'public'
            and p.proname in (
              'admit_campaign_public_validation',
              'admit_campaign_public_validation_v2',
              'admit_campaign_redemption_attempt',
              'admit_campaign_redemption_attempt_v2',
              'finish_campaign_redemption_attempt',
              'redeem_campaign_code'
            )
            and acl_entry.privilege_type = 'EXECUTE'
          group by p.proname
          order by p.proname;
        `);
        expect(directExecuteAcl.rows.map((row) => row.function_name)).toEqual(
          [
            "admit_campaign_public_validation",
            "admit_campaign_public_validation_v2",
            "admit_campaign_redemption_attempt",
            "admit_campaign_redemption_attempt_v2",
            "finish_campaign_redemption_attempt",
            "redeem_campaign_code",
          ],
        );
        expect(
          directExecuteAcl.rows.every(
            (row) =>
              row.exact_grantees &&
              row.execute_grants === 2 &&
              row.owner_grants === 1 &&
              row.service_grants === 1,
          ),
        ).toBe(true);

        const shadowAccess = await database.query<{
          finish: boolean;
          inherited_redemption: boolean;
          inherited_validation: boolean;
          legacy_redemption: boolean;
          legacy_validation: boolean;
          redeem: boolean;
          redemption: boolean;
          validation: boolean;
        }>(`
          select
            pg_catalog.has_function_privilege(
              'shadow_executor',
              'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)',
              'EXECUTE'
            ) as validation,
            pg_catalog.has_function_privilege(
              'shadow_executor',
              'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)',
              'EXECUTE'
            ) as redemption,
            pg_catalog.has_function_privilege(
              'shadow_inheritor',
              'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)',
              'EXECUTE'
            ) as inherited_validation,
            pg_catalog.has_function_privilege(
              'shadow_inheritor',
              'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)',
              'EXECUTE'
            ) as inherited_redemption,
            pg_catalog.has_function_privilege(
              'shadow_executor',
              'public.admit_campaign_public_validation(text,text,text,bigint,timestamptz)',
              'EXECUTE'
            ) as legacy_validation,
            pg_catalog.has_function_privilege(
              'shadow_executor',
              'public.admit_campaign_redemption_attempt(uuid,text,text,text,bigint,timestamptz)',
              'EXECUTE'
            ) as legacy_redemption,
            pg_catalog.has_function_privilege(
              'shadow_executor',
              'public.finish_campaign_redemption_attempt(uuid,text)',
              'EXECUTE'
            ) as finish,
            pg_catalog.has_function_privilege(
              'shadow_executor',
              'public.redeem_campaign_code(uuid,text,text)',
              'EXECUTE'
            ) as redeem;
        `);
        expect(shadowAccess.rows[0]).toEqual({
          finish: false,
          inherited_redemption: false,
          inherited_validation: false,
          legacy_redemption: false,
          legacy_validation: false,
          redeem: false,
          redemption: false,
          validation: false,
        });
      } finally {
        await database.close();
      }
    },
    120_000,
  );

  it(
    "applies the full retry/admission chain with v1 rollback compatibility and hardened v2 ACLs",
    async () => {
      const database = await createMigratedDatabase();
      try {
        const functions = await database.query<{
          anon_redemption_v2: boolean;
          anon_validation_v2: boolean;
          authenticated_redemption_v2: boolean;
          authenticated_validation_v2: boolean;
          legacy_redemption: string | null;
          legacy_validation: string | null;
          service_legacy_redemption: boolean;
          service_legacy_validation: boolean;
          service_redemption_v2: boolean;
          service_validation_v2: boolean;
          v2_redemption: string | null;
          v2_validation: string | null;
        }>(`
          select
            pg_catalog.to_regprocedure(
              'public.admit_campaign_public_validation(text,text,text,bigint,timestamptz)'
            )::text as legacy_validation,
            pg_catalog.to_regprocedure(
              'public.admit_campaign_redemption_attempt(uuid,text,text,text,bigint,timestamptz)'
            )::text as legacy_redemption,
            pg_catalog.to_regprocedure(
              'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)'
            )::text as v2_validation,
            pg_catalog.to_regprocedure(
              'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)'
            )::text as v2_redemption,
            pg_catalog.has_function_privilege(
              'anon',
              'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)',
              'EXECUTE'
            ) as anon_validation_v2,
            pg_catalog.has_function_privilege(
              'authenticated',
              'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)',
              'EXECUTE'
            ) as authenticated_validation_v2,
            pg_catalog.has_function_privilege(
              'anon',
              'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)',
              'EXECUTE'
            ) as anon_redemption_v2,
            pg_catalog.has_function_privilege(
              'authenticated',
              'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)',
              'EXECUTE'
            ) as authenticated_redemption_v2,
            pg_catalog.has_function_privilege(
              'service_role',
              'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)',
              'EXECUTE'
            ) as service_validation_v2,
            pg_catalog.has_function_privilege(
              'service_role',
              'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)',
              'EXECUTE'
            ) as service_redemption_v2,
            pg_catalog.has_function_privilege(
              'service_role',
              'public.admit_campaign_public_validation(text,text,text,bigint,timestamptz)',
              'EXECUTE'
            ) as service_legacy_validation,
            pg_catalog.has_function_privilege(
              'service_role',
              'public.admit_campaign_redemption_attempt(uuid,text,text,text,bigint,timestamptz)',
              'EXECUTE'
            ) as service_legacy_redemption;
        `);
        expect(functions.rows[0]).toMatchObject({
          anon_redemption_v2: false,
          anon_validation_v2: false,
          authenticated_redemption_v2: false,
          authenticated_validation_v2: false,
          service_legacy_redemption: true,
          service_legacy_validation: true,
          service_redemption_v2: true,
          service_validation_v2: true,
        });
        expect(functions.rows[0]?.legacy_validation).not.toBeNull();
        expect(functions.rows[0]?.legacy_redemption).not.toBeNull();
        expect(functions.rows[0]?.v2_validation).not.toBeNull();
        expect(functions.rows[0]?.v2_redemption).not.toBeNull();

        const lockDefinitions = await database.query<{
          legacy_redemption: string;
          legacy_validation: string;
          v2_redemption: string;
          v2_validation: string;
        }>(`
          select
            pg_catalog.pg_get_functiondef(
              'public.admit_campaign_public_validation(text,text,text,bigint,timestamptz)'::regprocedure
            ) as legacy_validation,
            pg_catalog.pg_get_functiondef(
              'public.admit_campaign_redemption_attempt(uuid,text,text,text,bigint,timestamptz)'::regprocedure
            ) as legacy_redemption,
            pg_catalog.pg_get_functiondef(
              'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)'::regprocedure
            ) as v2_validation,
            pg_catalog.pg_get_functiondef(
              'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)'::regprocedure
            ) as v2_redemption;
        `);
        const normalizedDefinitions = Object.fromEntries(
          Object.entries(lockDefinitions.rows[0]!).map(
            ([name, definition]) => [
              name,
              definition.replace(/\s+/gu, " ").toLowerCase(),
            ],
          ),
        );
        expect(normalizedDefinitions.legacy_validation).toContain(
          "'ygf:public-validation:signal:' || p_signal_version || ':' || p_signal_purpose",
        );
        expect(normalizedDefinitions.v2_validation).toContain(
          "'ygf:public-validation:signal:' || p_signal_version || ':' || p_signal_purpose",
        );
        expect(normalizedDefinitions.legacy_redemption).toContain(
          "'ygf:redemption:user:v1:'",
        );
        expect(normalizedDefinitions.v2_redemption).toContain(
          "'ygf:redemption:user:v1:'",
        );
        expect(normalizedDefinitions.legacy_redemption).toContain(
          "'ygf:redemption:signal:' || p_signal_version || ':' || p_signal_purpose",
        );
        expect(normalizedDefinitions.v2_redemption).toContain(
          "'ygf:redemption:signal:' || p_signal_version || ':' || p_signal_purpose",
        );

        const schemaObjects = await database.query<{
          constraints_validated: number;
          hardened_functions: number;
          indexes_valid: number;
        }>(`
          select
            (
              select pg_catalog.count(*)::integer
              from pg_catalog.pg_proc as p
              join pg_catalog.pg_namespace as n
                on n.oid = p.pronamespace
              join pg_catalog.pg_roles as r
                on r.oid = p.proowner
              where n.nspname = 'public'
                and p.proname in (
                  'admit_campaign_public_validation_v2',
                  'admit_campaign_redemption_attempt_v2'
                )
                and p.prosecdef
                and r.rolname = 'postgres'
                and p.proconfig::text like '%search_path=pg_catalog%'
            ) as hardened_functions,
            (
              select pg_catalog.count(*)::integer
              from pg_catalog.pg_constraint as c
              where c.conname in (
                'public_validation_attempts_session_digest_check',
                'public_validation_attempts_code_digest_check',
                'public_validation_attempts_account_digest_check',
                'redemption_attempts_session_digest_check',
                'redemption_attempts_code_digest_check'
              )
                and c.convalidated
            ) as constraints_validated,
            (
              select pg_catalog.count(*)::integer
              from pg_catalog.pg_class as i
              join pg_catalog.pg_index as x on x.indexrelid = i.oid
              where i.relname in (
                'public_validation_attempts_session_bucket_idx',
                'public_validation_attempts_code_bucket_idx',
                'public_validation_attempts_account_bucket_idx',
                'redemption_attempts_session_bucket_idx',
                'redemption_attempts_code_bucket_idx'
              )
                and x.indisready
                and x.indisvalid
            ) as indexes_valid;
        `);
        expect(schemaObjects.rows[0]).toEqual({
          constraints_validated: 5,
          hardened_functions: 2,
          indexes_valid: 5,
        });
      } finally {
        await database.close();
      }
    },
    120_000,
  );

  it(
    "keeps expired backlog untouched on denied calls and retains admitted attempts across the next bucket",
    async () => {
      const database = await createMigratedDatabase();
      try {
        await database.query(
          "insert into auth.users (id) values ($1::uuid);",
          [ownerId],
        );
        await database.exec(`
          insert into public.public_validation_attempts (
            signal_digest,
            signal_version,
            signal_purpose,
            signal_bucket,
            allowed,
            created_at,
            expires_at
          )
          select
            repeat('e', 64),
            'v1',
            'validate-code',
            current_bucket - 1,
            true,
            pg_catalog.to_timestamp(current_bucket * 300) - interval '1 second',
            pg_catalog.to_timestamp(current_bucket * 300)
          from (
            select pg_catalog.floor(
              pg_catalog.date_part('epoch', pg_catalog.now()) / 300
            )::bigint as current_bucket
          ) as clock;

          insert into public.redemption_attempts (
            user_id,
            signal_digest,
            signal_version,
            signal_purpose,
            signal_bucket,
            outcome,
            created_at,
            finalized_at,
            expires_at
          )
          select
            '${ownerId}'::uuid,
            repeat('e', 64),
            'v1',
            'redeem',
            current_bucket - 1,
            'invalid',
            pg_catalog.to_timestamp(current_bucket * 300) - interval '1 second',
            pg_catalog.to_timestamp(current_bucket * 300) - interval '1 second',
            pg_catalog.to_timestamp(current_bucket * 300)
          from (
            select pg_catalog.floor(
              pg_catalog.date_part('epoch', pg_catalog.now()) / 300
            )::bigint as current_bucket
          ) as clock;
        `);

        const validationResults = [];
        for (let index = 0; index < 13; index += 1) {
          validationResults.push(await admitValidation(database, index));
        }
        expect(validationResults.slice(0, 12).every(Boolean)).toBe(true);
        expect(validationResults[12]).toBe(false);

        const redemptionResults = [];
        for (let index = 0; index < 6; index += 1) {
          redemptionResults.push(await admitRedemption(database, index));
        }
        expect(
          redemptionResults.slice(0, 5).every((row) => row.allowed),
        ).toBe(true);
        expect(redemptionResults[5]).toEqual({
          allowed: false,
          attempt_id: null,
        });

        const counts = await database.query<{
          expired_redemptions: number;
          expired_validations: number;
          redemption_count: number;
          validation_count: number;
        }>(`
          select
            (
              select count(*)::integer
              from public.public_validation_attempts
            ) as validation_count,
            (
              select count(*)::integer
              from public.redemption_attempts
            ) as redemption_count,
            (
              select count(*)::integer
              from public.public_validation_attempts
              where expires_at <= pg_catalog.now()
            ) as expired_validations,
            (
              select count(*)::integer
              from public.redemption_attempts
              where expires_at <= pg_catalog.now()
            ) as expired_redemptions;
        `);
        expect(counts.rows[0]).toEqual({
          expired_redemptions: 1,
          expired_validations: 1,
          redemption_count: 6,
          validation_count: 13,
        });

        const retainedAttemptId =
          redemptionResults[0]!.attempt_id as string;
        const retention = await database.query<{
          retention_seconds: number;
        }>(
          `
            select pg_catalog.date_part(
              'epoch',
              a.expires_at - a.created_at
            )::integer as retention_seconds
            from public.redemption_attempts as a
            where a.id = $1::uuid;
          `,
          [retainedAttemptId],
        );
        expect(retention.rows[0]?.retention_seconds).toBe(3_600);

        await database.query(
          `
            delete from public.redemption_attempts as a
            where a.expires_at <= pg_catalog.to_timestamp(
              ((a.signal_bucket + 2) * 300)::double precision
            );
          `,
        );
        await database.query(
          `
            select public.finish_campaign_redemption_attempt(
              $1::uuid,
              'accepted'::text
            );
          `,
          [retainedAttemptId],
        );
        const finalized = await database.query<{
          outcome: string;
        }>(
          "select outcome from public.redemption_attempts where id = $1::uuid;",
          [retainedAttemptId],
        );
        expect(finalized.rows[0]?.outcome).toBe("accepted");
      } finally {
        await database.close();
      }
    },
    120_000,
  );

  it(
    "keeps same-owner retries idempotent through five admitted attempts and denies the sixth",
    async () => {
      const database = await createMigratedDatabase();
      try {
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
              'v2 retry test',
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
              'YGF-ABCDEFGH-0001',
              $1::text,
              'eligible'
            from public.promo_batches;
          `,
          [codeHash],
        );

        for (let index = 0; index < 5; index += 1) {
          await expect(
            admitRedemption(database, index),
          ).resolves.toMatchObject({ allowed: true });
          const result = await database.query<{
            remaining_balance: number;
          }>(
            `
              select remaining_balance
              from public.redeem_campaign_code(
                $1::uuid,
                $2::text,
                $3::text
              );
            `,
            [ownerId, codeHash, `same-owner-${index}`],
          );
          expect(result.rows[0]?.remaining_balance).toBe(3_000);
        }

        await expect(
          admitRedemption(database, 5),
        ).resolves.toEqual({ allowed: false, attempt_id: null });
        const durableState = await database.query<{
          grants: number;
          wallets: number;
        }>(`
          select
            (
              select count(*)::integer
              from public.ledger_entries
              where entry_kind = 'grant'
            ) as grants,
            (
              select count(*)::integer
              from public.wallets
            ) as wallets;
        `);
        expect(durableState.rows[0]).toEqual({
          grants: 1,
          wallets: 1,
        });
      } finally {
        await database.close();
      }
    },
    120_000,
  );
});
