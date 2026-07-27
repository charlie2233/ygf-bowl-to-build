import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202607260001_campaign.sql",
  "utf8",
);

function functionDefinition(name: string): string {
  const start = sql.indexOf(
    `create or replace function public.${name}(`,
  );
  if (start < 0) {
    throw new Error(`Missing function ${name}`);
  }
  const end = sql.indexOf("\n$$;", start);
  if (end < 0) {
    throw new Error(`Missing function terminator ${name}`);
  }
  return sql.slice(start, end + 4);
}

function expectServiceRoleOnly(
  name: string,
  signature: string,
) {
  expect(sql).toMatch(
    new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\(\\s*${signature}\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`,
      "i",
    ),
  );
  expect(sql).toMatch(
    new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\(\\s*${signature}\\s*\\)\\s+to\\s+service_role\\s*;`,
      "i",
    ),
  );
  expect(sql).not.toMatch(
    new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\([^;]+\\)\\s+to\\s+(?:anon|authenticated)`,
      "i",
    ),
  );
}

describe("atomic admin inventory migration", () => {
  it("models pending inventory, non-secret row references, and durable mutation requests", () => {
    expect(sql).toMatch(
      /status text not null default 'pending'\s+check \(status in \('pending', 'active', 'closed'\)\)/i,
    );
    expect(sql).toMatch(
      /row_reference text not null[\s\S]*?\^YGF-\[23456789ABCDEFGHJKMNPQRSTUVWXYZ\]\{8\}-\[0-9\]\{4\}\$/i,
    );
    expect(sql).toMatch(
      /state text not null default 'pending'[\s\S]*?state in \('pending', 'eligible', 'redeemed', 'expired', 'revoked'\)/i,
    );
    expect(sql).toMatch(
      /create table public\.admin_inventory_mutations[\s\S]*?request_id uuid primary key[\s\S]*?operation in \('create', 'activate', 'revoke'\)[\s\S]*?request_fingerprint/i,
    );
    expect(sql).toMatch(
      /create unique index promo_codes_row_reference_idx\s+on public\.promo_codes \(row_reference\)/i,
    );
  });

  it("creates the entire batch as inert inventory in one idempotent transaction", () => {
    const body = functionDefinition(
      "create_campaign_admin_batch",
    );
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path = pg_catalog/i);
    expect(body).toContain("v_now timestamptz := pg_catalog.now()");
    expect(body).toMatch(
      /where p\.id = p_operator_id\s+and p\.campaign_role = 'admin'/i,
    );
    expect(body).toMatch(
      /from public\.admin_inventory_mutations as m[\s\S]*?where m\.request_id = p_request_id[\s\S]*?for update/i,
    );
    expect(body).toContain("IDEMPOTENCY_CONFLICT");
    expect(body).toMatch(
      /insert into public\.promo_batches[\s\S]*?'pending'/i,
    );
    expect(body).toMatch(
      /insert into public\.promo_codes[\s\S]*?row_reference[\s\S]*?code_hash[\s\S]*?'pending'[\s\S]*?with ordinality[\s\S]*?using \(ordinal\)/i,
    );
    expect(body).not.toContain(
      "insert into public.events",
    );
  });

  it("activates all claims and records distribution exactly inside the activation RPC", () => {
    const body = functionDefinition(
      "activate_campaign_admin_batch",
    );
    expect(body).toMatch(/security definer/i);
    expect(body).toContain(
      "v_now timestamptz := pg_catalog.now()",
    );
    expect(body).toMatch(
      /where p\.id = p_operator_id\s+and p\.campaign_role = 'admin'/i,
    );
    expect(body).toContain("IDEMPOTENCY_CONFLICT");
    expect(body).toMatch(
      /update public\.promo_codes as c[\s\S]*?state = 'eligible'[\s\S]*?c\.state = 'pending'/i,
    );
    expect(body).toMatch(
      /update public\.promo_batches as b[\s\S]*?status = 'active'[\s\S]*?activated_at = v_now/i,
    );
    expect(body.match(/insert into public\.events/g)).toHaveLength(
      1,
    );
    expect(body).toMatch(
      /'batch_distributed'[\s\S]*?jsonb_build_object\('count', v_batch\.code_count\)/i,
    );
  });

  it("revokes by row reference only and atomically records its audit", () => {
    const body = functionDefinition(
      "revoke_campaign_admin_code",
    );
    expect(body).toMatch(/security definer/i);
    expect(body).toContain(
      "v_now timestamptz := pg_catalog.now()",
    );
    expect(body).toMatch(
      /where p\.id = p_operator_id\s+and p\.campaign_role = 'admin'/i,
    );
    expect(body).toMatch(/p_row_reference text/i);
    expect(body).not.toMatch(/p_code_hash/i);
    expect(body).toMatch(
      /where c\.row_reference = v_row_reference\s+for update/i,
    );
    expect(body).toMatch(
      /state = 'revoked'[\s\S]*?revoked_at = v_now/i,
    );
    expect(body.match(/insert into public\.events/g)).toHaveLength(
      1,
    );
    expect(body).toContain("IDEMPOTENCY_CONFLICT");
  });

  it("keeps every inventory RPC service-role-only and removes direct authenticated writes", () => {
    expectServiceRoleOnly(
      "create_campaign_admin_batch",
      "uuid\\s*,\\s*uuid\\s*,\\s*text\\s*,\\s*text\\s*,\\s*timestamptz\\s*,\\s*text\\[\\]\\s*,\\s*text\\[\\]",
    );
    expectServiceRoleOnly(
      "activate_campaign_admin_batch",
      "uuid\\s*,\\s*uuid\\s*,\\s*uuid",
    );
    expectServiceRoleOnly(
      "revoke_campaign_admin_code",
      "uuid\\s*,\\s*uuid\\s*,\\s*text",
    );
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update)[^;]*on table public\.promo_(?:batches|codes)[^;]*to authenticated/i,
    );
    expect(sql).toMatch(
      /create policy promo_batches_admin_select[\s\S]*?for select[\s\S]*?public\.is_campaign_admin\(\)/i,
    );
    expect(sql).toMatch(
      /create policy promo_codes_admin_select[\s\S]*?for select[\s\S]*?public\.is_campaign_admin\(\)/i,
    );
  });

  it("rejects pending redemption and uses a cascade-compatible terminal session reference", () => {
    const redeem = functionDefinition("redeem_campaign_code");
    expect(redeem).toMatch(
      /elsif v_code\.state <> 'eligible' then[\s\S]*?raise exception 'CODE_NOT_FOUND'/i,
    );
    expect(sql).toMatch(
      /session_id uuid references public\.task_sessions\(id\) on delete cascade/i,
    );
    expect(sql).not.toMatch(
      /session_id uuid references public\.task_sessions\(id\) on delete set null/i,
    );
  });
});
