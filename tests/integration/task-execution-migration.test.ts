import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202607260001_campaign.sql";
const sql = readFileSync(migrationPath, "utf8");

function functionBody(name: string, candidateSql = sql) {
  const start = candidateSql.search(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b`,
      "i",
    ),
  );
  const end = candidateSql.indexOf("$$;", start);
  return start === -1 || end === -1
    ? ""
    : candidateSql.slice(start, end + 3);
}

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function expectServiceRoleOnly(
  candidateSql: string,
  name: string,
  signature: string,
) {
  expect(candidateSql).toMatch(
    new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\(\\s*${signature}\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`,
      "i",
    ),
  );
  const grants =
    candidateSql.match(
      new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\([^;]+;`,
        "gi",
      ),
    ) ?? [];
  expect(grants).toHaveLength(1);
  expect(grants[0]).toMatch(
    new RegExp(
      `public\\.${name}\\s*\\(\\s*${signature}\\s*\\)\\s+to\\s+service_role\\s*;`,
      "i",
    ),
  );
  expect(grants[0]).not.toMatch(/\b(?:anon|authenticated)\b/i);
}

function assertExecutionBoundary(candidateSql: string) {
  const begin = normalized(
    functionBody("begin_campaign_task_execution", candidateSql),
  );
  const terminalize = normalized(
    functionBody(
      "terminalize_campaign_task_execution",
      candidateSql,
    ),
  );
  const reserve = normalized(
    functionBody("reserve_campaign_spend", candidateSql),
  );
  const commit = normalized(
    functionBody("commit_campaign_spend", candidateSql),
  );
  const refund = normalized(
    functionBody("refund_campaign_spend", candidateSql),
  );

  expect(candidateSql).toMatch(
    /create table public\.task_executions\s*\(/i,
  );
  expect(candidateSql).toMatch(
    /unique\s*\(\s*user_id\s*,\s*idempotency_key\s*\)/i,
  );
  expect(candidateSql).toMatch(
    /alter table public\.task_executions enable row level security;/i,
  );
  expect(candidateSql).toMatch(
    /alter table public\.task_executions force row level security;/i,
  );
  expect(candidateSql).toMatch(
    /revoke all on table public\.task_executions from anon, authenticated;/i,
  );
  expect(candidateSql).not.toMatch(
    /grant\s+[^;]+\s+on\s+table\s+public\.task_executions\s+to\s+(?:anon|authenticated)/i,
  );

  expect(begin).toContain(
    "perform pg_catalog.pg_advisory_xact_lock(v_user_lock_key);",
  );
  expect(begin).toContain(
    "where e.user_id = p_user_id and e.created_at >= p_now - interval '1 minute'",
  );
  expect(begin).toContain("if v_recent_count >= 8 then");
  expect(begin).toContain("'throttled'::text");
  expect(begin).toContain(
    "v_execution.request_fingerprint <> p_request_fingerprint",
  );
  expect(begin).toContain(
    "raise exception 'IDEMPOTENCY_CONFLICT'",
  );
  expect(begin).toContain(
    "v_execution.lease_expires_at <= p_now",
  );
  expect(begin).toContain(
    "lease_expires_at = p_now + interval '90 seconds'",
  );
  expect(begin).toContain("limit 100 for update skip locked");
  expect(begin).not.toMatch(/\b(?:prompt|input_payload|raw_input)\b/i);

  expect(terminalize).toContain(
    "from public.task_executions as e where e.id = p_execution_id for update;",
  );
  expect(terminalize).toContain(
    "v_execution.owner_token <> p_owner_token",
  );
  expect(terminalize).toContain(
    "l.user_id = v_execution.user_id and l.entry_kind = 'reserve' for update;",
  );
  expect(terminalize).toContain(
    "v_reservation.idempotency_key <> v_execution.idempotency_key",
  );
  expect(terminalize).toContain(
    "v_reservation.provider_cost_micro_usd <> v_execution.provider_cost_ceiling_micro_usd",
  );
  expect(terminalize).toContain(
    "p_provider_cost_micro_usd > v_reservation.provider_cost_micro_usd",
  );
  expect(terminalize).toContain(
    "provider_committed_micro_usd = provider_committed_micro_usd + p_provider_cost_micro_usd",
  );
  expect(terminalize).toContain(
    "remaining_balance = remaining_balance + 120",
  );
  expect(terminalize).toContain(
    "insert into public.ledger_entries",
  );
  expect(terminalize).toContain(
    "insert into public.task_sessions",
  );
  expect(terminalize).toContain(
    "values ( v_execution.user_id, v_reservation.id, v_execution.task_type, v_task_title, v_execution.model_id",
  );
  expect(terminalize).toContain(
    "update public.task_executions as e set state = p_state",
  );
  expect(terminalize).toContain(
    "if v_execution.state in ('completed', 'failed') then",
  );
  expect(terminalize).toContain(
    "v_execution.session_id <> v_session.id",
  );
  expect(terminalize).toContain(
    "v_execution.remaining_credits <> v_terminal.balance_after",
  );
  expect(terminalize).toContain(
    "v_execution.result_payload is not null and v_execution.result_payload is distinct from p_result_payload",
  );
  expect(terminalize).toContain(
    "result_expires_at = v_clock + interval '15 minutes'",
  );
  expect(candidateSql).toMatch(
    /result_expires_at\s*>=\s*created_at\s+and\s+result_expires_at\s*<=\s*updated_at\s*\+\s*interval '15 minutes'/i,
  );
  expect(terminalize).toContain(
    "pg_catalog.octet_length(p_result_payload::text) not between 2 and 50000",
  );
  expect(terminalize).not.toMatch(
    /\b(?:prompt|input_payload|raw_input)\b/i,
  );
  expect(terminalize).not.toMatch(
    /\b(?:commit_campaign_spend|refund_campaign_spend)\s*\(/i,
  );
  expect(
    reserve.match(
      /if v_prior\.state <> 'reserved' then raise exception 'SPEND_STATE_INVALID'/g,
    ),
  ).toHaveLength(2);
  for (const legacyTerminal of [commit, refund]) {
    expect(legacyTerminal).toContain(
      "from public.task_executions as e where e.user_id = v_user_id and e.idempotency_key = v_reservation.idempotency_key",
    );
    expect(legacyTerminal).toContain(
      "raise exception 'TASK_EXECUTION_REQUIRES_ATOMIC_TERMINALIZATION'",
    );
  }

  const lockOrder = [
    "from public.task_executions as e",
    "where l.id = p_reservation_id",
    "where l.reservation_id = v_reservation.id",
    "from public.wallets as w",
    "from public.task_sessions as s",
  ].map((needle) => terminalize.indexOf(needle));
  expect(lockOrder.every((position) => position >= 0)).toBe(true);
  expect(lockOrder).toEqual([...lockOrder].sort((a, b) => a - b));

  expectServiceRoleOnly(
    candidateSql,
    "begin_campaign_task_execution",
    "uuid\\s*,\\s*text\\s*,\\s*text\\s*,\\s*text\\s*,\\s*text\\s*,\\s*bigint\\s*,\\s*uuid\\s*,\\s*timestamptz",
  );
  expectServiceRoleOnly(
    candidateSql,
    "terminalize_campaign_task_execution",
    "uuid\\s*,\\s*uuid\\s*,\\s*uuid\\s*,\\s*text\\s*,\\s*jsonb\\s*,\\s*text\\s*,\\s*integer\\s*,\\s*integer\\s*,\\s*bigint\\s*,\\s*text\\s*,\\s*text\\s*,\\s*timestamptz",
  );
}

describe("shared task-execution migration boundary", () => {
  it("provides forced-RLS replay, lease, and per-user admission contracts", () => {
    assertExecutionBoundary(sql);
  });

  it.each([
    [
      "advisory lock",
      (value: string) =>
        value.replace(
          "perform pg_catalog.pg_advisory_xact_lock(v_user_lock_key);",
          "perform 1;",
        ),
    ],
    [
      "request limit",
      (value: string) =>
        value.replace("if v_recent_count >= 8 then", "if false then"),
    ],
    [
      "owner check",
      (value: string) =>
        value.replace(
          /v_execution\.owner_token <> p_owner_token/g,
          "false",
        ),
    ],
    [
      "reservation idempotency binding",
      (value: string) =>
        value.replace(
          "v_reservation.idempotency_key <> v_execution.idempotency_key",
          "false",
        ),
    ],
    [
      "atomic session insert",
      (value: string) =>
        value.replace(
          "insert into public.task_sessions",
          "insert into public.events",
        ),
    ],
    [
      "atomic execution terminal update",
      (value: string) =>
        value.replace(
          "update public.task_executions as e\n  set\n    state = p_state",
          "update public.events as e\n  set\n    name = p_state",
        ),
    ],
    [
      "legacy terminalization guard",
      (value: string) =>
        value.replace(
          /raise exception 'TASK_EXECUTION_REQUIRES_ATOMIC_TERMINALIZATION'/g,
          "raise exception 'SPEND_STATE_INVALID'",
        ),
    ],
    [
      "service-role grant",
      (value: string) =>
        value.replace(
          /(grant\s+execute\s+on\s+function\s+public\.terminalize_campaign_task_execution\s*\([\s\S]*?\)\s+to\s+)service_role;/i,
          "$1authenticated;",
        ),
    ],
  ])("detects removal of the %s", (_name, mutate) => {
    expect(() => assertExecutionBoundary(mutate(sql))).toThrow();
  });
});
