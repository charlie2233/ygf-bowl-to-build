import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202607270005_anonymous_share_integrity.sql",
);

describe("anonymous share integrity migration", () => {
  it("keeps the one-row-per-wallet signal behind forced RLS and service role", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain(
      "create table public.share_card_generations",
    );
    expect(sql).toContain("wallet_id uuid primary key");
    expect(sql).toContain("user_id uuid not null unique");
    expect(sql).toContain(
      "alter table public.share_card_generations enable row level security;",
    );
    expect(sql).toContain(
      "alter table public.share_card_generations force row level security;",
    );
    expect(sql).toMatch(
      /revoke all on table public\.share_card_generations\s+from public, anon, authenticated;/u,
    );
    expect(sql).toContain(
      "grant all on table public.share_card_generations to service_role;",
    );
    expect(sql).toMatch(
      /revoke all on function public\.record_share_card_generation\(uuid, uuid\)\s+from public, anon, authenticated;/u,
    );
    expect(sql).toMatch(
      /grant execute on function public\.record_share_card_generation\(uuid, uuid\)\s+to service_role;/u,
    );
  });

  it("derives the event from the locked wallet and never migrates legacy events", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const body = sql.slice(
      sql.indexOf(
        "create or replace function public.record_share_card_generation",
      ),
    );

    expect(body).toContain("where w.id = p_wallet_id");
    expect(body).toContain("and w.user_id = p_user_id");
    expect(body).toContain("for update;");
    expect(body.indexOf("for update;")).toBeLessThan(
      body.indexOf("v_clock := pg_catalog.clock_timestamp();"),
    );
    expect(
      body.indexOf("v_clock := pg_catalog.clock_timestamp();"),
    ).toBeLessThan(
      body.indexOf("if v_wallet.expires_at <= v_clock then"),
    );
    expect(body).toContain("on conflict (wallet_id) do nothing");
    expect(body).toContain("'share_card_generated'");
    expect(body).toContain(
      "pg_catalog.jsonb_build_object('outcome', 'success')",
    );
    expect(sql).not.toMatch(
      /\b(update|delete|alter)\s+public\.events\b/iu,
    );
    expect(sql).not.toMatch(
      /\b(prompt|claim|code|api_key|email|ip_address)\b/iu,
    );
  });
});
