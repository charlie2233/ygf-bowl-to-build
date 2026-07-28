-- A provider failure after admission may still be billable. Credits return to
-- the user, while the reserved provider ceiling is moved to committed spend.
do $$
declare
  v_constraint_name text;
begin
  select c.conname
  into v_constraint_name
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.ledger_entries'::pg_catalog.regclass
    and c.contype = 'c'
    and pg_catalog.pg_get_constraintdef(c.oid) like
      '%entry_kind = ''refund''%provider_cost_micro_usd = 0%'
  limit 1;

  if v_constraint_name is null then
    raise exception 'LEDGER_SHAPE_CONSTRAINT_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  execute pg_catalog.format(
    'alter table public.ledger_entries drop constraint %I',
    v_constraint_name
  );
end;
$$;

alter table public.ledger_entries
  add constraint ledger_entries_shape_v2 check (
    (entry_kind = 'grant'
      and state = 'committed'
      and credits_delta = 3000
      and promo_code_id is not null
      and reservation_id is null)
    or
    (entry_kind = 'reserve'
      and state in ('reserved', 'committed', 'refunded')
      and credits_delta = -120
      and promo_code_id is null
      and reservation_id is null)
    or
    (entry_kind = 'commit'
      and state = 'committed'
      and credits_delta = 0
      and promo_code_id is null
      and reservation_id is not null)
    or
    (entry_kind = 'refund'
      and state = 'refunded'
      and credits_delta = 120
      and promo_code_id is null
      and reservation_id is not null)
  );

create index task_executions_user_stale_running_idx
  on public.task_executions (user_id, lease_expires_at, id)
  where state = 'running';

