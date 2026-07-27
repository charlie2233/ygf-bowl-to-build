-- YGF Bowl-to-Build campaign ledger.
-- Claim plaintext is generated outside Postgres. Only SHA-256 digests enter
-- this schema, and abuse controls persist only short-lived HMAC digests.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  campaign_role text not null default 'user'
    check (campaign_role in ('user', 'admin')),
  display_name text
    check (display_name is null or char_length(display_name) between 1 and 100),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.promo_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  source text not null
    check (
      source in (
        'receipt-insert',
        'scratch-card',
        'counter-card',
        'poster',
        'creator',
        'staff',
        'soft-test'
      )
    ),
  code_count integer not null check (code_count between 1 and 10000),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (expires_at is null or expires_at > created_at),
  check (
    (status = 'pending' and activated_at is null)
    or (status in ('active', 'closed') and activated_at is not null)
  )
);

create table public.promo_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  batch_id uuid not null references public.promo_batches(id) on delete restrict,
  row_reference text not null
    check (
      row_reference ~ '^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$'
    ),
  code_hash text not null
    check (
      char_length(code_hash) = 64
      and code_hash ~ '^[0-9a-f]{64}$'
    ),
  state text not null default 'pending'
    check (
      state in ('pending', 'eligible', 'redeemed', 'expired', 'revoked')
    ),
  expires_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete restrict,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (state = 'redeemed' and redeemed_by is not null and redeemed_at is not null)
    or (state <> 'redeemed' and redeemed_by is null and redeemed_at is null)
  ),
  check (
    (state = 'revoked' and revoked_at is not null)
    or (state <> 'revoked' and revoked_at is null)
  ),
  check (expires_at is null or expires_at > created_at)
);

create table public.admin_inventory_mutations (
  request_id uuid primary key,
  operation text not null
    check (operation in ('create', 'activate', 'revoke')),
  request_fingerprint text not null
    check (
      char_length(request_fingerprint) = 64
      and request_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  operator_id uuid not null references auth.users(id) on delete restrict,
  batch_id uuid references public.promo_batches(id) on delete restrict,
  promo_code_id uuid references public.promo_codes(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  check (
    (operation in ('create', 'activate')
      and batch_id is not null
      and promo_code_id is null)
    or
    (operation = 'revoke'
      and batch_id is null
      and promo_code_id is not null)
  )
);

create table public.wallets (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  initial_balance integer not null default 3000
    check (initial_balance = 3000),
  remaining_balance integer not null default 3000
    check (remaining_balance >= 0),
  reserved_balance integer not null default 0
    check (reserved_balance >= 0),
  provider_committed_micro_usd bigint not null default 0
    check (provider_committed_micro_usd >= 0),
  provider_reserved_micro_usd bigint not null default 0
    check (provider_reserved_micro_usd >= 0),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default pg_catalog.now(),
  check (remaining_balance + reserved_balance <= initial_balance),
  check (
    provider_committed_micro_usd + provider_reserved_micro_usd <= 250000
  ),
  check (expires_at = created_at + interval '14 days')
);

create table public.ledger_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  promo_code_id uuid references public.promo_codes(id) on delete restrict,
  entry_kind text not null
    check (entry_kind in ('grant', 'reserve', 'commit', 'refund')),
  state text not null
    check (state in ('reserved', 'committed', 'refunded')),
  credits_delta integer not null,
  provider_cost_micro_usd bigint not null default 0
    check (provider_cost_micro_usd >= 0),
  idempotency_key text not null
    check (char_length(idempotency_key) between 1 and 128),
  reservation_id uuid references public.ledger_entries(id) on delete restrict,
  balance_after integer not null check (balance_after >= 0),
  reserved_after integer not null check (reserved_after >= 0),
  provider_committed_after_micro_usd bigint not null
    check (provider_committed_after_micro_usd >= 0),
  provider_reserved_after_micro_usd bigint not null
    check (provider_reserved_after_micro_usd >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
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
      and provider_cost_micro_usd = 0
      and promo_code_id is null
      and reservation_id is not null)
  ),
  check (
    provider_committed_after_micro_usd
      + provider_reserved_after_micro_usd <= 250000
  )
);

create table public.task_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reservation_id uuid not null unique
    references public.ledger_entries(id) on delete restrict,
  task_type text not null
    check (task_type in ('study', 'coding', 'career', 'pick-my-bowl')),
  title text not null check (char_length(title) between 1 and 200),
  model_id text not null check (char_length(model_id) between 1 and 200),
  input_units integer not null check (input_units >= 0),
  output_units integer not null check (output_units >= 0),
  provider_cost_micro_usd bigint not null
    check (provider_cost_micro_usd >= 0),
  status text not null check (status in ('completed', 'failed')),
  saved_output text,
  saved_output_retained boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  check (
    (saved_output_retained and saved_output is not null)
    or (not saved_output_retained and saved_output is null)
  )
);

create table public.task_executions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null
    check (char_length(idempotency_key) between 1 and 128),
  request_fingerprint text not null
    check (
      char_length(request_fingerprint) = 64
      and request_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  task_type text not null
    check (task_type in ('study', 'coding', 'career', 'pick-my-bowl')),
  model_id text not null check (char_length(model_id) between 1 and 200),
  provider_cost_ceiling_micro_usd bigint not null
    check (provider_cost_ceiling_micro_usd between 0 and 250000),
  state text not null check (state in ('running', 'completed', 'failed')),
  owner_token uuid not null,
  lease_expires_at timestamptz,
  result_payload jsonb,
  result_expires_at timestamptz,
  remaining_credits integer
    check (remaining_credits between 0 and 3000),
  session_id uuid references public.task_sessions(id) on delete cascade,
  error_code text
    check (
      error_code is null
      or error_code in ('PROVIDER_UNAVAILABLE', 'TASK_UNAVAILABLE')
    ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (user_id, idempotency_key),
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
      and result_payload is null
      and result_expires_at is null
      and remaining_credits is null
      and session_id is null
      and error_code is null)
    or
    (state = 'completed'
      and lease_expires_at is null
      and result_expires_at is not null
      and remaining_credits is not null
      and session_id is not null
      and error_code is null)
    or
    (state = 'failed'
      and lease_expires_at is null
      and result_expires_at is not null
      and remaining_credits is not null
      and session_id is not null
      and error_code is not null)
  ),
  check (
    result_expires_at is null
    or (
      result_expires_at >= created_at
      and result_expires_at <= updated_at + interval '15 minutes'
    )
  )
);

