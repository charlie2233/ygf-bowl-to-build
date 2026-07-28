-- Phase 2: personal Agent keys and variable-cost OpenAI-compatible usage.
-- Claim plaintext and API-key plaintext never enter Postgres. The application
-- sends only a versioned, peppered HMAC digest for key lookup.

create table public.agent_api_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  key_hash text not null unique
    check (
      char_length(key_hash) = 43
      and key_hash ~ '^[A-Za-z0-9_-]{43}$'
    ),
  hash_version smallint not null default 1
    check (hash_version = 1),
  key_prefix text not null
    check (
      char_length(key_prefix) = 8
      and key_prefix ~ '^ygf_[A-Za-z0-9_-]{4}$'
    ),
  key_last4 text not null
    check (
      char_length(key_last4) = 4
      and key_last4 ~ '^[A-Za-z0-9_-]{4}$'
    ),
  scopes text[] not null default
    array['models:read', 'chat:completions']::text[]
    check (
      scopes =
        array['models:read', 'chat:completions']::text[]
    ),
  rpm_limit integer not null default 12
    check (rpm_limit between 1 and 60),
  concurrency_limit integer not null default 2
    check (concurrency_limit between 1 and 4),
  provider_cost_limit_micro_usd bigint not null default 250000
    check (provider_cost_limit_micro_usd between 1 and 250000),
  provider_committed_micro_usd bigint not null default 0
    check (provider_committed_micro_usd >= 0),
  provider_reserved_micro_usd bigint not null default 0
    check (provider_reserved_micro_usd >= 0),
  rotated_from_key_id uuid references public.agent_api_keys(id)
    on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    provider_committed_micro_usd
      + provider_reserved_micro_usd
      <= provider_cost_limit_micro_usd
  ),
  check (
    expires_at > created_at
    and expires_at <= created_at + interval '14 days'
  ),
  check (revoked_at is null or revoked_at >= created_at)
);

create table public.agent_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  key_id uuid not null references public.agent_api_keys(id)
    on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  idempotency_key text not null
    check (
      char_length(idempotency_key) between 1 and 128
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
  request_fingerprint text not null
    check (
      char_length(request_fingerprint) = 64
      and request_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  model_id text not null
    check (char_length(model_id) between 1 and 200),
  provider_cost_ceiling_micro_usd bigint not null
    check (provider_cost_ceiling_micro_usd between 1 and 250000),
  credit_ceiling integer not null
    check (credit_ceiling between 1 and 3000),
  provider_cost_micro_usd bigint
    check (
      provider_cost_micro_usd is null
      or provider_cost_micro_usd between 0 and 250000
    ),
  credits_charged integer
    check (
      credits_charged is null
      or credits_charged between 0 and 3000
    ),
  input_units integer
    check (input_units is null or input_units >= 0),
  output_units integer
    check (output_units is null or output_units >= 0),
  state text not null default 'running'
    check (state in ('running', 'completed', 'failed')),
  owner_token uuid not null,
  lease_expires_at timestamptz,
  result_payload jsonb,
  result_expires_at timestamptz,
  remaining_credits integer
    check (remaining_credits is null or remaining_credits between 0 and 3000),
  error_code text
    check (
      error_code is null
      or error_code in (
        'PROVIDER_UNAVAILABLE',
        'REQUEST_EXPIRED',
        'AGENT_UNAVAILABLE'
      )
    ),
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  unique (wallet_id, idempotency_key),
  check (
    result_payload is null
    or (
      jsonb_typeof(result_payload) = 'object'
      and pg_catalog.octet_length(result_payload::text) between 2 and 50000
    )
  ),
  check (
    (state = 'running'
      and lease_expires_at is not null
      and provider_cost_micro_usd is null
      and credits_charged is null
      and result_payload is null
      and result_expires_at is null
      and remaining_credits is null
      and error_code is null
      and completed_at is null)
    or
    (state = 'completed'
      and lease_expires_at is null
      and provider_cost_micro_usd is not null
      and credits_charged is not null
      and result_payload is not null
      and result_expires_at is not null
      and remaining_credits is not null
      and error_code is null
      and completed_at is not null)
    or
    (state = 'failed'
      and lease_expires_at is null
      and provider_cost_micro_usd is not null
      and credits_charged = 0
      and result_payload is not null
      and result_expires_at is not null
      and remaining_credits is not null
      and error_code is not null
      and completed_at is not null)
  ),
  check (
    result_expires_at is null
    or (
      completed_at is not null
      and result_expires_at >= completed_at
      and result_expires_at <= completed_at + interval '15 minutes'
    )
  )
);

create table public.agent_usage_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null references public.agent_requests(id)
    on delete restrict,
  key_id uuid not null references public.agent_api_keys(id)
    on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  entry_kind text not null
    check (entry_kind in ('reserve', 'commit', 'refund')),
  credits_delta integer not null
    check (credits_delta between -3000 and 3000),
  provider_cost_micro_usd bigint not null
    check (provider_cost_micro_usd between 0 and 250000),
  balance_after integer not null check (balance_after between 0 and 3000),
  reserved_after integer not null check (reserved_after between 0 and 3000),
  provider_committed_after_micro_usd bigint not null
    check (
      provider_committed_after_micro_usd between 0 and 250000
    ),
  provider_reserved_after_micro_usd bigint not null
    check (
      provider_reserved_after_micro_usd between 0 and 250000
    ),
  created_at timestamptz not null default pg_catalog.now(),
  unique (request_id, entry_kind),
  check (
    (entry_kind = 'reserve'
      and credits_delta < 0
      and provider_cost_micro_usd > 0)
    or
    (entry_kind = 'commit'
      and credits_delta >= 0)
    or
    (entry_kind = 'refund'
      and credits_delta > 0)
  )
);