create or replace function public.reserve_campaign_task_spend(
  p_execution_id uuid,
  p_owner_token uuid,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  wallet_id uuid,
  remaining_balance integer,
  reserved_balance integer,
  provider_committed_micro_usd bigint,
  provider_reserved_micro_usd bigint,
  expires_at timestamptz,
  ledger_entry_id uuid,
  ledger_state text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.now();
  v_execution public.task_executions%rowtype;
  v_wallet public.wallets%rowtype;
  v_reservation public.ledger_entries%rowtype;
begin
  if p_execution_id is null
    or p_owner_token is null
    or p_now is null
    or p_now < v_clock - interval '30 seconds'
    or p_now > v_clock + interval '5 seconds' then
    raise exception 'INVALID_TASK_EXECUTION_REQUEST' using errcode = 'P0001';
  end if;

  -- Lock order matches terminalization: execution -> reservation -> wallet.
  select e.* into v_execution
  from public.task_executions as e
  where e.id = p_execution_id
  for update;
  if not found then
    raise exception 'TASK_EXECUTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_execution.owner_token <> p_owner_token
    or v_execution.state <> 'running'
    or v_execution.lease_expires_at <= p_now then
    raise exception 'TASK_EXECUTION_OWNER_MISMATCH' using errcode = 'P0001';
  end if;

  select l.* into v_reservation
  from public.ledger_entries as l
  where l.user_id = v_execution.user_id
    and l.entry_kind = 'reserve'
    and l.idempotency_key = v_execution.idempotency_key
  for update;
  if found then
    if v_reservation.state <> 'reserved'
      or v_reservation.provider_cost_micro_usd
        <> v_execution.provider_cost_ceiling_micro_usd then
      raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
    end if;
    select w.* into v_wallet
    from public.wallets as w
    where w.id = v_reservation.wallet_id
      and w.user_id = v_execution.user_id
    for update;
    if not found then
      raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
    end if;
    return query select
      v_wallet.id, v_reservation.balance_after, v_reservation.reserved_after,
      v_reservation.provider_committed_after_micro_usd,
      v_reservation.provider_reserved_after_micro_usd, v_wallet.expires_at,
      v_reservation.id, 'reserved'::text;
    return;
  end if;

  select w.* into v_wallet
  from public.wallets as w
  where w.user_id = v_execution.user_id
  for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_wallet.expires_at <= p_now then
    raise exception 'WALLET_EXPIRED' using errcode = 'P0001';
  end if;
  if v_wallet.remaining_balance < 120 then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;
  if v_wallet.provider_committed_micro_usd
      + v_wallet.provider_reserved_micro_usd
      + v_execution.provider_cost_ceiling_micro_usd > 250000 then
    raise exception 'PROVIDER_COST_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.wallets as w
  set
    remaining_balance = w.remaining_balance - 120,
    reserved_balance = w.reserved_balance + 120,
    provider_reserved_micro_usd = w.provider_reserved_micro_usd
      + v_execution.provider_cost_ceiling_micro_usd
  where w.id = v_wallet.id
  returning w.* into v_wallet;
  insert into public.ledger_entries (
    wallet_id, user_id, entry_kind, state, credits_delta,
    provider_cost_micro_usd, idempotency_key, balance_after, reserved_after,
    provider_committed_after_micro_usd, provider_reserved_after_micro_usd
  ) values (
    v_wallet.id, v_execution.user_id, 'reserve', 'reserved', -120,
    v_execution.provider_cost_ceiling_micro_usd, v_execution.idempotency_key,
    v_wallet.remaining_balance, v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd, v_wallet.provider_reserved_micro_usd
  ) returning * into v_reservation;
  return query select
    v_wallet.id, v_wallet.remaining_balance, v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd, v_wallet.provider_reserved_micro_usd,
    v_wallet.expires_at, v_reservation.id, 'reserved'::text;
end;
$$;

create or replace function public.settle_stale_campaign_task_execution(
  p_execution_id uuid,
  p_user_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.now();
  v_execution public.task_executions%rowtype;
  v_reservation public.ledger_entries%rowtype;
  v_terminal public.ledger_entries%rowtype;
  v_wallet public.wallets%rowtype;
  v_session public.task_sessions%rowtype;
  v_terminal_key text;
  v_task_title text;
begin
  if p_execution_id is null
    or p_user_id is null
    or p_now is null
    or p_now < v_clock - interval '30 seconds'
    or p_now > v_clock + interval '5 seconds' then
    raise exception 'INVALID_TASK_EXECUTION_REQUEST' using errcode = 'P0001';
  end if;

  -- A stale settlement keeps the global mutation order:
  -- execution -> reservation -> terminal -> wallet -> session.
  select e.* into v_execution
  from public.task_executions as e
  where e.id = p_execution_id
    and e.user_id = p_user_id
  for update;
  if not found
    or v_execution.state <> 'running'
    or v_execution.lease_expires_at > p_now then
    return false;
  end if;

  select l.* into v_reservation
  from public.ledger_entries as l
  where l.user_id = v_execution.user_id
    and l.entry_kind = 'reserve'
    and l.idempotency_key = v_execution.idempotency_key
  for update;
  if not found then
    -- No provider dispatch is possible before reservation, so this lease can
    -- still be reclaimed by an exact idempotent retry.
    return false;
  end if;
  if v_reservation.state <> 'reserved'
    or v_reservation.wallet_id is null
    or v_reservation.provider_cost_micro_usd
      <> v_execution.provider_cost_ceiling_micro_usd then
    raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
  end if;

  select l.* into v_terminal
  from public.ledger_entries as l
  where l.reservation_id = v_reservation.id
  for update;
  if found then
    raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
  end if;

  select w.* into v_wallet
  from public.wallets as w
  where w.id = v_reservation.wallet_id
    and w.user_id = v_execution.user_id
  for update;
  if not found
    or v_wallet.reserved_balance < 120
    or v_wallet.provider_reserved_micro_usd
      < v_reservation.provider_cost_micro_usd
    or v_wallet.remaining_balance + 120 > v_wallet.initial_balance then
    raise exception 'CREDIT_BALANCE_INVALID' using errcode = 'P0001';
  end if;

  select s.* into v_session
  from public.task_sessions as s
  where s.reservation_id = v_reservation.id
  for update;
  if found then
    raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
  end if;

  update public.wallets
  set remaining_balance = remaining_balance + 120,
    reserved_balance = reserved_balance - 120,
    provider_reserved_micro_usd = provider_reserved_micro_usd
      - v_reservation.provider_cost_micro_usd,
    provider_committed_micro_usd = provider_committed_micro_usd
      + v_reservation.provider_cost_micro_usd
  where id = v_wallet.id
  returning * into v_wallet;
  update public.ledger_entries
  set state = 'refunded'
  where id = v_reservation.id
  returning * into v_reservation;
  v_terminal_key := v_execution.id::text || ':refund';
  insert into public.ledger_entries (
    wallet_id, user_id, entry_kind, state, credits_delta,
    provider_cost_micro_usd, idempotency_key, reservation_id,
    balance_after, reserved_after, provider_committed_after_micro_usd,
    provider_reserved_after_micro_usd
  ) values (
    v_wallet.id, v_execution.user_id, 'refund', 'refunded', 120,
    v_reservation.provider_cost_micro_usd, v_terminal_key,
    v_reservation.id, v_wallet.remaining_balance,
    v_wallet.reserved_balance, v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  ) returning * into v_terminal;

  v_task_title := case v_execution.task_type
    when 'study' then 'Study help attempt'
    when 'coding' then 'Coding help attempt'
    when 'career' then 'Career help attempt'
    else 'Pick My Bowl attempt'
  end;
  insert into public.task_sessions (
    user_id, reservation_id, task_type, title, model_id, input_units,
    output_units, provider_cost_micro_usd, status, saved_output,
    saved_output_retained
  ) values (
    v_execution.user_id, v_reservation.id, v_execution.task_type,
    v_task_title, v_execution.model_id, 0, 0,
    v_reservation.provider_cost_micro_usd, 'failed', null, false
  ) returning * into v_session;
  update public.task_executions as e
  set state = 'failed', lease_expires_at = null,
    result_payload = pg_catalog.jsonb_build_object(
      'error', 'PROVIDER_UNAVAILABLE'
    ),
    result_expires_at = v_clock + interval '15 minutes',
    remaining_credits = v_wallet.remaining_balance,
    session_id = v_session.id,
    error_code = 'PROVIDER_UNAVAILABLE'
  where e.id = v_execution.id
  returning e.* into v_execution;
  return true;
end;
$$;

create or replace function public.begin_campaign_task_execution(
  p_user_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_task_type text,
  p_model_id text,
  p_provider_cost_ceiling_micro_usd bigint,
  p_owner_token uuid,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  execution_id uuid,
  execution_state text,
  owner_token uuid,
  lease_expires_at timestamptz,
  result_payload jsonb,
  result_expires_at timestamptz,
  remaining_credits integer,
  session_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.now();
  v_execution public.task_executions%rowtype;
  v_stale_execution public.task_executions%rowtype;
  v_recent_count integer;
  v_user_lock_key bigint;
begin
  if p_user_id is null
    or p_owner_token is null
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 128
    or p_request_fingerprint is null
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_task_type is null
    or p_task_type not in ('study', 'coding', 'career', 'pick-my-bowl')
    or p_model_id is null
    or char_length(p_model_id) not between 1 and 200
    or p_provider_cost_ceiling_micro_usd is null
    or p_provider_cost_ceiling_micro_usd not between 0 and 250000
    or p_now is null
    or p_now < v_clock - interval '30 seconds'
    or p_now > v_clock + interval '5 seconds' then
    raise exception 'INVALID_TASK_EXECUTION_REQUEST' using errcode = 'P0001';
  end if;

  with expired as (
    select e.id
    from public.task_executions as e
    where e.result_payload is not null
      and e.result_expires_at <= p_now
    order by e.result_expires_at, e.id
    limit 100
    for update skip locked
  )
  update public.task_executions as e
  set result_payload = null
  where e.id in (select expired.id from expired);

  v_user_lock_key := pg_catalog.hashtextextended(
    p_user_id::text || ':task-execution',
    0
  );
  perform pg_catalog.pg_advisory_xact_lock(v_user_lock_key);

  -- Later traffic for this user drains a bounded set of already-reserved
  -- stale executions before a new idempotency key can reserve more spend.
  -- Rows owned by an active terminalizer are skipped instead of contended.
  for v_stale_execution in
    select e.*
    from public.task_executions as e
    where e.user_id = p_user_id
      and e.state = 'running'
      and e.lease_expires_at <= p_now
      and exists (
        select 1
        from public.ledger_entries as l
        where l.user_id = e.user_id
          and l.entry_kind = 'reserve'
          and l.idempotency_key = e.idempotency_key
          and l.state = 'reserved'
      )
    order by e.lease_expires_at, e.id
    limit 8
    for update skip locked
  loop
    perform public.settle_stale_campaign_task_execution(
      v_stale_execution.id,
      p_user_id,
      p_now
    );
  end loop;

  -- Never admit fresh spend while a bounded sweep left an older reserved
  -- execution behind. A retry drains the next batch before reconsidering the
  -- current key.
  if exists (
    select 1
    from public.task_executions as e
    where e.user_id = p_user_id
      and e.state = 'running'
      and e.lease_expires_at <= p_now
      and exists (
        select 1
        from public.ledger_entries as l
        where l.user_id = e.user_id
          and l.entry_kind = 'reserve'
          and l.idempotency_key = e.idempotency_key
          and l.state = 'reserved'
      )
  ) then
    return query select
      null::uuid, 'throttled'::text, null::uuid, null::timestamptz,
      null::jsonb, null::timestamptz, null::integer, null::uuid, null::text;
    return;
  end if;

  select e.* into v_execution
  from public.task_executions as e
  where e.user_id = p_user_id
    and e.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_execution.request_fingerprint <> p_request_fingerprint
      or v_execution.task_type <> p_task_type
      or v_execution.model_id <> p_model_id
      or v_execution.provider_cost_ceiling_micro_usd
        <> p_provider_cost_ceiling_micro_usd then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    if v_execution.state in ('completed', 'failed') then
      if v_execution.result_expires_at <= p_now
        and v_execution.result_payload is not null then
        update public.task_executions as e
        set result_payload = null
        where e.id = v_execution.id
        returning e.* into v_execution;
      end if;
      return query select
        v_execution.id, v_execution.state, null::uuid, null::timestamptz,
        v_execution.result_payload, v_execution.result_expires_at,
        v_execution.remaining_credits, v_execution.session_id,
        v_execution.error_code;
      return;
    end if;

    if v_execution.lease_expires_at <= p_now then
      -- After a reservation exists, upstream dispatch may already have
      -- happened. Use the same conservative settlement as the per-user sweep.
      if public.settle_stale_campaign_task_execution(
        v_execution.id,
        p_user_id,
        p_now
      ) then
        select e.* into v_execution
        from public.task_executions as e
        where e.id = v_execution.id
        for update;
        return query select
          v_execution.id, v_execution.state, null::uuid, null::timestamptz,
          v_execution.result_payload, v_execution.result_expires_at,
          v_execution.remaining_credits, v_execution.session_id,
          v_execution.error_code;
        return;
      end if;

      -- A lease with no reservation is known to be pre-provider and can be
      -- safely reassigned to the exact same idempotent request.
      update public.task_executions as e
      set owner_token = p_owner_token,
        lease_expires_at = p_now + interval '90 seconds'
      where e.id = v_execution.id
      returning e.* into v_execution;
      return query select
        v_execution.id, 'owner'::text, v_execution.owner_token,
        v_execution.lease_expires_at, null::jsonb, null::timestamptz,
        null::integer, null::uuid, null::text;
      return;
    end if;

    if v_execution.owner_token = p_owner_token then
      update public.task_executions as e
      set lease_expires_at = p_now + interval '90 seconds'
      where e.id = v_execution.id
      returning e.* into v_execution;
      return query select
        v_execution.id, 'owner'::text, v_execution.owner_token,
        v_execution.lease_expires_at, null::jsonb, null::timestamptz,
        null::integer, null::uuid, null::text;
      return;
    end if;

    return query select
      v_execution.id, 'running'::text, null::uuid,
      v_execution.lease_expires_at, null::jsonb, null::timestamptz,
      null::integer, null::uuid, null::text;
    return;
  end if;

  select pg_catalog.count(*)::integer into v_recent_count
  from public.task_executions as e
  where e.user_id = p_user_id
    and e.created_at >= p_now - interval '1 minute';
  if v_recent_count >= 8 then
    return query select
      null::uuid, 'throttled'::text, null::uuid, null::timestamptz,
      null::jsonb, null::timestamptz, null::integer, null::uuid, null::text;
    return;
  end if;

  insert into public.task_executions (
    user_id, idempotency_key, request_fingerprint, task_type, model_id,
    provider_cost_ceiling_micro_usd, state, owner_token, lease_expires_at,
    created_at, updated_at
  ) values (
    p_user_id, p_idempotency_key, p_request_fingerprint, p_task_type,
    p_model_id, p_provider_cost_ceiling_micro_usd, 'running', p_owner_token,
    p_now + interval '90 seconds', p_now, p_now
  ) returning * into v_execution;
  return query select
    v_execution.id, 'owner'::text, v_execution.owner_token,
    v_execution.lease_expires_at, null::jsonb, null::timestamptz,
    null::integer, null::uuid, null::text;
end;
$$;

create or replace function public.terminalize_campaign_task_execution(
  p_execution_id uuid,
  p_owner_token uuid,
  p_reservation_id uuid,
  p_state text,
  p_result_payload jsonb,
  p_task_title text,
  p_input_units integer,
  p_output_units integer,
  p_provider_cost_micro_usd bigint,
  p_saved_output text,
  p_error_code text,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  execution_id uuid,
  execution_state text,
  owner_token uuid,
  lease_expires_at timestamptz,
  result_payload jsonb,
  result_expires_at timestamptz,
  remaining_credits integer,
  session_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.now();
  v_execution public.task_executions%rowtype;
  v_reservation public.ledger_entries%rowtype;
  v_terminal public.ledger_entries%rowtype;
  v_wallet public.wallets%rowtype;
  v_session public.task_sessions%rowtype;
  v_terminal_kind text;
  v_terminal_key text;
  v_task_title text := pg_catalog.btrim(p_task_title);
begin
  if p_execution_id is null
    or p_owner_token is null
    or p_reservation_id is null
    or p_state is null
    or p_state not in ('completed', 'failed')
    or p_result_payload is null
    or pg_catalog.jsonb_typeof(p_result_payload) <> 'object'
    or pg_catalog.octet_length(p_result_payload::text) not between 2 and 50000
    or v_task_title is null
    or pg_catalog.char_length(v_task_title) not between 1 and 200
    or p_input_units is null or p_input_units < 0
    or p_output_units is null or p_output_units < 0
    or p_provider_cost_micro_usd is null
    or p_provider_cost_micro_usd not between 0 and 250000
    or (p_saved_output is not null
      and pg_catalog.octet_length(p_saved_output) not between 2 and 50000)
    or (p_state = 'completed' and (
      p_error_code is not null
      or coalesce(pg_catalog.jsonb_typeof(p_result_payload -> 'output'), '') <> 'object'
      or (p_saved_output is not null
        and p_saved_output::jsonb is distinct from p_result_payload -> 'output')
    ))
    or (p_state = 'failed' and (
      p_error_code is null
      or p_error_code not in ('PROVIDER_UNAVAILABLE', 'TASK_UNAVAILABLE')
      or p_input_units <> 0
      or p_output_units <> 0
      or p_saved_output is not null
      or p_result_payload is distinct from pg_catalog.jsonb_build_object('error', p_error_code)
    ))
    or p_now is null
    or p_now < v_clock - interval '30 seconds'
    or p_now > v_clock + interval '5 seconds' then
    raise exception 'INVALID_TASK_EXECUTION_RESULT' using errcode = 'P0001';
  end if;

  select e.* into v_execution
  from public.task_executions as e
  where e.id = p_execution_id
  for update;
  if not found then
    raise exception 'TASK_EXECUTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_execution.owner_token <> p_owner_token then
    raise exception 'TASK_EXECUTION_OWNER_MISMATCH' using errcode = 'P0001';
  end if;
  if v_execution.state <> 'running' and v_execution.state <> p_state then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  -- Lock order is execution -> reservation -> terminal -> wallet -> session.
  select l.* into v_reservation
  from public.ledger_entries as l
  where l.id = p_reservation_id
    and l.user_id = v_execution.user_id
    and l.entry_kind = 'reserve'
  for update;
  if not found then
    raise exception 'SPEND_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_reservation.idempotency_key <> v_execution.idempotency_key
    or v_reservation.provider_cost_micro_usd <> v_execution.provider_cost_ceiling_micro_usd then
    raise exception 'TASK_EXECUTION_RESERVATION_MISMATCH' using errcode = 'P0001';
  end if;
  if p_provider_cost_micro_usd > v_reservation.provider_cost_micro_usd then
    raise exception 'PROVIDER_COST_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;
  if p_state = 'failed'
    and p_provider_cost_micro_usd <> v_reservation.provider_cost_micro_usd then
    raise exception 'INVALID_TASK_EXECUTION_RESULT' using errcode = 'P0001';
  end if;

  v_terminal_kind := case when p_state = 'completed' then 'commit' else 'refund' end;
  v_terminal_key := p_execution_id::text || ':' || v_terminal_kind;
  select l.* into v_terminal
  from public.ledger_entries as l
  where l.reservation_id = v_reservation.id
  for update;

  if found then
    if v_terminal.user_id <> v_execution.user_id
      or v_terminal.entry_kind <> v_terminal_kind
      or v_terminal.idempotency_key <> v_terminal_key
      or v_terminal.provider_cost_micro_usd <> p_provider_cost_micro_usd
      or (p_state = 'completed' and (v_reservation.state <> 'committed' or v_terminal.state <> 'committed'))
      or (p_state = 'failed' and (v_reservation.state <> 'refunded' or v_terminal.state <> 'refunded')) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
  else
    if v_execution.state <> 'running' or v_reservation.state <> 'reserved' then
      raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
    end if;
    select w.* into v_wallet
    from public.wallets as w
    where w.id = v_reservation.wallet_id
      and w.user_id = v_execution.user_id
    for update;
    if not found
      or v_wallet.reserved_balance < 120
      or v_wallet.provider_reserved_micro_usd < v_reservation.provider_cost_micro_usd
      or (p_state = 'failed' and v_wallet.remaining_balance + 120 > v_wallet.initial_balance) then
      raise exception 'CREDIT_BALANCE_INVALID' using errcode = 'P0001';
    end if;

    update public.wallets
    set
      remaining_balance = remaining_balance + case when p_state = 'failed' then 120 else 0 end,
      reserved_balance = reserved_balance - 120,
      provider_reserved_micro_usd = provider_reserved_micro_usd - v_reservation.provider_cost_micro_usd,
      provider_committed_micro_usd = provider_committed_micro_usd + p_provider_cost_micro_usd
    where id = v_wallet.id
    returning * into v_wallet;
    update public.ledger_entries
    set state = case when p_state = 'completed' then 'committed' else 'refunded' end
    where id = v_reservation.id
    returning * into v_reservation;
    insert into public.ledger_entries (
      wallet_id, user_id, entry_kind, state, credits_delta,
      provider_cost_micro_usd, idempotency_key, reservation_id,
      balance_after, reserved_after, provider_committed_after_micro_usd,
      provider_reserved_after_micro_usd
    ) values (
      v_wallet.id, v_execution.user_id, v_terminal_kind,
      case when p_state = 'completed' then 'committed' else 'refunded' end,
      case when p_state = 'completed' then 0 else 120 end,
      p_provider_cost_micro_usd, v_terminal_key, v_reservation.id,
      v_wallet.remaining_balance, v_wallet.reserved_balance,
      v_wallet.provider_committed_micro_usd, v_wallet.provider_reserved_micro_usd
    ) returning * into v_terminal;
  end if;

  select s.* into v_session
  from public.task_sessions as s
  where s.reservation_id = v_reservation.id
  for update;
  if found then
    if v_session.user_id <> v_execution.user_id
      or v_session.task_type <> v_execution.task_type
      or v_session.title <> v_task_title
      or v_session.model_id <> v_execution.model_id
      or v_session.input_units <> p_input_units
      or v_session.output_units <> p_output_units
      or v_session.provider_cost_micro_usd <> p_provider_cost_micro_usd
      or v_session.status <> p_state
      or v_session.saved_output is distinct from p_saved_output
      or v_session.saved_output_retained <> (p_saved_output is not null) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
  else
    insert into public.task_sessions (
      user_id, reservation_id, task_type, title, model_id, input_units,
      output_units, provider_cost_micro_usd, status, saved_output,
      saved_output_retained
    ) values (
      v_execution.user_id, v_reservation.id, v_execution.task_type,
      v_task_title, v_execution.model_id, p_input_units, p_output_units,
      p_provider_cost_micro_usd, p_state, p_saved_output, p_saved_output is not null
    ) returning * into v_session;
  end if;

  if v_execution.state in ('completed', 'failed') then
    if v_execution.session_id <> v_session.id
      or v_execution.remaining_credits <> v_terminal.balance_after
      or v_execution.error_code is distinct from p_error_code
      or (v_execution.result_payload is not null
        and v_execution.result_payload is distinct from p_result_payload) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select v_execution.id, v_execution.state, null::uuid,
      null::timestamptz, v_execution.result_payload,
      v_execution.result_expires_at, v_execution.remaining_credits,
      v_execution.session_id, v_execution.error_code;
    return;
  end if;

  update public.task_executions as e
  set state = p_state, lease_expires_at = null, result_payload = p_result_payload,
    result_expires_at = v_clock + interval '15 minutes',
    remaining_credits = v_terminal.balance_after, session_id = v_session.id,
    error_code = p_error_code
  where e.id = p_execution_id
  returning e.* into v_execution;
  return query select v_execution.id, v_execution.state, null::uuid,
    null::timestamptz, v_execution.result_payload, v_execution.result_expires_at,
    v_execution.remaining_credits, v_execution.session_id, v_execution.error_code;
end;
$$;

revoke all on function public.terminalize_campaign_task_execution(
  uuid, uuid, uuid, text, jsonb, text, integer, integer, bigint, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.begin_campaign_task_execution(
  uuid, text, text, text, text, bigint, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.reserve_campaign_task_spend(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.settle_stale_campaign_task_execution(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.reserve_campaign_spend(text, bigint)
  from public, anon, authenticated;
revoke all on function public.commit_campaign_spend(uuid, bigint, text)
  from public, anon, authenticated;
revoke all on function public.refund_campaign_spend(uuid, text)
  from public, anon, authenticated;
grant execute on function public.terminalize_campaign_task_execution(
  uuid, uuid, uuid, text, jsonb, text, integer, integer, bigint, text, text, timestamptz
) to service_role;
grant execute on function public.begin_campaign_task_execution(
  uuid, text, text, text, text, bigint, uuid, timestamptz
) to service_role;
grant execute on function public.reserve_campaign_task_spend(
  uuid, uuid, timestamptz
) to service_role;
grant execute on function public.settle_stale_campaign_task_execution(
  uuid, uuid, timestamptz
) to service_role;
grant execute on function public.reserve_campaign_spend(text, bigint)
  to service_role;
grant execute on function public.commit_campaign_spend(uuid, bigint, text)
  to service_role;
grant execute on function public.refund_campaign_spend(uuid, text)
  to service_role;