create or replace function public.is_safe_campaign_event_payload(
  p_name text,
  p_source text,
  p_metadata jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_value jsonb;
  v_text text;
  v_count integer;
begin
  if p_name is null
    or p_name <> all (
      array[
        'batch_distributed',
        'code_validated',
        'code_redeemed',
        'task_started',
        'task_completed',
        'task_failed',
        'partner_cta_viewed',
        'partner_connected'
      ]::text[]
    ) then
    return false;
  end if;

  if p_source is not null
    and p_source <> all (
      array[
        'direct',
        'landing',
        'offer',
        'receipt-qr',
        'counter-card',
        'poster',
        'creator',
        'wallet',
        'task',
        'admin',
        'staff'
      ]::text[]
    ) then
    return false;
  end if;

  if p_metadata is null
    or pg_catalog.jsonb_typeof(p_metadata) <> 'object' then
    return false;
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.jsonb_object_keys(p_metadata);
  if v_count > 7 then
    return false;
  end if;

  for v_key, v_value in
    select entry.key, entry.value
    from pg_catalog.jsonb_each(p_metadata) as entry
  loop
    if v_key ~* '(code|claim|promo|prompt|input|ip|device|email|secret|token|address)' then
      return false;
    end if;

    if not (
      (p_name = 'batch_distributed' and v_key = 'count')
      or
      (p_name = 'code_validated' and v_key = 'outcome')
      or
      (p_name = 'code_redeemed'
        and v_key in ('outcome', 'credits', 'isReturning'))
      or
      (p_name = 'task_started'
        and v_key in ('taskType', 'isReturning'))
      or
      (p_name = 'task_completed'
        and v_key in (
          'taskType',
          'outcome',
          'credits',
          'latencyBucket',
          'isReturning'
        ))
      or
      (p_name = 'task_failed'
        and v_key in ('taskType', 'outcome', 'latencyBucket'))
      or
      (p_name in ('partner_cta_viewed', 'partner_connected')
        and v_key = 'connectionState')
    ) then
      return false;
    end if;

    if pg_catalog.jsonb_typeof(v_value) = 'string' then
      v_text := v_value #>> '{}';
      if pg_catalog.char_length(v_text) > 32
        or v_text ~* '^[a-z0-9]{8}$'
        or v_text ~ '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$'
        or pg_catalog.strpos(v_text, ':') > 0 then
        return false;
      end if;
    end if;

    case v_key
      when 'taskType' then
        if pg_catalog.jsonb_typeof(v_value) <> 'string'
          or (v_value #>> '{}') <> all (
            array[
              'study',
              'coding',
              'career',
              'pick-my-bowl'
            ]::text[]
          ) then
          return false;
        end if;
      when 'outcome' then
        if pg_catalog.jsonb_typeof(v_value) <> 'string'
          or (v_value #>> '{}') <> all (
            array[
              'success',
              'failure',
              'invalid',
              'expired',
              'revoked',
              'blocked',
              'throttled'
            ]::text[]
          ) then
          return false;
        end if;
      when 'latencyBucket' then
        if pg_catalog.jsonb_typeof(v_value) <> 'string'
          or (v_value #>> '{}') <> all (
            array[
              'under-30s',
              '30-60s',
              '60-90s',
              'over-90s'
            ]::text[]
          ) then
          return false;
        end if;
      when 'connectionState' then
        if pg_catalog.jsonb_typeof(v_value) <> 'string'
          or (v_value #>> '{}') <> all (
            array['shown', 'started', 'connected', 'failed']::text[]
          ) then
          return false;
        end if;
      when 'count' then
        if pg_catalog.jsonb_typeof(v_value) <> 'number'
          or (v_value #>> '{}') !~ '^[0-9]+$'
          or (v_value #>> '{}')::numeric > 10000 then
          return false;
        end if;
      when 'credits' then
        if pg_catalog.jsonb_typeof(v_value) <> 'number'
          or (v_value #>> '{}') !~ '^[0-9]+$'
          or (v_value #>> '{}')::numeric > 3000 then
          return false;
        end if;
      when 'isReturning' then
        if pg_catalog.jsonb_typeof(v_value) <> 'boolean' then
          return false;
        end if;
      else
        return false;
    end case;
  end loop;

  return true;
end;
$$;

create table public.events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  retain_until timestamptz not null
    default (pg_catalog.now() + interval '90 days'),
  check (
    public.is_safe_campaign_event_payload(name, source, metadata)
  ),
  check (retain_until > created_at)
);

create table public.redemption_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  signal_digest text not null
    check (
      char_length(signal_digest) = 64
      and signal_digest ~ '^[0-9a-f]{64}$'
    ),
  signal_version text not null check (signal_version = 'v1'),
  signal_purpose text not null
    check (signal_purpose ~ '^[a-z][a-z0-9-]{0,63}$'),
  signal_bucket bigint not null check (signal_bucket >= 0),
  outcome text not null
    check (
      outcome in (
        'accepted',
        'invalid',
        'unavailable',
        'throttled'
      )
    ),
  created_at timestamptz not null default pg_catalog.now(),
  finalized_at timestamptz,
  expires_at timestamptz not null,
  check (expires_at > created_at),
  check (finalized_at is null or finalized_at >= created_at),
  check (
    outcome = 'unavailable'
    or (
      outcome in ('accepted', 'invalid', 'throttled')
      and finalized_at is not null
    )
  )
);

create table public.public_validation_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  signal_digest text not null
    check (
      char_length(signal_digest) = 64
      and signal_digest ~ '^[0-9a-f]{64}$'
    ),
  signal_version text not null check (signal_version = 'v1'),
  signal_purpose text not null check (signal_purpose = 'validate-code'),
  signal_bucket bigint not null check (signal_bucket >= 0),
  allowed boolean not null,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  check (expires_at > created_at),
  check (
    expires_at = pg_catalog.to_timestamp(
      ((signal_bucket + 1) * 300)::double precision
    )
  )
);

create table public.partner_connections (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 80),
  external_subject_hash text not null
    check (
      char_length(external_subject_hash) = 64
      and external_subject_hash ~ '^[0-9a-f]{64}$'
    ),
  status text not null default 'connected'
    check (status in ('connected', 'revoked')),
  connected_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  unique (user_id, provider),
  check (
    (status = 'revoked' and revoked_at is not null)
    or (status = 'connected' and revoked_at is null)
  )
);

create table public.provider_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  model_id text not null unique
    check (char_length(model_id) between 1 and 200),
  active boolean not null default false,
  maximum_request_cost_micro_usd bigint not null
    check (
      maximum_request_cost_micro_usd between 0 and 250000
    ),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create unique index promo_codes_code_hash_idx
  on public.promo_codes (code_hash);
create unique index promo_codes_row_reference_idx
  on public.promo_codes (row_reference);
create index promo_batches_created_by_idx
  on public.promo_batches (created_by);
create index promo_codes_batch_id_idx
  on public.promo_codes (batch_id);
create index promo_codes_redeemed_by_idx
  on public.promo_codes (redeemed_by)
  where redeemed_by is not null;
create index promo_codes_eligible_expiry_idx
  on public.promo_codes (expires_at)
  where state = 'eligible';
create index admin_inventory_mutations_operator_created_idx
  on public.admin_inventory_mutations (operator_id, created_at desc);
create index wallets_user_id_idx
  on public.wallets (user_id);
create index ledger_entries_wallet_id_idx
  on public.ledger_entries (wallet_id);
create index ledger_entries_user_id_created_at_idx
  on public.ledger_entries (user_id, created_at desc);
create index ledger_entries_promo_code_id_idx
  on public.ledger_entries (promo_code_id)
  where promo_code_id is not null;
create index ledger_entries_reservation_id_idx
  on public.ledger_entries (reservation_id)
  where reservation_id is not null;
create unique index ledger_entries_user_kind_idempotency_idx
  on public.ledger_entries (user_id, entry_kind, idempotency_key);
create unique index ledger_entries_terminal_reservation_idx
  on public.ledger_entries (reservation_id)
  where entry_kind in ('commit', 'refund');
create unique index ledger_entries_grant_code_idx
  on public.ledger_entries (promo_code_id)
  where entry_kind = 'grant';
create index task_sessions_user_id_created_at_idx
  on public.task_sessions (user_id, created_at desc);
create index task_executions_user_id_created_at_idx
  on public.task_executions (user_id, created_at desc);
create index task_executions_result_expiry_idx
  on public.task_executions (result_expires_at, id)
  where result_payload is not null;
create index events_user_id_created_at_idx
  on public.events (user_id, created_at desc)
  where user_id is not null;
create index events_retain_until_idx
  on public.events (retain_until);
create index redemption_attempts_signal_bucket_idx
  on public.redemption_attempts (
    signal_purpose,
    signal_digest,
    signal_bucket
  );
create index redemption_attempts_user_id_idx
  on public.redemption_attempts (user_id)
  where user_id is not null;
create index redemption_attempts_user_bucket_idx
  on public.redemption_attempts (user_id, signal_bucket)
  where user_id is not null;
create index redemption_attempts_expires_at_idx
  on public.redemption_attempts (expires_at);
create index public_validation_attempts_admitted_signal_bucket_idx
  on public.public_validation_attempts (
    signal_version,
    signal_purpose,
    signal_digest,
    signal_bucket
  )
  where allowed;
create index public_validation_attempts_expires_at_idx
  on public.public_validation_attempts (expires_at, id);
create index partner_connections_user_id_idx
  on public.partner_connections (user_id);
create index provider_policies_created_by_idx
  on public.provider_policies (created_by);
create index provider_policies_active_idx
  on public.provider_policies (model_id)
  where active;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger promo_batches_set_updated_at
before update on public.promo_batches
for each row execute function public.set_updated_at();

create trigger promo_codes_set_updated_at
before update on public.promo_codes
for each row execute function public.set_updated_at();

create trigger wallets_set_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

create trigger ledger_entries_set_updated_at
before update on public.ledger_entries
for each row execute function public.set_updated_at();

create trigger task_executions_set_updated_at
before update on public.task_executions
for each row execute function public.set_updated_at();

create trigger partner_connections_set_updated_at
before update on public.partner_connections
for each row execute function public.set_updated_at();

create trigger provider_policies_set_updated_at
before update on public.provider_policies
for each row execute function public.set_updated_at();

create or replace function public.handle_campaign_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_campaign_auth_user() from public;

create trigger campaign_auth_user_created
after insert on auth.users
for each row execute function public.handle_campaign_auth_user();

create or replace function public.is_campaign_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.campaign_role = 'admin'
  );
$$;

revoke all on function public.is_campaign_admin() from public;
grant execute on function public.is_campaign_admin()
  to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.promo_batches enable row level security;