create index agent_api_keys_user_created_idx
  on public.agent_api_keys (user_id, created_at desc);
create index agent_api_keys_wallet_active_idx
  on public.agent_api_keys (wallet_id, expires_at)
  where revoked_at is null;
create index agent_requests_key_rate_idx
  on public.agent_requests (key_id, created_at desc);
create index agent_requests_wallet_state_idx
  on public.agent_requests (wallet_id, state, lease_expires_at);
create index agent_requests_result_expiry_idx
  on public.agent_requests (result_expires_at, id)
  where result_expires_at is not null;
create index agent_usage_wallet_created_idx
  on public.agent_usage_entries (wallet_id, created_at desc);

create trigger agent_api_keys_set_updated_at
before update on public.agent_api_keys
for each row execute function public.set_updated_at();

create trigger agent_requests_set_updated_at
before update on public.agent_requests
for each row execute function public.set_updated_at();

alter table public.agent_api_keys enable row level security;
alter table public.agent_api_keys force row level security;
alter table public.agent_requests enable row level security;
alter table public.agent_requests force row level security;
alter table public.agent_usage_entries enable row level security;
alter table public.agent_usage_entries force row level security;

revoke all on table public.agent_api_keys from public, anon, authenticated;
revoke all on table public.agent_requests from public, anon, authenticated;
revoke all on table public.agent_usage_entries
  from public, anon, authenticated;

grant all on table public.agent_api_keys to service_role;
grant all on table public.agent_requests to service_role;
grant all on table public.agent_usage_entries to service_role;

