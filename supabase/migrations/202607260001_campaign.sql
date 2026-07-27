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
  source text check (source is null or char_length(source) between 1 and 100),
  code_count integer not null check (code_count between 1 and 10000),
  status text not null default 'active'
    check (status in ('active', 'closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (expires_at is null or expires_at > created_at)
);

create table public.promo_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  batch_id uuid not null references public.promo_batches(id) on delete restrict,
  code_hash text not null
    check (
      char_length(code_hash) = 64
      and code_hash ~ '^[0-9a-f]{64}$'
    ),
  state text not null default 'eligible'
    check (state in ('eligible', 'redeemed', 'expired', 'revoked')),
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
alter table public.wallets enable row level security;
alter table public.wallets force row level security;
alter table public.ledger_entries enable row level security;
alter table public.ledger_entries force row level security;
alter table public.task_sessions enable row level security;
alter table public.task_sessions force row level security;
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

create policy promo_batches_admin_all
on public.promo_batches
for all
to authenticated
using ((select public.is_campaign_admin()))
with check ((select public.is_campaign_admin()));

create policy promo_codes_admin_all
on public.promo_codes
for all
to authenticated
using ((select public.is_campaign_admin()))
with check ((select public.is_campaign_admin()));

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
revoke all on table public.wallets from anon, authenticated;
revoke all on table public.ledger_entries from anon, authenticated;
revoke all on table public.task_sessions from anon, authenticated;
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
grant insert, update on table public.promo_batches to authenticated;
grant insert, update on table public.promo_codes to authenticated;
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