alter table public.promo_batches force row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_codes force row level security;
alter table public.admin_inventory_mutations enable row level security;
alter table public.admin_inventory_mutations force row level security;
alter table public.wallets enable row level security;
alter table public.wallets force row level security;
alter table public.ledger_entries enable row level security;
alter table public.ledger_entries force row level security;
alter table public.task_sessions enable row level security;
alter table public.task_sessions force row level security;
alter table public.task_executions enable row level security;
alter table public.task_executions force row level security;
alter table public.events enable row level security;
alter table public.events force row level security;
alter table public.redemption_attempts enable row level security;
alter table public.redemption_attempts force row level security;
alter table public.public_validation_attempts enable row level security;
alter table public.public_validation_attempts force row level security;
alter table public.partner_connections enable row level security;
alter table public.partner_connections force row level security;
alter table public.provider_policies enable row level security;
alter table public.provider_policies force row level security;

create policy profiles_user_select
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_campaign_admin())
);

create policy profiles_user_update
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy promo_batches_admin_select
on public.promo_batches
for select
to authenticated
using ((select public.is_campaign_admin()));

create policy promo_codes_admin_select
on public.promo_codes
for select
to authenticated
using ((select public.is_campaign_admin()));

create policy wallets_user_select
on public.wallets
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_campaign_admin())
);

create policy ledger_entries_user_select
on public.ledger_entries
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_campaign_admin())
);

create policy task_sessions_user_select
on public.task_sessions
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_campaign_admin())
);

create policy events_user_select
on public.events
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_campaign_admin())
);

create policy redemption_attempts_admin_select
on public.redemption_attempts
for select
to authenticated
using ((select public.is_campaign_admin()));

create policy public_validation_attempts_admin_select
on public.public_validation_attempts
for select
to authenticated
using ((select public.is_campaign_admin()));

create policy partner_connections_user_select
on public.partner_connections
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_campaign_admin())
);

create policy provider_policies_active_select
on public.provider_policies
for select
to authenticated
using (
  active
  or (select public.is_campaign_admin())
);

create policy provider_policies_admin_all
on public.provider_policies
for all
to authenticated
using ((select public.is_campaign_admin()))
with check ((select public.is_campaign_admin()));

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.promo_batches from anon, authenticated;
revoke all on table public.promo_codes from anon, authenticated;
revoke all on table public.admin_inventory_mutations
  from public, anon, authenticated;
revoke all on table public.wallets from anon, authenticated;
revoke all on table public.ledger_entries from anon, authenticated;
revoke all on table public.task_sessions from anon, authenticated;
revoke all on table public.task_executions from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.redemption_attempts from anon, authenticated;
revoke all on table public.public_validation_attempts
  from anon, authenticated;
revoke all on table public.partner_connections from anon, authenticated;
revoke all on table public.provider_policies from anon, authenticated;

grant select on table
  public.profiles,
  public.promo_batches,
  public.promo_codes,
  public.wallets,
  public.ledger_entries,
  public.task_sessions,
  public.events,
  public.redemption_attempts,
  public.partner_connections,
  public.provider_policies
to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant insert, update, delete on table public.provider_policies
  to authenticated;