create or replace function public.create_agent_api_key(
  p_user_id uuid,
  p_key_hash text,
  p_hash_version smallint,
  p_key_prefix text,
  p_key_last4 text,
  p_expires_at timestamptz,
  p_rpm_limit integer default 12,
  p_concurrency_limit integer default 2
)
returns table (
  key_id uuid,
  wallet_id uuid,
  key_prefix text,
  key_last4 text,
  scopes text[],
  rpm_limit integer,
  concurrency_limit integer,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  remaining_credits integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := p_user_id;
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_wallet public.wallets%rowtype;
  v_key public.agent_api_keys%rowtype;
  v_active_count integer;
  v_expiry timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_key_hash is null
    or p_key_hash !~ '^[A-Za-z0-9_-]{43}$'
    or p_hash_version <> 1
    or p_key_prefix is null
    or p_key_prefix !~ '^ygf_[A-Za-z0-9_-]{4}$'
    or char_length(p_key_prefix) <> 8
    or p_key_last4 is null
    or p_key_last4 !~ '^[A-Za-z0-9_-]{4}$'
    or p_rpm_limit not between 1 and 60
    or p_concurrency_limit not between 1 and 4
    or p_expires_at is null then
    raise exception 'AGENT_KEY_INVALID' using errcode = 'P0001';
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.user_id = v_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_wallet.expires_at <= v_clock then
    raise exception 'WALLET_EXPIRED' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_active_count
  from public.agent_api_keys as k
  where k.wallet_id = v_wallet.id
    and k.revoked_at is null
    and k.expires_at > v_clock;

  if v_active_count >= 3 then
    raise exception 'AGENT_KEY_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  v_expiry := least(
    p_expires_at,
    v_wallet.expires_at,
    v_clock + interval '14 days'
  );
  if v_expiry <= v_clock then
    raise exception 'AGENT_KEY_INVALID' using errcode = 'P0001';
  end if;

  insert into public.agent_api_keys (
    user_id,
    wallet_id,
    key_hash,
    hash_version,
    key_prefix,
    key_last4,
    scopes,
    rpm_limit,
    concurrency_limit,
    created_at,
    expires_at
  )
  values (
    v_user_id,
    v_wallet.id,
    p_key_hash,
    p_hash_version,
    p_key_prefix,
    p_key_last4,
    array['models:read', 'chat:completions']::text[],
    p_rpm_limit,
    p_concurrency_limit,
    v_clock,
    v_expiry
  )
  returning * into v_key;

  return query
  select
    v_key.id,
    v_key.wallet_id,
    v_key.key_prefix,
    v_key.key_last4,
    v_key.scopes,
    v_key.rpm_limit,
    v_key.concurrency_limit,
    v_key.created_at,
    v_key.expires_at,
    v_key.revoked_at,
    v_key.last_used_at,
    v_wallet.remaining_balance;
end;
$$;

