-- Global, scheduled cleanup is deliberately bounded.  The request path keeps
-- its per-wallet recovery behaviour; this service-only lane covers idle rows.

create index task_executions_stale_lease_idx
  on public.task_executions (lease_expires_at, id)
  where state = 'running';

create index agent_requests_stale_lease_idx
  on public.agent_requests (lease_expires_at, id)
  where state = 'running';

create index redemption_attempts_expiry_cleanup_idx
  on public.redemption_attempts (expires_at, id);

create index events_retention_cleanup_idx
  on public.events (retain_until, id);

-- Keep the same wallet -> key -> request lock order as Agent admission.  The
-- scheduler chooses candidate IDs without locking them, then this helper
-- takes the authoritative locks.  That avoids inverting the request-path
-- order while still making concurrent scheduler runs idempotent.
create function private.settle_stale_agent_request(
  p_request_id uuid,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_identity record;
  v_wallet public.wallets%rowtype;
  v_key public.agent_api_keys%rowtype;
  v_request public.agent_requests%rowtype;
begin
  if p_request_id is null or p_now is null then
    raise exception 'AGENT_MAINTENANCE_INVALID' using errcode = 'P0001';
  end if;

  select r.wallet_id, r.key_id
  into v_identity
  from public.agent_requests as r
  where r.id = p_request_id;
  if not found then
    return false;
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.id = v_identity.wallet_id
  for update skip locked;
  if not found then
    return false;
  end if;

  select k.*
  into v_key
  from public.agent_api_keys as k
  where k.id = v_identity.key_id
  for update skip locked;
  if not found then
    return false;
  end if;

  select r.*
  into v_request
  from public.agent_requests as r
  where r.id = p_request_id
  for update skip locked;
  if not found
    or v_request.state <> 'running'
    or v_request.lease_expires_at > p_now then
    return false;
  end if;

  perform 1
  from public.agent_usage_entries as u
  where u.request_id = v_request.id
    and u.entry_kind = 'reserve'
  for update;
  if not found then
    raise exception 'AGENT_ACCOUNTING_INVALID' using errcode = 'P0001';
  end if;

  update public.wallets as w
  set
    remaining_balance = w.remaining_balance + v_request.credit_ceiling,
    reserved_balance = w.reserved_balance - v_request.credit_ceiling,
    provider_reserved_micro_usd = w.provider_reserved_micro_usd
      - v_request.provider_cost_ceiling_micro_usd,
    provider_committed_micro_usd = w.provider_committed_micro_usd
      + v_request.provider_cost_ceiling_micro_usd
  where w.id = v_wallet.id
    and w.reserved_balance >= v_request.credit_ceiling
    and w.provider_reserved_micro_usd
      >= v_request.provider_cost_ceiling_micro_usd
  returning w.* into v_wallet;
  if not found then
    raise exception 'AGENT_ACCOUNTING_INVALID' using errcode = 'P0001';
  end if;

  update public.agent_api_keys as k
  set
    provider_reserved_micro_usd = k.provider_reserved_micro_usd
      - v_request.provider_cost_ceiling_micro_usd,
    provider_committed_micro_usd = k.provider_committed_micro_usd
      + v_request.provider_cost_ceiling_micro_usd
  where k.id = v_key.id
    and k.provider_reserved_micro_usd
      >= v_request.provider_cost_ceiling_micro_usd;
  if not found then
    raise exception 'AGENT_ACCOUNTING_INVALID' using errcode = 'P0001';
  end if;

  insert into public.agent_usage_entries (
    request_id, key_id, user_id, wallet_id, entry_kind, credits_delta,
    provider_cost_micro_usd, balance_after, reserved_after,
    provider_committed_after_micro_usd, provider_reserved_after_micro_usd
  ) values (
    v_request.id, v_request.key_id, v_request.user_id, v_request.wallet_id,
    'refund', v_request.credit_ceiling,
    v_request.provider_cost_ceiling_micro_usd, v_wallet.remaining_balance,
    v_wallet.reserved_balance, v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  ) on conflict (request_id, entry_kind) do nothing;

  update public.agent_requests as r
  set
    state = 'failed',
    lease_expires_at = null,
    provider_cost_micro_usd = v_request.provider_cost_ceiling_micro_usd,
    credits_charged = 0,
    input_units = 0,
    output_units = 0,
    result_payload = pg_catalog.jsonb_build_object(
      'error', 'AGENT_UNAVAILABLE'
    ),
    result_expires_at = p_now + interval '15 minutes',
    remaining_credits = v_wallet.remaining_balance,
    error_code = 'REQUEST_EXPIRED',
    completed_at = p_now
  where r.id = v_request.id;

  return true;
end;
$$;

-- Each category has its own small cap.  The route has no caller-controlled
-- parameters, so a cron invocation has a predictable upper bound.
create function public.run_bounded_global_maintenance(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_task_settlement_clock timestamptz := pg_catalog.now();
  v_task record;
  v_agent record;
  v_task_executions integer := 0;
  v_agent_requests integer := 0;
  v_agent_replays integer := 0;
  v_public_validations integer := 0;
  v_redemption_attempts integer := 0;
  v_events integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'GLOBAL_MAINTENANCE_INVALID' using errcode = 'P0001';
  end if;

  -- This calls the existing campaign settlement invariant unchanged.
  for v_task in
    select e.id, e.user_id
    from public.task_executions as e
    where e.state = 'running'
      and e.lease_expires_at <= v_clock
    order by e.lease_expires_at, e.id
    limit p_limit
    for update skip locked
  loop
    if public.settle_stale_campaign_task_execution(
      v_task.id,
      v_task.user_id,
      v_task_settlement_clock
    ) then
      v_task_executions := v_task_executions + 1;
    end if;
  end loop;

  for v_agent in
    select r.id
    from public.agent_requests as r
    where r.state = 'running'
      and r.lease_expires_at <= v_clock
    order by r.lease_expires_at, r.id
    limit p_limit
  loop
    if private.settle_stale_agent_request(v_agent.id, v_clock) then
      v_agent_requests := v_agent_requests + 1;
    end if;
  end loop;

  v_agent_replays := public.tombstone_expired_agent_responses(p_limit, null);

  with expired as (
    select a.id
    from public.public_validation_attempts as a
    where a.expires_at <= v_clock
    order by a.expires_at, a.id
    limit p_limit
    for update skip locked
  )
  delete from public.public_validation_attempts as a
  using expired
  where a.id = expired.id;
  get diagnostics v_public_validations = row_count;

  with expired as (
    select a.id
    from public.redemption_attempts as a
    where a.expires_at <= v_clock
    order by a.expires_at, a.id
    limit p_limit
    for update skip locked
  )
  delete from public.redemption_attempts as a
  using expired
  where a.id = expired.id;
  get diagnostics v_redemption_attempts = row_count;

  with expired as (
    select e.id
    from public.events as e
    where e.retain_until <= v_clock
    order by e.retain_until, e.id
    limit p_limit
    for update skip locked
  )
  delete from public.events as e
  using expired
  where e.id = expired.id;
  get diagnostics v_events = row_count;

  return pg_catalog.jsonb_build_object(
    'task_executions', v_task_executions,
    'agent_requests', v_agent_requests,
    'agent_replays', v_agent_replays,
    'public_validations', v_public_validations,
    'redemption_attempts', v_redemption_attempts,
    'events', v_events
  );
end;
$$;

revoke all on function private.settle_stale_agent_request(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.run_bounded_global_maintenance(integer)
  from public, anon, authenticated;
grant execute on function public.run_bounded_global_maintenance(integer)
  to service_role;

do $maintenance_postcheck$
declare
  v_helper_oid oid;
  v_runner_oid oid;
  v_helper_security_definer boolean;
  v_runner_security_definer boolean;
  v_helper_configuration text[];
  v_runner_configuration text[];
  v_runner_owner oid;
  v_runner_acl aclitem[];
  v_service_role oid;
  v_acl_count integer;
  v_owner_grants integer;
  v_service_grants integer;
  v_invalid_grants integer;
begin
  select p.oid, p.prosecdef, p.proconfig
  into
    v_helper_oid,
    v_helper_security_definer,
    v_helper_configuration
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'private.settle_stale_agent_request(uuid,timestamptz)'
  );

  select p.oid, p.prosecdef, p.proconfig, p.proowner, p.proacl
  into
    v_runner_oid,
    v_runner_security_definer,
    v_runner_configuration,
    v_runner_owner,
    v_runner_acl
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.run_bounded_global_maintenance(integer)'
  );

  select r.oid
  into v_service_role
  from pg_catalog.pg_roles as r
  where r.rolname = 'service_role';

  if v_helper_oid is null
    or v_runner_oid is null
    or v_service_role is null
    or not v_helper_security_definer
    or not v_runner_security_definer
    or v_helper_configuration is distinct from
      array['search_path=pg_catalog, public, extensions']::text[]
    or v_runner_configuration is distinct from
      array['search_path=pg_catalog, public, extensions']::text[] then
    raise exception 'GLOBAL_MAINTENANCE_CONFIGURATION_INVALID'
      using errcode = 'P0001';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where acl.grantee = v_runner_owner
        and acl.grantor = v_runner_owner
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    )::integer,
    pg_catalog.count(*) filter (
      where acl.grantee = v_service_role
        and acl.grantor = v_runner_owner
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    )::integer,
    pg_catalog.count(*) filter (
      where acl.grantee not in (v_runner_owner, v_service_role)
        or acl.grantor <> v_runner_owner
        or acl.privilege_type <> 'EXECUTE'
        or acl.is_grantable
    )::integer
  into
    v_acl_count,
    v_owner_grants,
    v_service_grants,
    v_invalid_grants
  from pg_catalog.aclexplode(v_runner_acl) as acl;

  if v_runner_acl is null
    or v_acl_count <> 2
    or v_owner_grants <> 1
    or v_service_grants <> 1
    or v_invalid_grants <> 0 then
    raise exception 'GLOBAL_MAINTENANCE_ACL_INVALID'
      using errcode = 'P0001';
  end if;

  if pg_catalog.has_function_privilege(
      'anon',
      v_runner_oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_runner_oid,
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      v_runner_oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      v_helper_oid,
      'EXECUTE'
    ) then
    raise exception 'GLOBAL_MAINTENANCE_ACL_INVALID'
      using errcode = 'P0001';
  end if;
end;
$maintenance_postcheck$;
