import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202607270002_agent_gateway.sql",
);
const admissionMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202607270004_agent_request_admission.sql",
);

describe("Agent gateway migration contract", () => {
  it("adds the digest constraint without validating legacy rows and locks lifecycle wallet-first", async () => {
    const sql = await readFile(admissionMigrationPath, "utf8");
    const lifecycle = sql.slice(
      sql.indexOf(
        "create or replace function public.enforce_agent_api_key_lifecycle_limit",
      ),
      sql.indexOf(
        "revoke all on function public.enforce_agent_api_key_lifecycle_limit",
      ),
    );

    expect(sql).toMatch(
      /add constraint agent_requests_hashed_idempotency_key[\s\S]+?not valid;/u,
    );
    expect(lifecycle).toContain("from public.wallets as w");
    expect(lifecycle).toContain("where w.id = new.wallet_id");
    expect(lifecycle).toContain("for update;");
    expect(lifecycle).not.toContain("pg_advisory_xact_lock");
    expect(lifecycle.indexOf("from public.wallets as w")).toBeLessThan(
      lifecycle.indexOf("from public.agent_api_keys as k"),
    );
  });

  it("stores only keyed digest descriptors and no plaintext key column", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const table = sql.slice(
      sql.indexOf("create table public.agent_api_keys"),
      sql.indexOf("create table public.agent_requests"),
    );

    expect(table).toContain("key_hash text not null unique");
    expect(table).toContain("hash_version smallint not null default 1");
    expect(table).toContain("key_prefix text not null");
    expect(table).toContain("key_last4 text not null");
    expect(table).not.toMatch(
      /\b(plaintext|api_key|secret|raw_key)\s+text\b/u,
    );
  });

  it("forces RLS and keeps all Agent tables service-only", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const table of [
      "agent_api_keys",
      "agent_requests",
      "agent_usage_entries",
    ]) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security;`,
      );
      expect(sql).toContain(
        `alter table public.${table} force row level security;`,
      );
      expect(sql).toContain(
        `grant all on table public.${table} to service_role;`,
      );
    }
    expect(sql).not.toMatch(
      /grant\s+(select|insert|update|delete|all)\s+on table public\.agent_[a-z_]+\s+to authenticated/iu,
    );
  });

  it("implements service-only key lifecycle functions with trusted user identity", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const signature of [
      "create_agent_api_key(",
      "list_agent_api_keys(",
      "revoke_agent_api_key(",
      "rotate_agent_api_key(",
    ]) {
      expect(sql).toContain(signature);
    }
    expect(sql).toContain(
      "grant execute on function public.list_agent_api_keys(uuid)\n  to service_role;",
    );
    expect(sql).toMatch(
      /create or replace function public\.list_agent_api_keys[\s\S]+?returns table \(\s+key_id uuid,\s+wallet_id uuid,/u,
    );
    expect(sql).not.toContain(
      "grant execute on function public.list_agent_api_keys(uuid)\n  to authenticated;",
    );
  });

  it("serializes wallet-wide admission and enforces rate, concurrency, and cost caps", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const begin = sql.slice(
      sql.indexOf(
        "create or replace function public.begin_agent_request",
      ),
      sql.indexOf(
        "create or replace function public.terminalize_agent_request",
      ),
    );

    expect(begin).toContain("-- Wallet-first locking");
    expect(begin).toContain("for update;");
    expect(begin).toContain("v_rate_count >= v_key.rpm_limit");
    expect(begin).toContain(
      "v_key_concurrency >= v_key.concurrency_limit",
    );
    expect(begin).toContain("v_wallet_concurrency >= 3");
    expect(begin).toContain(
      "+ p_provider_cost_ceiling_micro_usd > 250000",
    );
    expect(sql).toContain(
      "unique (wallet_id, idempotency_key)",
    );
  });

  it("refunds Credits while conservatively committing failed and stale provider ceilings", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const terminal = sql.slice(
      sql.indexOf(
        "create or replace function public.terminalize_agent_request",
      ),
      sql.indexOf(
        "revoke all on function public.create_agent_api_key",
      ),
    );

    expect(sql).toContain(
      "A crashed worker cannot hold wallet credits or provider budget forever.",
    );
    expect(sql).toContain("'refund'");
    expect(sql).toContain(
      "v_request.credit_ceiling - p_credits_charged",
    );
    expect(sql).toContain(
      "provider_committed_micro_usd + p_provider_cost_micro_usd",
    );
    expect(sql).toContain(
      "provider_committed_micro_usd =\n        w.provider_committed_micro_usd\n          + v_stale.provider_cost_ceiling_micro_usd",
    );
    expect(sql).toContain(
      "provider_cost_micro_usd = v_stale.provider_cost_ceiling_micro_usd",
    );
    expect(sql).toContain(
      "unique (request_id, entry_kind)",
    );
    expect(terminal).toContain(
      "p_state = 'failed'\n      and p_provider_cost_micro_usd\n        <> v_request.provider_cost_ceiling_micro_usd",
    );
    expect(terminal).toContain(
      "p_provider_cost_micro_usd\n      > v_request.provider_cost_ceiling_micro_usd",
    );
  });

  it("persists the authoritative terminal wallet balance inside completed replay payloads", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const terminal = sql.slice(
      sql.indexOf(
        "create or replace function public.terminalize_agent_request",
      ),
      sql.indexOf(
        "revoke all on function public.create_agent_api_key",
      ),
    );

    expect(terminal).toContain(
      "pg_catalog.jsonb_typeof(p_result_payload -> 'response')",
    );
    expect(terminal).toContain(
      "p_result_payload #> '{response,ygf}'",
    );
    expect(terminal).toContain(
      "pg_catalog.jsonb_set(\n          p_result_payload,\n          '{response,ygf,remaining_credits}',\n          pg_catalog.to_jsonb(v_wallet.remaining_balance),\n          true",
    );
    expect(terminal.indexOf("returning w.* into v_wallet")).toBeLessThan(
      terminal.indexOf("pg_catalog.jsonb_set("),
    );
  });

  it("stores a fingerprint and ephemeral result but no raw prompt field", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const requests = sql.slice(
      sql.indexOf("create table public.agent_requests"),
      sql.indexOf("create table public.agent_usage_entries"),
    );

    expect(requests).toContain("request_fingerprint text not null");
    expect(requests).toContain("result_expires_at timestamptz");
    expect(requests).not.toMatch(
      /\b(prompt|messages|request_body|raw_input)\s+(text|jsonb)\b/iu,
    );
  });
});