create or replace function public.list_agent_api_keys(
  p_user_id uuid
)
returns table (
  key_id uuid,
  wallet_id uuid,
  key_prefix text,
  key_last4 text,
  scopes text[],
  rpm_limit integer,
  concurrency_limit integer,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  provider_committed_micro_usd bigint,
  remaining_credits integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select
    k.id,
    k.wallet_id,
    k.key_prefix,
    k.key_last4,
    k.scopes,
    k.rpm_limit,
    k.concurrency_limit,
    k.created_at,
    k.expires_at,
    k.revoked_at,
    k.last_used_at,
    k.provider_committed_micro_usd,
    w.remaining_balance
  from public.agent_api_keys as k
  join public.wallets as w on w.id = k.wallet_id
  where p_user_id is not null
    and k.user_id = p_user_id
  order by k.created_at desc, k.id;
$$;

create or replace function public.revoke_agent_api_key(
  p_user_id uuid,
  p_key_id uuid
)
returns table (
  key_id uuid,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := p_user_id;
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_key public.agent_api_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  select k.*
  into v_key
  from public.agent_api_keys as k
  where k.id = p_key_id
    and k.user_id = v_user_id
  for update;

  if not found then
    raise exception 'AGENT_KEY_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_key.revoked_at is null then
    update public.agent_api_keys as k
    set revoked_at = v_clock
    where k.id = v_key.id
    returning k.* into v_key;
  end if;

  return query select v_key.id, v_key.revoked_at;
end;
$$;

create or replace function public.rotate_agent_api_key(
  p_user_id uuid,
  p_key_id uuid,
  p_new_key_hash text,
  p_hash_version smallint,
  p_new_key_prefix text,
  p_new_key_last4 text,
  p_expires_at timestamptz
)
returns table (
  key_id uuid,
  wallet_id uuid,
  key_prefix text,
  key_last4 text,
  scopes text[],
  rpm_limit integer,
  concurrency_limit integer,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  remaining_credits integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := p_user_id;
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_wallet public.wallets%rowtype;
  v_old public.agent_api_keys%rowtype;
  v_new public.agent_api_keys%rowtype;
  v_expiry timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_new_key_hash is null
    or p_new_key_hash !~ '^[A-Za-z0-9_-]{43}$'
    or p_hash_version <> 1
    or p_new_key_prefix is null
    or p_new_key_prefix !~ '^ygf_[A-Za-z0-9_-]{4}$'
    or char_length(p_new_key_prefix) <> 8
    or p_new_key_last4 is null
    or p_new_key_last4 !~ '^[A-Za-z0-9_-]{4}$'
    or p_expires_at is null then
    raise exception 'AGENT_KEY_INVALID' using errcode = 'P0001';
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.user_id = v_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_wallet.expires_at <= v_clock then
    raise exception 'WALLET_EXPIRED' using errcode = 'P0001';
  end if;

  select k.*
  into v_old
  from public.agent_api_keys as k
  where k.id = p_key_id
    and k.user_id = v_user_id
  for update;

  if not found then
    raise exception 'AGENT_KEY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_old.revoked_at is not null or v_old.expires_at <= v_clock then
    raise exception 'AGENT_KEY_INACTIVE' using errcode = 'P0001';
  end if;

  v_expiry := least(
    p_expires_at,
    v_wallet.expires_at,
    v_clock + interval '14 days'
  );
  if v_expiry <= v_clock then
    raise exception 'AGENT_KEY_INVALID' using errcode = 'P0001';
  end if;

  update public.agent_api_keys as k
  set revoked_at = v_clock
  where k.id = v_old.id;

  insert into public.agent_api_keys (
    user_id,
    wallet_id,
    key_hash,
    hash_version,
    key_prefix,
    key_last4,
    scopes,
    rpm_limit,
    concurrency_limit,
    provider_cost_limit_micro_usd,
    rotated_from_key_id,
    created_at,
    expires_at
  )
  values (
    v_old.user_id,
    v_old.wallet_id,
    p_new_key_hash,
    p_hash_version,
    p_new_key_prefix,
    p_new_key_last4,
    v_old.scopes,
    v_old.rpm_limit,
    v_old.concurrency_limit,
    v_old.provider_cost_limit_micro_usd,
    v_old.id,
    v_clock,
    v_expiry
  )
  returning * into v_new;

  return query
  select
    v_new.id,
    v_new.wallet_id,
    v_new.key_prefix,
    v_new.key_last4,
    v_new.scopes,
    v_new.rpm_limit,
    v_new.concurrency_limit,
    v_new.created_at,
    v_new.expires_at,
    v_new.revoked_at,
    v_new.last_used_at,
    v_wallet.remaining_balance;
end;
$$;

create or replace function public.authenticate_agent_api_key(
  p_key_hash text
)
returns table (
  key_id uuid,
  user_id uuid,
  wallet_id uuid,
  scopes text[],
  rpm_limit integer,
  concurrency_limit integer,
  expires_at timestamptz,
  remaining_credits integer,
  wallet_expires_at timestamptz,
  provider_committed_micro_usd bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_key public.agent_api_keys%rowtype;
  v_wallet public.wallets%rowtype;
begin
  if p_key_hash is null
    or p_key_hash !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;

  -- Authentication is a read-only snapshot. Inference admission re-locks the
  -- wallet first and then the key, so this lookup cannot invert lock order or
  -- turn GET /v1/models into a write-amplification path.
  select k.*
  into v_key
  from public.agent_api_keys as k
  where k.key_hash = p_key_hash;

  if not found
    or v_key.revoked_at is not null
    or v_key.expires_at <= v_clock then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.id = v_key.wallet_id
    and w.user_id = v_key.user_id;

  if not found or v_wallet.expires_at <= v_clock then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;

  return query
  select
    v_key.id,
    v_key.user_id,
    v_key.wallet_id,
    v_key.scopes,
    v_key.rpm_limit,
    v_key.concurrency_limit,
    v_key.expires_at,
    v_wallet.remaining_balance,
    v_wallet.expires_at,
    v_wallet.provider_committed_micro_usd;
end;
$$;

create or replace function public.begin_agent_request(
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
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_key public.agent_api_keys%rowtype;
  v_wallet public.wallets%rowtype;
  v_prior public.agent_requests%rowtype;
  v_request public.agent_requests%rowtype;
  v_stale public.agent_requests%rowtype;
  v_rate_count integer;
  v_key_concurrency integer;
  v_wallet_concurrency integer;
begin
  if p_key_hash is null
    or p_key_hash !~ '^[A-Za-z0-9_-]{43}$'
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or p_request_fingerprint is null
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_model_id is null
    or char_length(p_model_id) not between 1 and 200
    or p_provider_cost_ceiling_micro_usd not between 1 and 250000
    or p_credit_ceiling not between 1 and 3000
    or p_owner_token is null
    or p_lease_expires_at is null
    or p_lease_expires_at <= v_clock
    or p_lease_expires_at > v_clock + interval '90 seconds' then
    raise exception 'AGENT_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select k.*
  into v_key
  from public.agent_api_keys as k
  where k.key_hash = p_key_hash;

  if not found then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;

  -- Wallet-first locking serializes all keys against the shared beta cap.
  select w.*
  into v_wallet
  from public.wallets as w
  where w.id = v_key.wallet_id
    and w.user_id = v_key.user_id
  for update;

  if not found or v_wallet.expires_at <= v_clock then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;

  select k.*
  into v_key
  from public.agent_api_keys as k
  where k.id = v_key.id
  for update;

  if v_key.revoked_at is not null or v_key.expires_at <= v_clock then
    raise exception 'AGENT_AUTHENTICATION_FAILED' using errcode = 'P0001';
  end if;
  if not ('chat:completions' = any(v_key.scopes)) then
    raise exception 'AGENT_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  -- A crashed worker cannot hold wallet credits or provider budget forever.
  for v_stale in
    select r.*
    from public.agent_requests as r
    where r.wallet_id = v_wallet.id
      and r.state = 'running'
      and r.lease_expires_at <= v_clock
    order by r.key_id, r.id
    for update
  loop
    update public.wallets as w
    set
      remaining_balance =
        w.remaining_balance + v_stale.credit_ceiling,
      reserved_balance =
        w.reserved_balance - v_stale.credit_ceiling,
      provider_reserved_micro_usd =
        w.provider_reserved_micro_usd
          - v_stale.provider_cost_ceiling_micro_usd,
      provider_committed_micro_usd =
        w.provider_committed_micro_usd
          + v_stale.provider_cost_ceiling_micro_usd
    where w.id = v_wallet.id
      and w.reserved_balance >= v_stale.credit_ceiling
      and w.provider_reserved_micro_usd
        >= v_stale.provider_cost_ceiling_micro_usd
    returning w.* into v_wallet;

    if not found then
      raise exception 'AGENT_ACCOUNTING_INVALID' using errcode = 'P0001';
    end if;

    update public.agent_api_keys as k
    set
      provider_reserved_micro_usd =
        k.provider_reserved_micro_usd
          - v_stale.provider_cost_ceiling_micro_usd,
      provider_committed_micro_usd =
        k.provider_committed_micro_usd
          + v_stale.provider_cost_ceiling_micro_usd
    where k.id = v_stale.key_id
      and k.provider_reserved_micro_usd
        >= v_stale.provider_cost_ceiling_micro_usd;

    if not found then
      raise exception 'AGENT_ACCOUNTING_INVALID' using errcode = 'P0001';
    end if;

    insert into public.agent_usage_entries (
      request_id,
      key_id,
      user_id,
      wallet_id,
      entry_kind,
      credits_delta,
      provider_cost_micro_usd,
      balance_after,
      reserved_after,
      provider_committed_after_micro_usd,
      provider_reserved_after_micro_usd
    )
    values (
      v_stale.id,
      v_stale.key_id,
      v_stale.user_id,
      v_stale.wallet_id,
      'refund',
      v_stale.credit_ceiling,
      v_stale.provider_cost_ceiling_micro_usd,
      v_wallet.remaining_balance,
      v_wallet.reserved_balance,
      v_wallet.provider_committed_micro_usd,
      v_wallet.provider_reserved_micro_usd
    )
    on conflict (request_id, entry_kind) do nothing;

    update public.agent_requests as r
    set
      state = 'failed',
      lease_expires_at = null,
      provider_cost_micro_usd = v_stale.provider_cost_ceiling_micro_usd,
      credits_charged = 0,
      input_units = 0,
      output_units = 0,
      result_payload =
        pg_catalog.jsonb_build_object('error', 'AGENT_UNAVAILABLE'),
      result_expires_at = v_clock + interval '15 minutes',
      remaining_credits = v_wallet.remaining_balance,
      error_code = 'REQUEST_EXPIRED',
      completed_at = v_clock
    where r.id = v_stale.id;
  end loop;

  -- Reload the current key because stale cleanup may have adjusted it.
  select k.*
  into v_key
  from public.agent_api_keys as k
  where k.id = v_key.id
  for update;

  -- Completed response bodies are replayable for only 15 minutes. Keep the
  -- idempotency record and accounting proof, but erase expired response text
  -- across all wallets whenever any Agent request is admitted. Operations
  -- must also schedule this statement so idle beta traffic cannot delay it.
  update public.agent_requests as r
  set result_payload =
    pg_catalog.jsonb_build_object('error', 'REPLAY_EXPIRED')
  where r.state = 'completed'
    and r.result_expires_at <= v_clock
    and r.result_payload ? 'response';

  select r.*
  into v_prior
  from public.agent_requests as r
  where r.wallet_id = v_wallet.id
    and r.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_prior.request_fingerprint <> p_request_fingerprint
      or v_prior.model_id <> p_model_id
      or v_prior.provider_cost_ceiling_micro_usd
        <> p_provider_cost_ceiling_micro_usd
      or v_prior.credit_ceiling <> p_credit_ceiling then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query
    select
      v_prior.id,
      v_prior.state,
      case when v_prior.state = 'running'
        then null::uuid else v_prior.owner_token end,
      v_prior.lease_expires_at,
      v_prior.result_payload,
      v_prior.result_expires_at,
      v_prior.remaining_credits,
      v_prior.error_code,
      v_prior.key_id,
      v_prior.user_id,
      v_prior.wallet_id;
    return;
  end if;

  select count(*)::integer
  into v_rate_count
  from public.agent_requests as r
  where r.key_id = v_key.id
    and r.created_at > v_clock - interval '1 minute';

  if v_rate_count >= v_key.rpm_limit then
    raise exception 'AGENT_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_key_concurrency
  from public.agent_requests as r
  where r.key_id = v_key.id
    and r.state = 'running'
    and r.lease_expires_at > v_clock;

  select count(*)::integer
  into v_wallet_concurrency
  from public.agent_requests as r
  where r.wallet_id = v_wallet.id
    and r.state = 'running'
    and r.lease_expires_at > v_clock;

  if v_key_concurrency >= v_key.concurrency_limit
    or v_wallet_concurrency >= 3 then
    raise exception 'AGENT_CONCURRENCY_LIMITED' using errcode = 'P0001';
  end if;

  if v_wallet.remaining_balance < p_credit_ceiling then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;
  if v_wallet.provider_committed_micro_usd
      + v_wallet.provider_reserved_micro_usd
      + p_provider_cost_ceiling_micro_usd > 250000
    or v_key.provider_committed_micro_usd
      + v_key.provider_reserved_micro_usd
      + p_provider_cost_ceiling_micro_usd
        > v_key.provider_cost_limit_micro_usd then
    raise exception 'PROVIDER_COST_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.wallets as w
  set
    remaining_balance = w.remaining_balance - p_credit_ceiling,
    reserved_balance = w.reserved_balance + p_credit_ceiling,
    provider_reserved_micro_usd =
      w.provider_reserved_micro_usd
        + p_provider_cost_ceiling_micro_usd
  where w.id = v_wallet.id
  returning w.* into v_wallet;

  update public.agent_api_keys as k
  set
    provider_reserved_micro_usd =
      k.provider_reserved_micro_usd
        + p_provider_cost_ceiling_micro_usd,
    last_used_at = v_clock
  where k.id = v_key.id
  returning k.* into v_key;

  insert into public.agent_requests (
    key_id,
    user_id,
    wallet_id,
    idempotency_key,
    request_fingerprint,
    model_id,
    provider_cost_ceiling_micro_usd,
    credit_ceiling,
    owner_token,
    lease_expires_at
  )
  values (
    v_key.id,
    v_key.user_id,
    v_key.wallet_id,
    p_idempotency_key,
    p_request_fingerprint,
    p_model_id,
    p_provider_cost_ceiling_micro_usd,
    p_credit_ceiling,
    p_owner_token,
    p_lease_expires_at
  )
  returning * into v_request;

  insert into public.agent_usage_entries (
    request_id,
    key_id,
    user_id,
    wallet_id,
    entry_kind,
    credits_delta,
    provider_cost_micro_usd,
    balance_after,
    reserved_after,
    provider_committed_after_micro_usd,
    provider_reserved_after_micro_usd
  )
  values (
    v_request.id,
    v_request.key_id,
    v_request.user_id,
    v_request.wallet_id,
    'reserve',
    -v_request.credit_ceiling,
    v_request.provider_cost_ceiling_micro_usd,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  );

  return query
  select
    v_request.id,
    v_request.state,
    v_request.owner_token,
    v_request.lease_expires_at,
    v_request.result_payload,
    v_request.result_expires_at,
    v_wallet.remaining_balance,
    v_request.error_code,
    v_request.key_id,
    v_request.user_id,
    v_request.wallet_id;
end;
$$;

create or replace function public.terminalize_agent_request(
  p_request_id uuid,
  p_owner_token uuid,
  p_state text,
  p_result_payload jsonb,
  p_input_units integer,
  p_output_units integer,
  p_provider_cost_micro_usd bigint,
  p_credits_charged integer,
  p_error_code text default null
)
returns table (
  request_id uuid,
  request_state text,
  result_payload jsonb,
  result_expires_at timestamptz,
  remaining_credits integer,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_identity record;
  v_request public.agent_requests%rowtype;
  v_key public.agent_api_keys%rowtype;
  v_wallet public.wallets%rowtype;
  v_credit_return integer;
begin
  if p_request_id is null
    or p_owner_token is null
    or p_state is null
    or p_state not in ('completed', 'failed')
    or p_result_payload is null
    or pg_catalog.jsonb_typeof(p_result_payload) <> 'object'
    or pg_catalog.octet_length(p_result_payload::text) not between 2 and 50000
    or p_input_units is null
    or p_input_units < 0
    or p_output_units is null
    or p_output_units < 0
    or p_provider_cost_micro_usd is null
    or p_provider_cost_micro_usd not between 0 and 250000
    or p_credits_charged is null
    or p_credits_charged not between 0 and 3000
    or (
      p_state = 'completed'
      and (
        p_error_code is not null
        or pg_catalog.coalesce(
          pg_catalog.jsonb_typeof(p_result_payload -> 'response'),
          ''
        ) <> 'object'
        or pg_catalog.coalesce(
          pg_catalog.jsonb_typeof(
            p_result_payload #> '{response,ygf}'
          ),
          ''
        ) <> 'object'
      )
    )
    or (
      p_state = 'failed'
      and (
        p_error_code is null
        or p_error_code not in (
          'PROVIDER_UNAVAILABLE',
          'AGENT_UNAVAILABLE'
        )
        or p_credits_charged <> 0
      )
    ) then
    raise exception 'AGENT_TERMINAL_INVALID' using errcode = 'P0001';
  end if;

  select r.wallet_id, r.key_id
  into v_identity
  from public.agent_requests as r
  where r.id = p_request_id;

  if not found then
    raise exception 'AGENT_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.id = v_identity.wallet_id
  for update;

  select k.*
  into v_key
  from public.agent_api_keys as k
  where k.id = v_identity.key_id
  for update;

  select r.*
  into v_request
  from public.agent_requests as r
  where r.id = p_request_id
  for update;

  if v_request.state in ('completed', 'failed') then
    return query
    select
      v_request.id,
      v_request.state,
      v_request.result_payload,
      v_request.result_expires_at,
      v_request.remaining_credits,
      v_request.error_code;
    return;
  end if;

  if v_request.owner_token <> p_owner_token
    or v_request.lease_expires_at <= v_clock
    or p_provider_cost_micro_usd
      > v_request.provider_cost_ceiling_micro_usd
    or (
      p_state = 'failed'
      and p_provider_cost_micro_usd
        <> v_request.provider_cost_ceiling_micro_usd
    )
    or p_credits_charged > v_request.credit_ceiling
    or v_wallet.reserved_balance < v_request.credit_ceiling
    or v_wallet.provider_reserved_micro_usd
      < v_request.provider_cost_ceiling_micro_usd
    or v_key.provider_reserved_micro_usd
      < v_request.provider_cost_ceiling_micro_usd then
    raise exception 'AGENT_TERMINAL_CONFLICT' using errcode = 'P0001';
  end if;

  v_credit_return := v_request.credit_ceiling - p_credits_charged;

  update public.wallets as w
  set
    remaining_balance = w.remaining_balance + v_credit_return,
    reserved_balance =
      w.reserved_balance - v_request.credit_ceiling,
    provider_reserved_micro_usd =
      w.provider_reserved_micro_usd
        - v_request.provider_cost_ceiling_micro_usd,
    provider_committed_micro_usd =
      w.provider_committed_micro_usd + p_provider_cost_micro_usd
  where w.id = v_wallet.id
  returning w.* into v_wallet;

  update public.agent_api_keys as k
  set
    provider_reserved_micro_usd =
      k.provider_reserved_micro_usd
        - v_request.provider_cost_ceiling_micro_usd,
    provider_committed_micro_usd =
      k.provider_committed_micro_usd + p_provider_cost_micro_usd,
    last_used_at = v_clock
  where k.id = v_key.id
  returning k.* into v_key;

  insert into public.agent_usage_entries (
    request_id,
    key_id,
    user_id,
    wallet_id,
    entry_kind,
    credits_delta,
    provider_cost_micro_usd,
    balance_after,
    reserved_after,
    provider_committed_after_micro_usd,
    provider_reserved_after_micro_usd
  )
  values (
    v_request.id,
    v_request.key_id,
    v_request.user_id,
    v_request.wallet_id,
    case when p_state = 'completed' then 'commit' else 'refund' end,
    v_credit_return,
    p_provider_cost_micro_usd,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  );

  update public.agent_requests as r
  set
    state = p_state,
    lease_expires_at = null,
    provider_cost_micro_usd = p_provider_cost_micro_usd,
    credits_charged = p_credits_charged,
    input_units = p_input_units,
    output_units = p_output_units,
    result_payload = case
      when p_state = 'completed' then
        pg_catalog.jsonb_set(
          p_result_payload,
          '{response,ygf,remaining_credits}',
          pg_catalog.to_jsonb(v_wallet.remaining_balance),
          true
        )
      else p_result_payload
    end,
    result_expires_at = v_clock + interval '15 minutes',
    remaining_credits = v_wallet.remaining_balance,
    error_code = p_error_code,
    completed_at = v_clock
  where r.id = v_request.id
  returning r.* into v_request;

  return query
  select
    v_request.id,
    v_request.state,
    v_request.result_payload,
    v_request.result_expires_at,
    v_request.remaining_credits,
    v_request.error_code;
end;
$$;

revoke all on function public.create_agent_api_key(
  uuid,
  text,
  smallint,
  text,
  text,
  timestamptz,
  integer,
  integer
) from public, anon, authenticated;
revoke all on function public.list_agent_api_keys(uuid)
  from public, anon, authenticated;
revoke all on function public.revoke_agent_api_key(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.rotate_agent_api_key(
  uuid,
  uuid,
  text,
  smallint,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.authenticate_agent_api_key(text)
  from public, anon, authenticated;
revoke all on function public.begin_agent_request(
  text,
  text,
  text,
  text,
  bigint,
  integer,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.terminalize_agent_request(
  uuid,
  uuid,
  text,
  jsonb,
  integer,
  integer,
  bigint,
  integer,
  text
) from public, anon, authenticated;

grant execute on function public.create_agent_api_key(
  uuid,
  text,
  smallint,
  text,
  text,
  timestamptz,
  integer,
  integer
) to service_role;
grant execute on function public.list_agent_api_keys(uuid)
  to service_role;
grant execute on function public.revoke_agent_api_key(uuid, uuid)
  to service_role;
grant execute on function public.rotate_agent_api_key(
  uuid,
  uuid,
  text,
  smallint,
  text,
  text,
  timestamptz
) to service_role;
grant execute on function public.authenticate_agent_api_key(text)
  to service_role;
grant execute on function public.begin_agent_request(
  text,
  text,
  text,
  text,
  bigint,
  integer,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.terminalize_agent_request(
  uuid,
  uuid,
  text,
  jsonb,
  integer,
  integer,
  bigint,
  integer,
  text
) to service_role;