create or replace function public.admit_campaign_public_validation(
  p_signal_digest text,
  p_signal_version text,
  p_signal_purpose text,
  p_signal_bucket bigint,
  p_signal_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_current_signal_bucket bigint;
  v_expected_expires_at timestamptz;
  v_signal_lock_key bigint;
  v_admitted_count bigint;
  v_allowed boolean;
begin
  v_current_signal_bucket :=
    pg_catalog.floor(pg_catalog.date_part('epoch', v_now) / 300)::bigint;

  if p_signal_digest is null
    or p_signal_digest !~ '^[0-9a-f]{64}$'
    or p_signal_version is null
    or p_signal_version <> 'v1'
    or p_signal_purpose is null
    or p_signal_purpose <> 'validate-code'
    or p_signal_bucket is null
    or p_signal_bucket <> v_current_signal_bucket
    or p_signal_expires_at is null then
    raise exception 'ABUSE_SIGNAL_INVALID' using errcode = 'P0001';
  end if;

  v_expected_expires_at := pg_catalog.to_timestamp(
    ((p_signal_bucket + 1) * 300)::double precision
  );
  if p_signal_expires_at is distinct from v_expected_expires_at
    or p_signal_expires_at <= v_now then
    raise exception 'ABUSE_SIGNAL_INVALID' using errcode = 'P0001';
  end if;

  v_signal_lock_key := pg_catalog.hashtextextended(
    'ygf:public-validation:signal:'
      || p_signal_version
      || ':'
      || p_signal_purpose
      || ':'
      || p_signal_bucket::text
      || ':'
      || p_signal_digest,
    0
  );
  perform pg_catalog.pg_advisory_xact_lock(v_signal_lock_key);

  with expired_attempts as (
    select a.id
    from public.public_validation_attempts as a
    where a.expires_at <= v_now
    order by a.expires_at, a.id
    limit 500
    for update skip locked
  )
  delete from public.public_validation_attempts as a
  using expired_attempts as expired
  where a.id = expired.id;

  select pg_catalog.count(*)
  into v_admitted_count
  from public.public_validation_attempts as a
  where a.signal_version = p_signal_version
    and a.signal_purpose = p_signal_purpose
    and a.signal_digest = p_signal_digest
    and a.signal_bucket = p_signal_bucket
    and a.allowed;

  v_allowed := v_admitted_count < 30;

  insert into public.public_validation_attempts (
    signal_digest,
    signal_version,
    signal_purpose,
    signal_bucket,
    allowed,
    created_at,
    expires_at
  )
  values (
    p_signal_digest,
    p_signal_version,
    p_signal_purpose,
    p_signal_bucket,
    v_allowed,
    v_now,
    p_signal_expires_at
  );

  return v_allowed;
end;
$$;

create or replace function public.admit_campaign_redemption_attempt(
  p_user_id uuid,
  p_signal_digest text,
  p_signal_version text,
  p_signal_purpose text,
  p_signal_bucket bigint,
  p_signal_expires_at timestamptz
)
returns table (
  attempt_id uuid,
  allowed boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_current_signal_bucket bigint;
  v_expected_expires_at timestamptz;
  v_user_lock_key bigint;
  v_signal_lock_key bigint;
  v_first_lock_key bigint;
  v_second_lock_key bigint;
  v_user_admitted_count bigint;
  v_signal_admitted_count bigint;
  v_allowed boolean;
  v_attempt_id uuid;
begin
  v_current_signal_bucket :=
    pg_catalog.floor(pg_catalog.date_part('epoch', v_now) / 300)::bigint;

  if p_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_signal_digest is null
    or p_signal_digest !~ '^[0-9a-f]{64}$'
    or p_signal_version is null
    or p_signal_version <> 'v1'
    or p_signal_purpose is null
    or p_signal_purpose !~ '^[a-z][a-z0-9-]{0,63}$'
    or p_signal_bucket is null
    or p_signal_bucket <> v_current_signal_bucket
    or p_signal_expires_at is null then
    raise exception 'ABUSE_SIGNAL_INVALID' using errcode = 'P0001';
  end if;

  v_expected_expires_at := pg_catalog.to_timestamp(
    ((p_signal_bucket + 1) * 300)::double precision
  );
  if p_signal_expires_at is distinct from v_expected_expires_at
    or p_signal_expires_at <= v_now then
    raise exception 'ABUSE_SIGNAL_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from auth.users as u
    where u.id = p_user_id
  ) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  v_user_lock_key := pg_catalog.hashtextextended(
    'ygf:redemption:user:v1:'
      || p_signal_bucket::text
      || ':'
      || p_user_id::text,
    0
  );
  v_signal_lock_key := pg_catalog.hashtextextended(
    'ygf:redemption:signal:'
      || p_signal_version
      || ':'
      || p_signal_purpose
      || ':'
      || p_signal_bucket::text
      || ':'
      || p_signal_digest,
    0
  );

  if v_user_lock_key <= v_signal_lock_key then
    v_first_lock_key := v_user_lock_key;
    v_second_lock_key := v_signal_lock_key;
  else
    v_first_lock_key := v_signal_lock_key;
    v_second_lock_key := v_user_lock_key;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(v_first_lock_key);
  if v_second_lock_key <> v_first_lock_key then
    perform pg_catalog.pg_advisory_xact_lock(v_second_lock_key);
  end if;

  select pg_catalog.count(*)
  into v_user_admitted_count
  from public.redemption_attempts as a
  where a.user_id = p_user_id
    and a.signal_bucket = p_signal_bucket
    and a.outcome <> 'throttled';

  select pg_catalog.count(*)
  into v_signal_admitted_count
  from public.redemption_attempts as a
  where a.signal_version = p_signal_version
    and a.signal_purpose = p_signal_purpose
    and a.signal_digest = p_signal_digest
    and a.signal_bucket = p_signal_bucket
    and a.outcome <> 'throttled';

  v_allowed :=
    v_user_admitted_count < 5
    and v_signal_admitted_count < 20;

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
  values (
    p_user_id,
    p_signal_digest,
    p_signal_version,
    p_signal_purpose,
    p_signal_bucket,
    case when v_allowed then 'unavailable' else 'throttled' end,
    v_now,
    case when v_allowed then null else v_now end,
    p_signal_expires_at
  )
  returning id into v_attempt_id;

  return query
  select v_attempt_id, v_allowed;
end;
$$;

create or replace function public.finish_campaign_redemption_attempt(
  p_attempt_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt public.redemption_attempts%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  if p_attempt_id is null
    or p_outcome is null
    or p_outcome not in ('accepted', 'invalid', 'unavailable') then
    raise exception 'REDEMPTION_ATTEMPT_INVALID' using errcode = 'P0001';
  end if;

  select a.*
  into v_attempt
  from public.redemption_attempts as a
  where a.id = p_attempt_id
  for update;

  if not found then
    raise exception 'REDEMPTION_ATTEMPT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_attempt.outcome = 'throttled' then
    raise exception 'REDEMPTION_ATTEMPT_FINALIZATION_BLOCKED'
      using errcode = 'P0001';
  end if;
  if v_attempt.finalized_at is not null then
    if v_attempt.outcome is distinct from p_outcome then
      raise exception 'REDEMPTION_ATTEMPT_FINALIZATION_CONFLICT'
        using errcode = 'P0001';
    end if;
    return;
  end if;

  update public.redemption_attempts
  set
    outcome = p_outcome,
    finalized_at = v_now
  where id = p_attempt_id;
end;
$$;

create or replace function public.redeem_campaign_code(
  p_user_id uuid,
  p_code_hash text,
  p_idempotency_key text
)
returns table (
  code_id uuid,
  redeemed_at timestamptz,
  wallet_id uuid,
  wallet_user_id uuid,
  initial_balance integer,
  remaining_balance integer,
  reserved_balance integer,
  provider_committed_micro_usd bigint,
  provider_reserved_micro_usd bigint,
  wallet_created_at timestamptz,
  expires_at timestamptz,
  ledger_entry_id uuid,
  ledger_state text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := p_user_id;
  v_code public.promo_codes%rowtype;
  v_wallet public.wallets%rowtype;
  v_prior public.ledger_entries%rowtype;
  v_prior_code_hash text;
  v_grant public.ledger_entries%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_code_hash is null
    or p_code_hash !~ '^[0-9a-f]{64}$'
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 128 then
    raise exception 'INVALID_REDEMPTION_REQUEST' using errcode = 'P0001';
  end if;

  insert into public.profiles (id)
  values (v_user_id)
  on conflict (id) do nothing;

  perform p.id
  from public.profiles as p
  where p.id = v_user_id
  for update;

  select l.*
  into v_prior
  from public.ledger_entries as l
  where l.user_id = v_user_id
    and l.entry_kind = 'grant'
    and l.idempotency_key = p_idempotency_key
  for update;

  if found then
    select c.code_hash
    into v_prior_code_hash
    from public.promo_codes as c
    where c.id = v_prior.promo_code_id;

    if v_prior_code_hash is distinct from p_code_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query
    select
      v_prior.promo_code_id,
      v_prior.created_at,
      v_prior.wallet_id,
      w.user_id,
      w.initial_balance,
      v_prior.balance_after,
      v_prior.reserved_after,
      v_prior.provider_committed_after_micro_usd,
      v_prior.provider_reserved_after_micro_usd,
      w.created_at,
      w.expires_at,
      v_prior.id,
      v_prior.state
    from public.wallets as w
    where w.id = v_prior.wallet_id;
    return;
  end if;

  select c.*
  into v_code
  from public.promo_codes as c
  where c.code_hash = p_code_hash
  for update;

  if not found then
    raise exception 'CODE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_code.state = 'redeemed' then
    raise exception 'CODE_ALREADY_REDEEMED' using errcode = 'P0001';
  elsif v_code.state = 'revoked' then
    raise exception 'CODE_REVOKED' using errcode = 'P0001';
  elsif v_code.state = 'expired'
    or (v_code.expires_at is not null and v_code.expires_at <= v_now) then
    update public.promo_codes
    set state = 'expired'
    where id = v_code.id;
    raise exception 'CODE_EXPIRED' using errcode = 'P0001';
  elsif v_code.state <> 'eligible' then
    -- Pending inventory is deliberately indistinguishable from an unknown
    -- claim until an administrator confirms the private file was saved.
    raise exception 'CODE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.wallets as w where w.user_id = v_user_id
  ) then
    raise exception 'ACCOUNT_ALREADY_REDEEMED' using errcode = 'P0001';
  end if;

  insert into public.wallets (
    user_id,
    initial_balance,
    remaining_balance,
    reserved_balance,
    provider_committed_micro_usd,
    provider_reserved_micro_usd,
    created_at,
    expires_at
  )
  values (
    v_user_id,
    3000,
    3000,
    0,
    0,
    0,
    v_now,
    v_now + interval '14 days'
  )
  returning * into v_wallet;

  update public.promo_codes
  set
    state = 'redeemed',
    redeemed_by = v_user_id,
    redeemed_at = v_now
  where id = v_code.id;

  insert into public.ledger_entries (
    wallet_id,
    user_id,
    promo_code_id,
    entry_kind,
    state,
    credits_delta,
    provider_cost_micro_usd,
    idempotency_key,
    balance_after,
    reserved_after,
    provider_committed_after_micro_usd,
    provider_reserved_after_micro_usd
  )
  values (
    v_wallet.id,
    v_user_id,
    v_code.id,
    'grant',
    'committed',
    3000,
    0,
    p_idempotency_key,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  )
  returning * into v_grant;

  return query
  select
    v_code.id,
    v_grant.created_at,
    v_wallet.id,
    v_wallet.user_id,
    v_wallet.initial_balance,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd,
    v_wallet.created_at,
    v_wallet.expires_at,
    v_grant.id,
    v_grant.state;
end;
$$;

create or replace function public.create_campaign_admin_batch(
  p_operator_id uuid,
  p_request_id uuid,
  p_name text,
  p_source text,
  p_expires_at timestamptz,
  p_code_hashes text[],
  p_row_references text[]
)
returns table (
  batch_id uuid,
  batch_name text,
  batch_source text,
  code_count integer,
  batch_status text,
  expires_at timestamptz,
  created_at timestamptz,
  activated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_name text := pg_catalog.btrim(p_name);
  v_count integer := pg_catalog.coalesce(
    pg_catalog.array_length(p_code_hashes, 1),
    0
  );
  v_fingerprint text;
  v_mutation public.admin_inventory_mutations%rowtype;
  v_batch public.promo_batches%rowtype;
begin
  if p_operator_id is null
    or p_request_id is null
    or v_name is null
    or pg_catalog.char_length(v_name) not between 1 and 120
    or p_source is null
    or p_source not in (
      'receipt-insert',
      'scratch-card',
      'counter-card',
      'poster',
      'creator',
      'staff',
      'soft-test'
    )
    or v_count not between 1 and 3000
    or pg_catalog.coalesce(
      pg_catalog.array_length(p_row_references, 1),
      0
    ) <> v_count
    or p_expires_at is not null
      and p_expires_at <= v_now
    or exists (
      select 1
      from pg_catalog.unnest(p_code_hashes) as candidate(code_hash)
      where candidate.code_hash is null
        or candidate.code_hash !~ '^[0-9a-f]{64}$'
    )
    or exists (
      select 1
      from pg_catalog.unnest(p_row_references)
        as candidate(row_reference)
      where candidate.row_reference is null
        or candidate.row_reference
          !~ '^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$'
    )
    or (
      select pg_catalog.count(distinct candidate.code_hash)
      from pg_catalog.unnest(p_code_hashes) as candidate(code_hash)
    ) <> v_count
    or (
      select pg_catalog.count(distinct candidate.row_reference)
      from pg_catalog.unnest(p_row_references)
        as candidate(row_reference)
    ) <> v_count then
    raise exception 'ADMIN_BATCH_INVALID' using errcode = 'P0001';
  end if;

  perform p.id
  from public.profiles as p
  where p.id = p_operator_id
    and p.campaign_role = 'admin';
  if not found then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'operation', 'create',
          'operatorId', p_operator_id,
          'name', v_name,
          'source', p_source,
          'expiresAt', p_expires_at,
          'codeHashes', p_code_hashes,
          'rowReferences', p_row_references
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ygf:admin-inventory:' || p_request_id::text,
      0
    )
  );

  select m.*
  into v_mutation
  from public.admin_inventory_mutations as m
  where m.request_id = p_request_id
  for update;

  if found then
    if v_mutation.operation <> 'create'
      or v_mutation.operator_id <> p_operator_id
      or v_mutation.request_fingerprint <> v_fingerprint
      or v_mutation.batch_id is null then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select
      b.id,
      b.name,
      b.source,
      b.code_count,
      b.status,
      b.expires_at,
      b.created_at,
      b.activated_at
    from public.promo_batches as b
    where b.id = v_mutation.batch_id;
    return;
  end if;

  insert into public.promo_batches (
    name,
    source,
    code_count,
    status,
    created_by,
    expires_at,
    created_at,
    updated_at
  )
  values (
    v_name,
    p_source,
    v_count,
    'pending',
    p_operator_id,
    p_expires_at,
    v_now,
    v_now
  )
  returning * into v_batch;

  insert into public.promo_codes (
    batch_id,
    row_reference,
    code_hash,
    state,
    expires_at,
    created_at,
    updated_at
  )
  select
    v_batch.id,
    row_item.row_reference,
    hash_item.code_hash,
    'pending',
    p_expires_at,
    v_now,
    v_now
  from pg_catalog.unnest(p_code_hashes)
    with ordinality as hash_item(code_hash, ordinal)
  join pg_catalog.unnest(p_row_references)
    with ordinality as row_item(row_reference, ordinal)
    using (ordinal);

  insert into public.admin_inventory_mutations (
    request_id,
    operation,
    request_fingerprint,
    operator_id,
    batch_id,
    created_at
  )
  values (
    p_request_id,
    'create',
    v_fingerprint,
    p_operator_id,
    v_batch.id,
    v_now
  );

  return query
  select
    v_batch.id,
    v_batch.name,
    v_batch.source,
    v_batch.code_count,
    v_batch.status,
    v_batch.expires_at,
    v_batch.created_at,
    v_batch.activated_at;
end;
$$;

create or replace function public.activate_campaign_admin_batch(
  p_operator_id uuid,
  p_request_id uuid,
  p_batch_id uuid
)
returns table (
  batch_id uuid,
  batch_name text,
  batch_source text,
  code_count integer,
  batch_status text,
  expires_at timestamptz,
  created_at timestamptz,
  activated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_fingerprint text;
  v_mutation public.admin_inventory_mutations%rowtype;
  v_batch public.promo_batches%rowtype;
  v_code_count integer;
  v_event_source text;
begin
  if p_operator_id is null
    or p_request_id is null
    or p_batch_id is null then
    raise exception 'ADMIN_BATCH_ACTIVATION_INVALID'
      using errcode = 'P0001';
  end if;

  perform p.id
  from public.profiles as p
  where p.id = p_operator_id
    and p.campaign_role = 'admin';
  if not found then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'operation', 'activate',
          'operatorId', p_operator_id,
          'batchId', p_batch_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ygf:admin-inventory:' || p_request_id::text,
      0
    )
  );

  select m.*
  into v_mutation
  from public.admin_inventory_mutations as m
  where m.request_id = p_request_id
  for update;

  if found then
    if v_mutation.operation <> 'activate'
      or v_mutation.operator_id <> p_operator_id
      or v_mutation.request_fingerprint <> v_fingerprint
      or v_mutation.batch_id <> p_batch_id then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select
      b.id,
      b.name,
      b.source,
      b.code_count,
      b.status,
      b.expires_at,
      b.created_at,
      b.activated_at
    from public.promo_batches as b
    where b.id = v_mutation.batch_id;
    return;
  end if;

  select b.*
  into v_batch
  from public.promo_batches as b
  where b.id = p_batch_id
  for update;

  if not found then
    raise exception 'ADMIN_BATCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_batch.status <> 'pending'
    or v_batch.activated_at is not null
    or (
      v_batch.expires_at is not null
      and v_batch.expires_at <= v_now
    ) then
    raise exception 'ADMIN_BATCH_NOT_ACTIVATABLE'
      using errcode = 'P0001';
  end if;

  perform c.id
  from public.promo_codes as c
  where c.batch_id = v_batch.id
  order by c.id
  for update;

  select pg_catalog.count(*)::integer
  into v_code_count
  from public.promo_codes as c
  where c.batch_id = v_batch.id
    and c.state = 'pending';

  if v_code_count <> v_batch.code_count
    or exists (
      select 1
      from public.promo_codes as c
      where c.batch_id = v_batch.id
        and c.state <> 'pending'
    ) then
    raise exception 'ADMIN_BATCH_INVENTORY_INVALID'
      using errcode = 'P0001';
  end if;

  update public.promo_codes as c
  set
    state = 'eligible',
    updated_at = v_now
  where c.batch_id = v_batch.id
    and c.state = 'pending';

  update public.promo_batches as b
  set
    status = 'active',
    activated_at = v_now,
    updated_at = v_now
  where b.id = v_batch.id
  returning b.* into v_batch;

  v_event_source := case v_batch.source
    when 'receipt-insert' then 'receipt-qr'
    when 'scratch-card' then 'staff'
    when 'soft-test' then 'admin'
    else v_batch.source
  end;

  insert into public.events (
    user_id,
    name,
    source,
    metadata,
    created_at,
    retain_until
  )
  values (
    p_operator_id,
    'batch_distributed',
    v_event_source,
    pg_catalog.jsonb_build_object('count', v_batch.code_count),
    v_now,
    v_now + interval '90 days'
  );

  insert into public.admin_inventory_mutations (
    request_id,
    operation,
    request_fingerprint,
    operator_id,
    batch_id,
    created_at
  )
  values (
    p_request_id,
    'activate',
    v_fingerprint,
    p_operator_id,
    v_batch.id,
    v_now
  );

  return query
  select
    v_batch.id,
    v_batch.name,
    v_batch.source,
    v_batch.code_count,
    v_batch.status,
    v_batch.expires_at,
    v_batch.created_at,
    v_batch.activated_at;
