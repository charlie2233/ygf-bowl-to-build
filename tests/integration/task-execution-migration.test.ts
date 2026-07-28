import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202607260001_campaign.sql";
const sql = readFileSync(migrationPath, "utf8");
const failureAccountingSql = readFileSync(
  "supabase/migrations/202607270003_campaign_failure_accounting.sql",
  "utf8",
);

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

  it("keeps the applied baseline unchanged and upgrades failed settlement in a later migration", () => {
    const baselineTerminal = functionBody(
      "terminalize_campaign_task_execution",
    );
    const upgradedTerminal = functionBody(
      "terminalize_campaign_task_execution",
      failureAccountingSql,
    );
    expect(baselineTerminal).toContain(
      "or p_provider_cost_micro_usd <> 0",
    );
    expect(failureAccountingSql).toContain(
      "add constraint ledger_entries_shape_v2 check",
    );
    expect(failureAccountingSql).toContain(
      "LEDGER_SHAPE_CONSTRAINT_NOT_FOUND",
    );
    expect(upgradedTerminal).not.toContain(
      "or p_provider_cost_micro_usd <> 0",
    );
    expect(upgradedTerminal).toContain(
      "provider_committed_micro_usd = provider_committed_micro_usd + p_provider_cost_micro_usd",
    );
    expect(upgradedTerminal).toContain(
      "remaining_balance = remaining_balance + case when p_state = 'failed' then 120 else 0 end",
    );
    expect(upgradedTerminal).toContain(
      "v_terminal.provider_cost_micro_usd <> p_provider_cost_micro_usd",
    );
    expect(upgradedTerminal).toContain(
      "p_state = 'failed'\n    and p_provider_cost_micro_usd <> v_reservation.provider_cost_micro_usd",
    );
    expect(
      upgradedTerminal.match(/insert into public\.task_sessions/gi) ?? [],
    ).toHaveLength(1);
    expect(
      upgradedTerminal.match(/returning \* into v_session/gi) ?? [],
    ).toHaveLength(1);
    expect(upgradedTerminal).toMatch(
      /insert into public\.task_sessions\s*\(\s*user_id, reservation_id, task_type, title, model_id, input_units,\s*output_units, provider_cost_micro_usd, status, saved_output,\s*saved_output_retained\s*\)\s*values\s*\(\s*v_execution\.user_id, v_reservation\.id, v_execution\.task_type,\s*v_task_title, v_execution\.model_id, p_input_units, p_output_units,\s*p_provider_cost_micro_usd, p_state, p_saved_output, p_saved_output is not null\s*\)/i,
    );
  });

  it("removes authenticated access to legacy spend primitives in the hardening migration", () => {
    for (const signature of [
      "reserve_campaign_spend\\(text, bigint\\)",
      "commit_campaign_spend\\(uuid, bigint, text\\)",
      "refund_campaign_spend\\(uuid, text\\)",
    ]) {
      expect(failureAccountingSql).toMatch(
        new RegExp(
          `revoke all on function public\\.${signature}\\s+from public, anon, authenticated;`,
          "i",
        ),
      );
      expect(failureAccountingSql).toMatch(
        new RegExp(
          `grant execute on function public\\.${signature}\\s+to service_role;`,
          "i",
        ),
      );
    }
    expect(failureAccountingSql).toMatch(
      /revoke all on function public\.reserve_campaign_task_spend\s*\(\s*uuid, uuid, timestamptz\s*\)\s*from public, anon, authenticated;/i,
    );
    expect(failureAccountingSql).toMatch(
      /grant execute on function public\.reserve_campaign_task_spend\s*\(\s*uuid, uuid, timestamptz\s*\)\s*to service_role;/i,
    );
  });

  it("derives task reservation identity and ceiling from the locked execution", () => {
    const reserveTask = functionBody(
      "reserve_campaign_task_spend",
      failureAccountingSql,
    );
    expect(reserveTask).toContain("p_execution_id uuid");
    expect(reserveTask).toContain("p_owner_token uuid");
    expect(reserveTask).not.toContain("p_user_id uuid");
    expect(reserveTask).not.toContain(
      "p_provider_cost_micro_usd",
    );
    expect(reserveTask).toContain("from public.task_executions as e");
    expect(reserveTask).toContain("v_execution.owner_token <> p_owner_token");
    expect(reserveTask).toContain(
      "v_execution.provider_cost_ceiling_micro_usd",
    );
    expect(reserveTask).toContain(
      "v_wallet.remaining_balance < 120",
    );
  });

  it("reclaims only pre-reservation stale tasks and conservatively fails reserved stale tasks", () => {
    const upgradedBegin = normalized(
      functionBody(
        "begin_campaign_task_execution",
        failureAccountingSql,
      ),
    );
    const staleSettlement = normalized(
      functionBody(
        "settle_stale_campaign_task_execution",
        failureAccountingSql,
      ),
    );
    expect(upgradedBegin).toContain(
      "if v_execution.lease_expires_at <= p_now then",
    );
    expect(upgradedBegin).toContain(
      "if public.settle_stale_campaign_task_execution( v_execution.id, p_user_id, p_now ) then",
    );
    expect(upgradedBegin).toContain(
      "set owner_token = p_owner_token, lease_expires_at = p_now + interval '90 seconds'",
    );
    expect(staleSettlement).toContain(
      "provider_committed_micro_usd = provider_committed_micro_usd + v_reservation.provider_cost_micro_usd",
    );
    expect(staleSettlement).toContain(
      "v_execution.user_id, 'refund', 'refunded', 120, v_reservation.provider_cost_micro_usd",
    );
    expect(staleSettlement).toContain(
      "set state = 'failed', lease_expires_at = null",
    );
    expect(staleSettlement).toContain(
      "'error', 'PROVIDER_UNAVAILABLE'",
    );
    expect(staleSettlement).toMatch(
      /if not found then .*return false;/u,
    );
    expect(upgradedBegin).toContain(
      "if v_execution.state in ('completed', 'failed') then",
    );
    const lockOrder = [
      "from public.task_executions as e",
      "from public.ledger_entries as l where l.user_id = v_execution.user_id",
      "where l.reservation_id = v_reservation.id",
      "from public.wallets as w",
      "from public.task_sessions as s",
    ].map((needle) => staleSettlement.indexOf(needle));
    expect(lockOrder.every((position) => position >= 0)).toBe(true);
    expect(lockOrder).toEqual([...lockOrder].sort((a, b) => a - b));
    expectServiceRoleOnly(
      failureAccountingSql,
      "begin_campaign_task_execution",
      "uuid\\s*,\\s*text\\s*,\\s*text\\s*,\\s*text\\s*,\\s*text\\s*,\\s*bigint\\s*,\\s*uuid\\s*,\\s*timestamptz",
    );
    expectServiceRoleOnly(
      failureAccountingSql,
      "settle_stale_campaign_task_execution",
      "uuid\\s*,\\s*uuid\\s*,\\s*timestamptz",
    );
  });

  it("settles reserved stale key A before key B admission and preserves provider-cap enforcement", () => {
    const upgradedBegin = normalized(
      functionBody(
        "begin_campaign_task_execution",
        failureAccountingSql,
      ),
    );
    const staleSettlement = normalized(
      functionBody(
        "settle_stale_campaign_task_execution",
        failureAccountingSql,
      ),
    );
    const reserveTask = normalized(
      functionBody(
        "reserve_campaign_task_spend",
        failureAccountingSql,
      ),
    );
    const sweepPosition = upgradedBegin.indexOf(
      "for v_stale_execution in select e.*",
    );
    const currentKeyPosition = upgradedBegin.indexOf(
      "select e.* into v_execution from public.task_executions as e where e.user_id = p_user_id and e.idempotency_key = p_idempotency_key",
    );

    expect(sweepPosition).toBeGreaterThanOrEqual(0);
    expect(currentKeyPosition).toBeGreaterThan(sweepPosition);
    expect(failureAccountingSql).toMatch(
      /create index task_executions_user_stale_running_idx\s+on public\.task_executions\s*\(\s*user_id,\s*lease_expires_at,\s*id\s*\)\s*where state = 'running';/iu,
    );
    expect(upgradedBegin).toContain(
      "e.user_id = p_user_id and e.state = 'running' and e.lease_expires_at <= p_now and exists",
    );
    expect(upgradedBegin).toContain(
      "l.entry_kind = 'reserve' and l.idempotency_key = e.idempotency_key and l.state = 'reserved'",
    );
    expect(upgradedBegin).toContain(
      "order by e.lease_expires_at, e.id limit 8 for update skip locked loop",
    );
    expect(upgradedBegin).toContain(
      "perform public.settle_stale_campaign_task_execution( v_stale_execution.id, p_user_id, p_now );",
    );
    expect(staleSettlement).toContain(
      "remaining_balance = remaining_balance + 120",
    );
    expect(staleSettlement).toContain(
      "provider_reserved_micro_usd = provider_reserved_micro_usd - v_reservation.provider_cost_micro_usd",
    );
    expect(staleSettlement).toContain(
      "provider_committed_micro_usd = provider_committed_micro_usd + v_reservation.provider_cost_micro_usd",
    );
    expect(staleSettlement).toContain(
      "v_reservation.provider_cost_micro_usd, 'failed', null, false",
    );
    expect(upgradedBegin).toContain(
      "if exists ( select 1 from public.task_executions as e where e.user_id = p_user_id and e.state = 'running' and e.lease_expires_at <= p_now and exists",
    );
    const remainingStalePosition = upgradedBegin.indexOf(
      "if exists ( select 1 from public.task_executions as e",
      sweepPosition,
    );
    const throttledAfterSweepPosition = upgradedBegin.indexOf(
      "null::uuid, 'throttled'::text",
      remainingStalePosition,
    );
    expect(remainingStalePosition).toBeGreaterThan(sweepPosition);
    expect(throttledAfterSweepPosition).toBeGreaterThan(
      remainingStalePosition,
    );
    expect(throttledAfterSweepPosition).toBeLessThan(
      currentKeyPosition,
    );
    expect(reserveTask).toContain(
      "v_wallet.provider_committed_micro_usd + v_wallet.provider_reserved_micro_usd + v_execution.provider_cost_ceiling_micro_usd > 250000",
    );
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
