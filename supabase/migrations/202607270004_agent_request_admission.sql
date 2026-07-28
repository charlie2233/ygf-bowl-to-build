-- Phase 2 follow-up: bounded ingress admission and key lifecycle churn.
-- Client retry tokens have already been HMACed by the application. This table
-- is intentionally one row per key, rather than an unbounded request/event log.

create table public.agent_api_request_admissions (
  key_id uuid primary key references public.agent_api_keys(id)
    on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 0 and 60),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.agent_requests
  add constraint agent_requests_hashed_idempotency_key
  check (idempotency_key ~ '^idem_[0-9a-f]{64}$')
  not valid;

-- Keep the original accounting implementation intact, but interpose a strict
-- service-only boundary so no direct RPC caller can persist client retry text.
alter function public.begin_agent_request(
  text, text, text, text, bigint, integer, uuid, timestamptz
) rename to begin_agent_request_unchecked;

create function public.begin_agent_request(
  p_key_hash text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_model_id text,
  p_provider_cost_ceiling_micro_usd bigint,
  p_credit_ceiling integer,
  p_owner_token uuid,
  p_lease_expires_at timestamptz
)
returns table (
  request_id uuid,
  request_state text,
  request_owner_token uuid,
  lease_expires_at timestamptz,
  result_payload jsonb,
  result_expires_at timestamptz,
  remaining_credits integer,
  error_code text,
  key_id uuid,
  user_id uuid,
  wallet_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if p_idempotency_key is null
    or p_idempotency_key !~ '^idem_[0-9a-f]{64}$' then
    raise exception 'AGENT_REQUEST_INVALID' using errcode = 'P0001';
  end if;
  return query
  select * from public.begin_agent_request_unchecked(
    p_key_hash,
    p_idempotency_key,
    p_request_fingerprint,
    p_model_id,
    p_provider_cost_ceiling_micro_usd,
    p_credit_ceiling,
    p_owner_token,
    p_lease_expires_at
  );
end;
$$;

revoke all on function public.begin_agent_request_unchecked(
  text, text, text, text, bigint, integer, uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.begin_agent_request(
  text, text, text, text, bigint, integer, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.begin_agent_request(
  text, text, text, text, bigint, integer, uuid, timestamptz
) to service_role;

alter table public.agent_api_request_admissions enable row level security;
alter table public.agent_api_request_admissions force row level security;
revoke all on table public.agent_api_request_admissions from public, anon, authenticated;
grant all on table public.agent_api_request_admissions to service_role;

create or replace function public.enforce_agent_api_key_lifecycle_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_created integer;
  v_wallet_id uuid;
begin
  -- Match create/rotate: every lifecycle write locks its wallet before
  -- inspecting or inserting an Agent key. The FK check follows this trigger.
  select w.id
  into v_wallet_id
  from public.wallets as w
  where w.id = new.wallet_id
  for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_created
  from public.agent_api_keys as k
  where k.wallet_id = v_wallet_id
    and k.created_at > pg_catalog.clock_timestamp() - interval '24 hours';
  if v_created >= 10 then
    raise exception 'AGENT_KEY_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_agent_api_key_lifecycle_limit()
from public, anon, authenticated;

drop trigger if exists agent_api_keys_lifecycle_limit on public.agent_api_keys;
create trigger agent_api_keys_lifecycle_limit
before insert on public.agent_api_keys
for each row execute function public.enforce_agent_api_key_lifecycle_limit();

create or replace function public.admit_agent_api_key_request(
  p_key_hash text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_key public.agent_api_keys%rowtype;
  v_wallet public.wallets%rowtype;
  v_bucket public.agent_api_request_admissions%rowtype;
begin
  if p_key_hash is null or p_key_hash !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;

  select k.* into v_key
  from public.agent_api_keys as k
  where k.key_hash = p_key_hash
  for update;
  if not found or v_key.revoked_at is not null or v_key.expires_at <= v_clock then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;

  select w.* into v_wallet
  from public.wallets as w
  where w.id = v_key.wallet_id and w.user_id = v_key.user_id;
  if not found or v_wallet.expires_at <= v_clock then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;

  select a.* into v_bucket
  from public.agent_api_request_admissions as a
  where a.key_id = v_key.id
  for update;
  if not found then
    insert into public.agent_api_request_admissions (
      key_id, window_started_at, request_count, updated_at
    ) values (v_key.id, v_clock, 1, v_clock);
    return;
  end if;
  if v_bucket.window_started_at + interval '1 minute' <= v_clock then
    update public.agent_api_request_admissions
    set window_started_at = v_clock, request_count = 1, updated_at = v_clock
    where key_id = v_key.id;
    return;
  end if;
  if v_bucket.request_count >= v_key.rpm_limit then
    raise exception 'AGENT_RATE_LIMITED' using errcode = 'P0001';
  end if;
  update public.agent_api_request_admissions
  set request_count = request_count + 1, updated_at = v_clock
  where key_id = v_key.id;
end;
$$;

revoke all on function public.admit_agent_api_key_request(text)
from public, anon, authenticated;
grant execute on function public.admit_agent_api_key_request(text)
to service_role;