end;
$$;

create or replace function public.revoke_campaign_admin_code(
  p_operator_id uuid,
  p_request_id uuid,
  p_row_reference text
)
returns table (
  code_id uuid,
  row_reference text,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row_reference text := pg_catalog.upper(
    pg_catalog.btrim(p_row_reference)
  );
  v_fingerprint text;
  v_mutation public.admin_inventory_mutations%rowtype;
  v_code public.promo_codes%rowtype;
begin
  if p_operator_id is null
    or p_request_id is null
    or v_row_reference is null
    or v_row_reference
      !~ '^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$' then
    raise exception 'ADMIN_ROW_REFERENCE_INVALID'
      using errcode = 'P0001';
  end if;

  perform p.id
  from public.profiles as p
  where p.id = p_operator_id
    and p.campaign_role = 'admin';
  if not found then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'operation', 'revoke',
          'operatorId', p_operator_id,
          'rowReference', v_row_reference
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ygf:admin-inventory:' || p_request_id::text,
      0
    )
  );

  select m.*
  into v_mutation
  from public.admin_inventory_mutations as m
  where m.request_id = p_request_id
  for update;

  if found then
    if v_mutation.operation <> 'revoke'
      or v_mutation.operator_id <> p_operator_id
      or v_mutation.request_fingerprint <> v_fingerprint
      or v_mutation.promo_code_id is null then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select c.id, c.row_reference, c.revoked_at
    from public.promo_codes as c
    where c.id = v_mutation.promo_code_id;
    return;
  end if;

  select c.*
  into v_code
  from public.promo_codes as c
  where c.row_reference = v_row_reference
  for update;

  if not found then
    raise exception 'ADMIN_CODE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_code.state not in ('pending', 'eligible')
    or (
      v_code.expires_at is not null
      and v_code.expires_at <= v_now
    ) then
    raise exception 'ADMIN_CODE_NOT_REVOCABLE'
      using errcode = 'P0001';
  end if;

  update public.promo_codes as c
  set
    state = 'revoked',
    revoked_at = v_now,
    updated_at = v_now
  where c.id = v_code.id
  returning c.* into v_code;

  insert into public.events (
    user_id,
    name,
    source,
    metadata,
    created_at,
    retain_until
  )
  values (
    p_operator_id,
    'code_validated',
    'admin',
    pg_catalog.jsonb_build_object('outcome', 'revoked'),
    v_now,
    v_now + interval '90 days'
  );

  insert into public.admin_inventory_mutations (
    request_id,
    operation,
    request_fingerprint,
    operator_id,
    promo_code_id,
    created_at
  )
  values (
    p_request_id,
    'revoke',
    v_fingerprint,
    p_operator_id,
    v_code.id,
    v_now
  );

  return query
  select v_code.id, v_code.row_reference, v_code.revoked_at;
end;
$$;

create or replace function public.reserve_campaign_spend(
  p_idempotency_key text,
  p_provider_cost_micro_usd bigint
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
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_prior public.ledger_entries%rowtype;
  v_reservation public.ledger_entries%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 128
    or p_provider_cost_micro_usd is null
    or p_provider_cost_micro_usd < 0 then
    raise exception 'INVALID_SPEND_REQUEST' using errcode = 'P0001';
  end if;

  select l.*
  into v_prior
  from public.ledger_entries as l
  where l.user_id = v_user_id
    and l.entry_kind = 'reserve'
    and l.idempotency_key = p_idempotency_key;

  if found then
    if v_prior.provider_cost_micro_usd <> p_provider_cost_micro_usd then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_prior.state <> 'reserved' then
      raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
    end if;
    return query
    select
      v_prior.wallet_id,
      v_prior.balance_after,
      v_prior.reserved_after,
      v_prior.provider_committed_after_micro_usd,
      v_prior.provider_reserved_after_micro_usd,
      w.expires_at,
      v_prior.id,
      'reserved'::text
    from public.wallets as w
    where w.id = v_prior.wallet_id;
    return;
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.user_id = v_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;

  select l.*
  into v_prior
  from public.ledger_entries as l
  where l.user_id = v_user_id
    and l.entry_kind = 'reserve'
    and l.idempotency_key = p_idempotency_key;

  if found then
    if v_prior.provider_cost_micro_usd <> p_provider_cost_micro_usd then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_prior.state <> 'reserved' then
      raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
    end if;
    return query
    select
      v_prior.wallet_id,
      v_prior.balance_after,
      v_prior.reserved_after,
      v_prior.provider_committed_after_micro_usd,
      v_prior.provider_reserved_after_micro_usd,
      v_wallet.expires_at,
      v_prior.id,
      'reserved'::text;
    return;
  end if;

  if v_wallet.expires_at <= pg_catalog.now() then
    raise exception 'WALLET_EXPIRED' using errcode = 'P0001';
  end if;
  if v_wallet.remaining_balance < 120 then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;
  if v_wallet.provider_committed_micro_usd
      + v_wallet.provider_reserved_micro_usd
      + p_provider_cost_micro_usd > 250000 then
    raise exception 'PROVIDER_COST_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.wallets
  set
    remaining_balance = remaining_balance - 120,
    reserved_balance = reserved_balance + 120,
    provider_reserved_micro_usd =
      provider_reserved_micro_usd + p_provider_cost_micro_usd
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.ledger_entries (
    wallet_id,
    user_id,
    entry_kind,
    state,
    credits_delta,
    provider_cost_micro_usd,
    idempotency_key,
    balance_after,
    reserved_after,
    provider_committed_after_micro_usd,
    provider_reserved_after_micro_usd
  )
  values (
    v_wallet.id,
    v_user_id,
    'reserve',
    'reserved',
    -120,
    p_provider_cost_micro_usd,
    p_idempotency_key,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  )
  returning * into v_reservation;

  return query
  select
    v_wallet.id,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd,
    v_wallet.expires_at,
    v_reservation.id,
    'reserved'::text;
end;
$$;

create or replace function public.commit_campaign_spend(
  p_reservation_id uuid,
  p_provider_cost_micro_usd bigint,
  p_idempotency_key text
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
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_reservation public.ledger_entries%rowtype;
  v_prior public.ledger_entries%rowtype;
  v_terminal public.ledger_entries%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_reservation_id is null
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 128
    or p_provider_cost_micro_usd is null
    or p_provider_cost_micro_usd < 0 then
    raise exception 'INVALID_SPEND_REQUEST' using errcode = 'P0001';
  end if;

  select l.*
  into v_prior
  from public.ledger_entries as l
  where l.user_id = v_user_id
    and l.entry_kind = 'commit'
    and l.idempotency_key = p_idempotency_key;

  if found then
    if v_prior.reservation_id <> p_reservation_id
      or v_prior.provider_cost_micro_usd
        <> p_provider_cost_micro_usd then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query
    select
      v_prior.wallet_id,
      v_prior.balance_after,
      v_prior.reserved_after,
      v_prior.provider_committed_after_micro_usd,
      v_prior.provider_reserved_after_micro_usd,
      w.expires_at,
      v_prior.id,
      v_prior.state
    from public.wallets as w
    where w.id = v_prior.wallet_id;
    return;
  end if;

  select l.*
  into v_reservation
  from public.ledger_entries as l
  where l.id = p_reservation_id
    and l.user_id = v_user_id
    and l.entry_kind = 'reserve'
  for update;

  if not found then
    raise exception 'SPEND_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.task_executions as e
    where e.user_id = v_user_id
      and e.idempotency_key = v_reservation.idempotency_key
  ) then
    raise exception 'TASK_EXECUTION_REQUIRES_ATOMIC_TERMINALIZATION'
      using errcode = 'P0001';
  end if;

  select l.*
  into v_terminal
  from public.ledger_entries as l
  where l.reservation_id = v_reservation.id;

  if found then
    if v_terminal.entry_kind <> 'commit'
      or v_terminal.idempotency_key <> p_idempotency_key
      or v_terminal.provider_cost_micro_usd
        <> p_provider_cost_micro_usd then
      raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
    end if;
    return query
    select
      v_terminal.wallet_id,
      v_terminal.balance_after,
      v_terminal.reserved_after,
      v_terminal.provider_committed_after_micro_usd,
      v_terminal.provider_reserved_after_micro_usd,
      w.expires_at,
      v_terminal.id,
      v_terminal.state
    from public.wallets as w
    where w.id = v_terminal.wallet_id;
    return;
  end if;

  if v_reservation.state <> 'reserved' then
    raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
  end if;
  if p_provider_cost_micro_usd
      > v_reservation.provider_cost_micro_usd then
    raise exception 'PROVIDER_COST_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.id = v_reservation.wallet_id
    and w.user_id = v_user_id
  for update;

  if not found
    or v_wallet.reserved_balance < 120
    or v_wallet.provider_reserved_micro_usd
      < v_reservation.provider_cost_micro_usd then
    raise exception 'CREDIT_BALANCE_INVALID' using errcode = 'P0001';
  end if;

  select l.*
  into v_prior
  from public.ledger_entries as l
  where l.user_id = v_user_id
    and l.entry_kind = 'commit'
    and l.idempotency_key = p_idempotency_key;

  if found then
    if v_prior.reservation_id <> p_reservation_id
      or v_prior.provider_cost_micro_usd
        <> p_provider_cost_micro_usd then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query
    select
      v_prior.wallet_id,
      v_prior.balance_after,
      v_prior.reserved_after,
      v_prior.provider_committed_after_micro_usd,
      v_prior.provider_reserved_after_micro_usd,
      v_wallet.expires_at,
      v_prior.id,
      v_prior.state;
    return;
  end if;

  update public.wallets
  set
    reserved_balance = reserved_balance - 120,
    provider_reserved_micro_usd =
      provider_reserved_micro_usd
        - v_reservation.provider_cost_micro_usd,
    provider_committed_micro_usd =
      provider_committed_micro_usd + p_provider_cost_micro_usd
  where id = v_wallet.id
  returning * into v_wallet;

  update public.ledger_entries
  set state = 'committed'
  where id = v_reservation.id;

  insert into public.ledger_entries (
    wallet_id,
    user_id,
    entry_kind,
    state,
    credits_delta,
    provider_cost_micro_usd,
    idempotency_key,
    reservation_id,
    balance_after,
    reserved_after,
    provider_committed_after_micro_usd,
    provider_reserved_after_micro_usd
  )
  values (
    v_wallet.id,
    v_user_id,
    'commit',
    'committed',
    0,
    p_provider_cost_micro_usd,
    p_idempotency_key,
    v_reservation.id,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  )
  returning * into v_terminal;

  return query
  select
    v_wallet.id,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd,
    v_wallet.expires_at,
    v_terminal.id,
    v_terminal.state;
end;
$$;

create or replace function public.refund_campaign_spend(
  p_reservation_id uuid,
  p_idempotency_key text
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
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_reservation public.ledger_entries%rowtype;
  v_prior public.ledger_entries%rowtype;
  v_terminal public.ledger_entries%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_reservation_id is null
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 128 then
    raise exception 'INVALID_SPEND_REQUEST' using errcode = 'P0001';
  end if;

  select l.*
  into v_prior
  from public.ledger_entries as l
  where l.user_id = v_user_id
    and l.entry_kind = 'refund'
    and l.idempotency_key = p_idempotency_key;

  if found then
    if v_prior.reservation_id <> p_reservation_id then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query
    select
      v_prior.wallet_id,
      v_prior.balance_after,
      v_prior.reserved_after,
      v_prior.provider_committed_after_micro_usd,
      v_prior.provider_reserved_after_micro_usd,
      w.expires_at,
      v_prior.id,
      v_prior.state
    from public.wallets as w
    where w.id = v_prior.wallet_id;
    return;
  end if;

  select l.*
  into v_reservation
  from public.ledger_entries as l
  where l.id = p_reservation_id
    and l.user_id = v_user_id
    and l.entry_kind = 'reserve'
  for update;

  if not found then
    raise exception 'SPEND_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.task_executions as e
    where e.user_id = v_user_id
      and e.idempotency_key = v_reservation.idempotency_key
  ) then
    raise exception 'TASK_EXECUTION_REQUIRES_ATOMIC_TERMINALIZATION'
      using errcode = 'P0001';
  end if;

  select l.*
  into v_terminal
  from public.ledger_entries as l
  where l.reservation_id = v_reservation.id;

  if found then
    if v_terminal.entry_kind <> 'refund'
      or v_terminal.idempotency_key <> p_idempotency_key then
      raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
    end if;
    return query
    select
      v_terminal.wallet_id,
      v_terminal.balance_after,
      v_terminal.reserved_after,
      v_terminal.provider_committed_after_micro_usd,
      v_terminal.provider_reserved_after_micro_usd,
      w.expires_at,
      v_terminal.id,
      v_terminal.state
    from public.wallets as w
    where w.id = v_terminal.wallet_id;
    return;
  end if;

  if v_reservation.state <> 'reserved' then
    raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.id = v_reservation.wallet_id
    and w.user_id = v_user_id
  for update;

  if not found
    or v_wallet.reserved_balance < 120
    or v_wallet.provider_reserved_micro_usd
      < v_reservation.provider_cost_micro_usd
    or v_wallet.remaining_balance + 120 > v_wallet.initial_balance then
    raise exception 'CREDIT_BALANCE_INVALID' using errcode = 'P0001';
  end if;

  select l.*
  into v_prior
  from public.ledger_entries as l
  where l.user_id = v_user_id
    and l.entry_kind = 'refund'
    and l.idempotency_key = p_idempotency_key;

  if found then
    if v_prior.reservation_id <> p_reservation_id then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query
    select
      v_prior.wallet_id,
      v_prior.balance_after,
      v_prior.reserved_after,
      v_prior.provider_committed_after_micro_usd,
      v_prior.provider_reserved_after_micro_usd,
      v_wallet.expires_at,
      v_prior.id,
      v_prior.state;
    return;
  end if;

  update public.wallets
  set
    remaining_balance = remaining_balance + 120,
    reserved_balance = reserved_balance - 120,
    provider_reserved_micro_usd =
      provider_reserved_micro_usd
        - v_reservation.provider_cost_micro_usd
  where id = v_wallet.id
  returning * into v_wallet;

  update public.ledger_entries
  set state = 'refunded'
  where id = v_reservation.id;

  insert into public.ledger_entries (
    wallet_id,
    user_id,
    entry_kind,
    state,
    credits_delta,
    provider_cost_micro_usd,
    idempotency_key,
    reservation_id,
    balance_after,
    reserved_after,
    provider_committed_after_micro_usd,
    provider_reserved_after_micro_usd
  )
  values (
    v_wallet.id,
    v_user_id,
    'refund',
    'refunded',
    120,
    0,
    p_idempotency_key,
    v_reservation.id,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  )
  returning * into v_terminal;

  return query
  select
    v_wallet.id,
    v_wallet.remaining_balance,
    v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd,
    v_wallet.expires_at,
    v_terminal.id,
    v_terminal.state;
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

  select e.*
  into v_execution
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

      return query
      select
        v_execution.id,
        v_execution.state,
        null::uuid,
        null::timestamptz,
        v_execution.result_payload,
        v_execution.result_expires_at,
        v_execution.remaining_credits,
        v_execution.session_id,
        v_execution.error_code;
      return;
    end if;

    if v_execution.owner_token = p_owner_token
      or v_execution.lease_expires_at <= p_now then
      update public.task_executions as e
      set
        owner_token = p_owner_token,
        lease_expires_at = p_now + interval '90 seconds'
      where e.id = v_execution.id
      returning e.* into v_execution;

      return query
      select
        v_execution.id,
        'owner'::text,
        v_execution.owner_token,
        v_execution.lease_expires_at,
        null::jsonb,
        null::timestamptz,
        null::integer,
        null::uuid,
        null::text;
      return;
    end if;

    return query
    select
      v_execution.id,
      'running'::text,
      null::uuid,
      v_execution.lease_expires_at,
      null::jsonb,
      null::timestamptz,
      null::integer,
      null::uuid,
      null::text;
    return;
  end if;

  select pg_catalog.count(*)::integer
  into v_recent_count
  from public.task_executions as e
  where e.user_id = p_user_id
    and e.created_at >= p_now - interval '1 minute';

  if v_recent_count >= 8 then
    return query
    select
      null::uuid,
      'throttled'::text,
      null::uuid,
      null::timestamptz,
      null::jsonb,
      null::timestamptz,
      null::integer,
      null::uuid,
      null::text;
    return;
  end if;

  insert into public.task_executions (
    user_id,
    idempotency_key,
    request_fingerprint,
    task_type,
    model_id,
    provider_cost_ceiling_micro_usd,
    state,
    owner_token,
    lease_expires_at,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_idempotency_key,
    p_request_fingerprint,
    p_task_type,
    p_model_id,
    p_provider_cost_ceiling_micro_usd,
    'running',
    p_owner_token,
    p_now + interval '90 seconds',
    p_now,
    p_now
  )
  returning * into v_execution;

  return query
  select
    v_execution.id,
    'owner'::text,
    v_execution.owner_token,
    v_execution.lease_expires_at,
    null::jsonb,
    null::timestamptz,
    null::integer,
    null::uuid,
    null::text;
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
    or p_input_units is null
    or p_input_units < 0
    or p_output_units is null
    or p_output_units < 0
    or p_provider_cost_micro_usd is null
    or p_provider_cost_micro_usd not between 0 and 250000
    or (
      p_saved_output is not null
      and pg_catalog.octet_length(p_saved_output) not between 2 and 50000
    )
    or (
      p_state = 'completed'
      and (
        p_error_code is not null
        or coalesce(
          pg_catalog.jsonb_typeof(p_result_payload -> 'output'),
          ''
        ) <> 'object'
        or (
          p_saved_output is not null
          and p_saved_output::jsonb
            is distinct from p_result_payload -> 'output'
        )
      )
    )
    or (
      p_state = 'failed'
      and (
        p_error_code is null
        or p_error_code not in (
          'PROVIDER_UNAVAILABLE',
          'TASK_UNAVAILABLE'
        )
        or p_input_units <> 0
        or p_output_units <> 0
        or p_provider_cost_micro_usd <> 0
        or p_saved_output is not null
        or p_result_payload is distinct from
          pg_catalog.jsonb_build_object('error', p_error_code)
      )
    )
    or p_now is null
    or p_now < v_clock - interval '30 seconds'
    or p_now > v_clock + interval '5 seconds' then
    raise exception 'INVALID_TASK_EXECUTION_RESULT' using errcode = 'P0001';
  end if;

  select e.*
  into v_execution
  from public.task_executions as e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception 'TASK_EXECUTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_execution.owner_token <> p_owner_token then
    raise exception 'TASK_EXECUTION_OWNER_MISMATCH' using errcode = 'P0001';
  end if;
  if v_execution.state <> 'running'
    and v_execution.state <> p_state then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  -- Lock order is execution -> reservation -> terminal -> wallet -> session.
  -- The existing spend RPCs use reservation -> terminal -> wallet, so no
  -- transaction acquires these shared rows in the opposite order.
  select l.*
  into v_reservation
  from public.ledger_entries as l
  where l.id = p_reservation_id
    and l.user_id = v_execution.user_id
    and l.entry_kind = 'reserve'
  for update;

  if not found then
    raise exception 'SPEND_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_reservation.idempotency_key <> v_execution.idempotency_key
    or v_reservation.provider_cost_micro_usd
      <> v_execution.provider_cost_ceiling_micro_usd then
    raise exception 'TASK_EXECUTION_RESERVATION_MISMATCH'
      using errcode = 'P0001';
  end if;

  v_terminal_kind := case
    when p_state = 'completed' then 'commit'
    else 'refund'
  end;
  v_terminal_key :=
    p_execution_id::text || ':' || v_terminal_kind;

  select l.*
  into v_terminal
  from public.ledger_entries as l
  where l.reservation_id = v_reservation.id
  for update;

  if found then
    if v_terminal.user_id <> v_execution.user_id
      or v_terminal.entry_kind <> v_terminal_kind
      or v_terminal.idempotency_key <> v_terminal_key
      or v_terminal.provider_cost_micro_usd
        <> p_provider_cost_micro_usd
      or (
        p_state = 'completed'
        and (
          v_reservation.state <> 'committed'
          or v_terminal.state <> 'committed'
        )
      )
      or (
        p_state = 'failed'
        and (
          v_reservation.state <> 'refunded'
          or v_terminal.state <> 'refunded'
        )
      ) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
  else
    if v_execution.state <> 'running'
      or v_reservation.state <> 'reserved' then
      raise exception 'SPEND_STATE_INVALID' using errcode = 'P0001';
    end if;
    if p_state = 'completed'
      and p_provider_cost_micro_usd
        > v_reservation.provider_cost_micro_usd then
      raise exception 'PROVIDER_COST_LIMIT_EXCEEDED'
        using errcode = 'P0001';
    end if;

    select w.*
    into v_wallet
    from public.wallets as w
    where w.id = v_reservation.wallet_id
      and w.user_id = v_execution.user_id
    for update;

    if not found
      or v_wallet.reserved_balance < 120
      or v_wallet.provider_reserved_micro_usd
        < v_reservation.provider_cost_micro_usd
      or (
        p_state = 'failed'
        and v_wallet.remaining_balance + 120
          > v_wallet.initial_balance
      ) then
      raise exception 'CREDIT_BALANCE_INVALID' using errcode = 'P0001';
    end if;

    if p_state = 'completed' then
      update public.wallets
      set
        reserved_balance = reserved_balance - 120,
        provider_reserved_micro_usd =
          provider_reserved_micro_usd
            - v_reservation.provider_cost_micro_usd,
        provider_committed_micro_usd =
          provider_committed_micro_usd + p_provider_cost_micro_usd
      where id = v_wallet.id
      returning * into v_wallet;

      update public.ledger_entries
      set state = 'committed'
      where id = v_reservation.id
      returning * into v_reservation;

      insert into public.ledger_entries (
        wallet_id,
        user_id,
        entry_kind,
        state,
        credits_delta,
        provider_cost_micro_usd,
        idempotency_key,
        reservation_id,
        balance_after,
        reserved_after,
        provider_committed_after_micro_usd,
        provider_reserved_after_micro_usd
      )
      values (
        v_wallet.id,
        v_execution.user_id,
        'commit',
        'committed',
        0,
        p_provider_cost_micro_usd,
        v_terminal_key,
        v_reservation.id,
        v_wallet.remaining_balance,
        v_wallet.reserved_balance,
        v_wallet.provider_committed_micro_usd,
        v_wallet.provider_reserved_micro_usd
      )
      returning * into v_terminal;
    else
      update public.wallets
      set
        remaining_balance = remaining_balance + 120,
        reserved_balance = reserved_balance - 120,
        provider_reserved_micro_usd =
          provider_reserved_micro_usd
            - v_reservation.provider_cost_micro_usd
      where id = v_wallet.id
      returning * into v_wallet;

      update public.ledger_entries
      set state = 'refunded'
      where id = v_reservation.id
      returning * into v_reservation;

      insert into public.ledger_entries (
        wallet_id,
        user_id,
        entry_kind,
        state,
        credits_delta,
        provider_cost_micro_usd,
        idempotency_key,
        reservation_id,
        balance_after,
        reserved_after,
        provider_committed_after_micro_usd,
        provider_reserved_after_micro_usd
      )
      values (
        v_wallet.id,
        v_execution.user_id,
        'refund',
        'refunded',
        120,
        0,
        v_terminal_key,
        v_reservation.id,
        v_wallet.remaining_balance,
        v_wallet.reserved_balance,
        v_wallet.provider_committed_micro_usd,
        v_wallet.provider_reserved_micro_usd
      )
      returning * into v_terminal;
    end if;
  end if;

  select s.*
  into v_session
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
      or v_session.provider_cost_micro_usd
        <> p_provider_cost_micro_usd
      or v_session.status <> p_state
      or v_session.saved_output is distinct from p_saved_output
      or v_session.saved_output_retained
        <> (p_saved_output is not null) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
  else
    insert into public.task_sessions (
      user_id,
      reservation_id,
      task_type,
      title,
      model_id,
      input_units,
      output_units,
      provider_cost_micro_usd,
      status,
      saved_output,
      saved_output_retained
    )
    values (
      v_execution.user_id,
      v_reservation.id,
      v_execution.task_type,
      v_task_title,
      v_execution.model_id,
      p_input_units,
      p_output_units,
      p_provider_cost_micro_usd,
      p_state,
      p_saved_output,
      p_saved_output is not null
    )
    returning * into v_session;
  end if;

  if v_execution.state in ('completed', 'failed') then
    if v_execution.session_id <> v_session.id
      or v_execution.remaining_credits <> v_terminal.balance_after
      or v_execution.error_code is distinct from p_error_code
      or (
        v_execution.result_payload is not null
        and v_execution.result_payload is distinct from p_result_payload
      ) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select
      v_execution.id,
      v_execution.state,
      null::uuid,
      null::timestamptz,
      v_execution.result_payload,
      v_execution.result_expires_at,
      v_execution.remaining_credits,
      v_execution.session_id,
      v_execution.error_code;
    return;
  end if;

  update public.task_executions as e
  set
    state = p_state,
    lease_expires_at = null,
    result_payload = p_result_payload,
    result_expires_at = v_clock + interval '15 minutes',
    remaining_credits = v_terminal.balance_after,
    session_id = v_session.id,
    error_code = p_error_code
  where e.id = p_execution_id
  returning e.* into v_execution;

  return query
  select
    v_execution.id,
    v_execution.state,
    null::uuid,
    null::timestamptz,
    v_execution.result_payload,
    v_execution.result_expires_at,
    v_execution.remaining_credits,
    v_execution.session_id,
    v_execution.error_code;
end;
$$;

revoke all on function public.admit_campaign_public_validation(
  text,
  text,
  text,
  bigint,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.admit_campaign_redemption_attempt(
  uuid,
  text,
  text,
  text,
  bigint,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.finish_campaign_redemption_attempt(uuid, text)
  from public, anon, authenticated;
revoke all on function public.redeem_campaign_code(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.create_campaign_admin_batch(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text[],
  text[]
) from public, anon, authenticated;
revoke all on function public.activate_campaign_admin_batch(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function public.revoke_campaign_admin_code(
  uuid,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.is_safe_campaign_event_payload(
  text,
  text,
  jsonb
) from public;
revoke all on function public.reserve_campaign_spend(text, bigint)
  from public;
revoke all on function public.commit_campaign_spend(uuid, bigint, text)
  from public;
revoke all on function public.refund_campaign_spend(uuid, text)
  from public;
revoke all on function public.begin_campaign_task_execution(
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.terminalize_campaign_task_execution(
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  text,
  integer,
  integer,
  bigint,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.admit_campaign_public_validation(
  text,
  text,
  text,
  bigint,
  timestamptz
) to service_role;
grant execute on function public.admit_campaign_redemption_attempt(
  uuid,
  text,
  text,
  text,
  bigint,
  timestamptz
) to service_role;
grant execute on function public.finish_campaign_redemption_attempt(uuid, text)
  to service_role;
grant execute on function public.redeem_campaign_code(uuid, text, text)
  to service_role;
grant execute on function public.create_campaign_admin_batch(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text[],
  text[]
) to service_role;
grant execute on function public.activate_campaign_admin_batch(
  uuid,
  uuid,
  uuid
) to service_role;
grant execute on function public.revoke_campaign_admin_code(
  uuid,
  uuid,
  text
) to service_role;
grant execute on function public.is_safe_campaign_event_payload(
  text,
  text,
  jsonb
) to authenticated, service_role;
grant execute on function public.reserve_campaign_spend(text, bigint)
  to authenticated, service_role;
grant execute on function public.commit_campaign_spend(uuid, bigint, text)
  to authenticated, service_role;
grant execute on function public.refund_campaign_spend(uuid, text)
  to authenticated, service_role;
grant execute on function public.begin_campaign_task_execution(
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.terminalize_campaign_task_execution(
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  text,
  integer,
  integer,
  bigint,
  text,
  text,
  timestamptz
) to service_role;
