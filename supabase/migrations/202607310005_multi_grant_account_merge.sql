-- Multiple physical cards top up one account wallet. Existing Google/Apple
-- identities absorb a verified guest wallet through a short-lived, one-use
-- service-only intent. Bearer values never enter this schema; only SHA-256
-- digests are stored.

begin;

alter table public.wallets
  drop constraint wallets_initial_balance_check,
  add constraint wallets_initial_balance_check
    check (
      initial_balance between 3000 and 3000000
      and mod(initial_balance, 3000) = 0
    ),
  drop constraint wallets_check2,
  add constraint wallets_check2
    check (expires_at > created_at),
  drop constraint wallets_provider_cost_cap_3usd_check,
  add constraint wallets_provider_cost_cap_3usd_check
    check (
      provider_committed_micro_usd
        + provider_reserved_micro_usd <= 3000000
    );

alter table public.ledger_entries
  drop constraint ledger_entries_entry_kind_check,
  add constraint ledger_entries_entry_kind_check
    check (
      entry_kind in ('grant', 'reserve', 'commit', 'refund', 'expire')
    ),
  drop constraint ledger_entries_shape_v2,
  add constraint ledger_entries_shape_v3 check (
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
    or
    (entry_kind = 'expire'
      and state = 'committed'
      and credits_delta between -3000000 and -1
      and provider_cost_micro_usd = 0
      and promo_code_id is null
      and reservation_id is null)
  ),
  drop constraint ledger_entries_provider_cost_cap_3usd_check,
  add constraint ledger_entries_provider_cost_cap_3usd_check
    check (
      provider_committed_after_micro_usd
        + provider_reserved_after_micro_usd <= 3000000
    );

alter table public.task_executions
  drop constraint task_executions_remaining_credits_check,
  add constraint task_executions_remaining_credits_check
    check (remaining_credits between 0 and 3000000);

alter table public.agent_requests
  drop constraint agent_requests_remaining_credits_check,
  add constraint agent_requests_remaining_credits_check
    check (
      remaining_credits is null
      or remaining_credits between 0 and 3000000
    );

alter table public.agent_usage_entries
  drop constraint agent_usage_entries_balance_after_check,
  add constraint agent_usage_entries_balance_after_check
    check (balance_after between 0 and 3000000),
  drop constraint agent_usage_entries_reserved_after_check,
  add constraint agent_usage_entries_reserved_after_check
    check (reserved_after between 0 and 3000000);

create table public.account_merge_intents (
  id uuid primary key default extensions.gen_random_uuid(),
  source_user_id uuid not null,
  source_wallet_id uuid not null,
  source_session_id text not null
    check (
      char_length(source_session_id) = 36
      and source_session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  provider text not null check (provider in ('apple', 'google')),
  token_digest text not null unique
    check (
      char_length(token_digest) = 64
      and token_digest ~ '^[0-9a-f]{64}$'
    ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  target_user_id uuid,
  consumed_at timestamptz,
  credits_transferred integer,
  merged_wallet_id uuid,
  final_remaining_balance integer,
  final_expires_at timestamptz,
  check (expires_at = created_at + interval '10 minutes'),
  check (
    (
      consumed_at is null
      and target_user_id is null
      and credits_transferred is null
      and merged_wallet_id is null
      and final_remaining_balance is null
      and final_expires_at is null
    )
    or (
      consumed_at is not null
      and target_user_id is not null
      and credits_transferred between 0 and 3000000
      and merged_wallet_id is not null
      and final_remaining_balance between 0 and 3000000
      and final_expires_at is not null
      and consumed_at >= created_at
    )
  )
);

create unique index account_merge_intents_source_pending_idx
  on public.account_merge_intents (source_user_id)
  where consumed_at is null;
create index account_merge_intents_expiry_idx
  on public.account_merge_intents (expires_at, id)
  where consumed_at is null;

create table public.merged_account_tombstones (
  source_user_id uuid primary key,
  target_user_id uuid not null,
  intent_id uuid not null unique,
  merged_at timestamptz not null,
  check (source_user_id <> target_user_id)
);

create table public.auth_cleanup_outbox (
  source_user_id uuid primary key,
  target_user_id uuid not null,
  intent_id uuid not null unique,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'completed')),
  created_at timestamptz not null,
  lease_token uuid,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  check (
    (
      state = 'pending'
      and lease_token is null
      and lease_expires_at is null
      and completed_at is null
    )
    or (
      state = 'processing'
      and lease_token is not null
      and lease_expires_at is not null
      and lease_expires_at > created_at
      and completed_at is null
    )
    or (
      state = 'completed'
      and lease_token is null
      and lease_expires_at is null
      and completed_at is not null
      and completed_at >= created_at
    )
  )
);

create index auth_cleanup_outbox_pending_claim_idx
  on public.auth_cleanup_outbox (created_at, source_user_id)
  where state = 'pending';
create index auth_cleanup_outbox_processing_lease_idx
  on public.auth_cleanup_outbox (
    lease_expires_at,
    created_at,
    source_user_id
  )
  where state = 'processing';

alter table public.account_merge_intents enable row level security;
alter table public.account_merge_intents force row level security;
alter table public.merged_account_tombstones enable row level security;
alter table public.merged_account_tombstones force row level security;
alter table public.auth_cleanup_outbox enable row level security;
alter table public.auth_cleanup_outbox force row level security;

revoke all on table public.account_merge_intents
from public, anon, authenticated;
revoke all on table public.merged_account_tombstones
from public, anon, authenticated;
revoke all on table public.auth_cleanup_outbox
from public, anon, authenticated;
grant all on table public.account_merge_intents to service_role;
grant all on table public.merged_account_tombstones to service_role;
grant all on table public.auth_cleanup_outbox to service_role;

create function public.claim_auth_cleanup_outbox(
  p_worker_token uuid,
  p_limit integer default 25
)
returns table (source_user_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
begin
  if p_worker_token is null
    or p_limit is null
    or p_limit not between 1 and 25 then
    raise exception 'AUTH_CLEANUP_CLAIM_INVALID' using errcode = 'P0001';
  end if;

  return query
  with candidates as (
    select o.source_user_id
    from public.auth_cleanup_outbox as o
    where o.state = 'pending'
      or (
        o.state = 'processing'
        and o.lease_expires_at <= v_clock
      )
    order by o.created_at, o.source_user_id
    for update skip locked
    limit p_limit
  )
  update public.auth_cleanup_outbox as o
  set
    state = 'processing',
    lease_token = p_worker_token,
    lease_expires_at = v_clock + interval '10 minutes',
    completed_at = null
  from candidates as c
  where o.source_user_id = c.source_user_id
  returning o.source_user_id;
end;
$$;

alter function public.claim_auth_cleanup_outbox(uuid, integer)
owner to postgres;
revoke all on function public.claim_auth_cleanup_outbox(uuid, integer)
from public, anon, authenticated;
grant execute on function public.claim_auth_cleanup_outbox(uuid, integer)
to service_role;

create function public.complete_auth_cleanup_outbox(
  p_source_user_id uuid,
  p_worker_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_completed boolean;
begin
  if p_source_user_id is null or p_worker_token is null then
    raise exception 'AUTH_CLEANUP_COMPLETION_INVALID'
      using errcode = 'P0001';
  end if;

  update public.auth_cleanup_outbox as o
  set
    state = 'completed',
    lease_token = null,
    lease_expires_at = null,
    completed_at = pg_catalog.clock_timestamp()
  where o.source_user_id = p_source_user_id
    and o.state = 'processing'
    and o.lease_token = p_worker_token
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

alter function public.complete_auth_cleanup_outbox(uuid, uuid)
owner to postgres;
revoke all on function public.complete_auth_cleanup_outbox(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.complete_auth_cleanup_outbox(uuid, uuid)
to service_role;

create or replace function private.reject_merged_account_wallet()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.merged_account_tombstones as t
    where t.source_user_id = new.user_id
  ) then
    raise exception 'MERGED_ACCOUNT_RETIRED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

alter function private.reject_merged_account_wallet() owner to postgres;
revoke all on function private.reject_merged_account_wallet()
from public, anon, authenticated, service_role;

create trigger wallets_reject_merged_account
before insert or update of user_id on public.wallets
for each row execute function private.reject_merged_account_wallet();

create or replace function public.create_account_merge_intent(
  p_source_user_id uuid,
  p_source_session_id text,
  p_provider text,
  p_token_digest text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_source_wallet_id uuid;
begin
  if p_source_user_id is null
    or p_source_session_id is null
    or char_length(p_source_session_id) <> 36
    or p_source_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_provider is null
    or p_provider <> all (array['apple', 'google']::text[])
    or p_token_digest is null
    or p_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'ACCOUNT_MERGE_INTENT_INVALID' using errcode = 'P0001';
  end if;

  -- An asymmetric access JWT can remain signature-valid after sign-out.
  -- Require the bound Auth session to still exist, and hold a shared row lock
  -- so concurrent revocation serializes against intent creation.
  perform s.id
  from auth.sessions as s
  where s.id = p_source_session_id::uuid
    and s.user_id = p_source_user_id
  for key share;
  if not found then
    raise exception 'ACCOUNT_MERGE_SESSION_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.merged_account_tombstones as t
    where t.source_user_id = p_source_user_id
  ) then
    raise exception 'MERGED_ACCOUNT_RETIRED' using errcode = 'P0001';
  end if;

  perform p.id
  from public.profiles as p
  where p.id = p_source_user_id
  for update;
  if not found then
    raise exception 'ACCOUNT_MERGE_SOURCE_INVALID' using errcode = 'P0001';
  end if;

  select w.id
  into v_source_wallet_id
  from public.wallets as w
  where w.user_id = p_source_user_id
  for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;

  delete from public.account_merge_intents as i
  where i.source_user_id = p_source_user_id
    and i.consumed_at is null;

  insert into public.account_merge_intents (
    source_user_id,
    source_wallet_id,
    source_session_id,
    provider,
    token_digest,
    created_at,
    expires_at
  )
  values (
    p_source_user_id,
    v_source_wallet_id,
    p_source_session_id,
    p_provider,
    p_token_digest,
    v_clock,
    v_clock + interval '10 minutes'
  );
end;
$$;

alter function public.create_account_merge_intent(uuid, text, text, text)
owner to postgres;
revoke all on function public.create_account_merge_intent(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_account_merge_intent(
  uuid, text, text, text
) to service_role;

create or replace function public.consume_account_merge_intent(
  p_token_digest text,
  p_source_session_id text,
  p_target_user_id uuid,
  p_provider text
)
returns table (
  credits_transferred integer,
  remaining_balance integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_intent public.account_merge_intents%rowtype;
  v_source_wallet public.wallets%rowtype;
  v_target_wallet public.wallets%rowtype;
  v_target_has_wallet boolean := false;
  v_merged_wallet_id uuid;
  v_credits_transferred integer;
  v_expired_credits integer := 0;
  v_final_remaining integer;
  v_final_expires timestamptz;
  v_source_active_remaining integer;
  v_target_active_remaining integer := 0;
begin
  if p_token_digest is null
    or p_token_digest !~ '^[0-9a-f]{64}$'
    or p_source_session_id is null
    or char_length(p_source_session_id) <> 36
    or p_source_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_target_user_id is null
    or p_provider is null
    or p_provider <> all (array['apple', 'google']::text[]) then
    raise exception 'ACCOUNT_MERGE_INVALID' using errcode = 'P0001';
  end if;

  select i.*
  into v_intent
  from public.account_merge_intents as i
  where i.token_digest = p_token_digest
    and i.provider = p_provider;
  if not found
    or v_intent.source_session_id is distinct from p_source_session_id then
    raise exception 'ACCOUNT_MERGE_INVALID' using errcode = 'P0001';
  end if;

  if v_intent.consumed_at is not null then
    if v_intent.target_user_id is distinct from p_target_user_id then
      raise exception 'ACCOUNT_MERGE_INVALID' using errcode = 'P0001';
    end if;
    return query
    select
      v_intent.credits_transferred,
      v_intent.final_remaining_balance,
      v_intent.final_expires_at;
    return;
  end if;

  perform s.id
  from auth.sessions as s
  where s.id = p_source_session_id::uuid
    and s.user_id = v_intent.source_user_id
  for key share;
  if not found then
    raise exception 'ACCOUNT_MERGE_SESSION_INVALID' using errcode = 'P0001';
  end if;

  insert into public.profiles (id)
  values (v_intent.source_user_id), (p_target_user_id)
  on conflict (id) do nothing;

  perform p.id
  from public.profiles as p
  where p.id in (v_intent.source_user_id, p_target_user_id)
  order by p.id
  for update;

  perform w.id
  from public.wallets as w
  where w.user_id in (v_intent.source_user_id, p_target_user_id)
  order by w.id
  for update;

  -- Re-read and lock the intent only after source/target ownership rows. Intent
  -- creation uses the same profile -> wallet -> intent order, avoiding a
  -- create/consume deadlock while still detecting replacement or replay.
  select i.*
  into v_intent
  from public.account_merge_intents as i
  where i.id = v_intent.id
    and i.token_digest = p_token_digest
    and i.provider = p_provider
  for update;
  if not found
    or v_intent.source_session_id is distinct from p_source_session_id then
    raise exception 'ACCOUNT_MERGE_INVALID' using errcode = 'P0001';
  end if;
  if v_intent.consumed_at is not null then
    if v_intent.target_user_id is distinct from p_target_user_id then
      raise exception 'ACCOUNT_MERGE_INVALID' using errcode = 'P0001';
    end if;
    return query
    select
      v_intent.credits_transferred,
      v_intent.final_remaining_balance,
      v_intent.final_expires_at;
    return;
  end if;
  if v_intent.expires_at <= v_clock then
    raise exception 'ACCOUNT_MERGE_EXPIRED' using errcode = 'P0001';
  end if;

  select w.*
  into v_source_wallet
  from public.wallets as w
  where w.user_id = v_intent.source_user_id;
  if not found
    or v_source_wallet.id is distinct from v_intent.source_wallet_id then
    raise exception 'ACCOUNT_MERGE_SOURCE_INVALID' using errcode = 'P0001';
  end if;

  if p_target_user_id = v_intent.source_user_id then
    update public.account_merge_intents as i
    set
      target_user_id = p_target_user_id,
      consumed_at = v_clock,
      credits_transferred = 0,
      merged_wallet_id = v_source_wallet.id,
      final_remaining_balance = v_source_wallet.remaining_balance,
      final_expires_at = v_source_wallet.expires_at
    where i.id = v_intent.id
    returning * into v_intent;

    return query
    select
      v_intent.credits_transferred,
      v_intent.final_remaining_balance,
      v_intent.final_expires_at;
    return;
  end if;

  if exists (
    select 1
    from public.merged_account_tombstones as t
    where t.source_user_id = v_intent.source_user_id
  ) then
    raise exception 'MERGED_ACCOUNT_RETIRED' using errcode = 'P0001';
  end if;

  select w.*
  into v_target_wallet
  from public.wallets as w
  where w.user_id = p_target_user_id;
  v_target_has_wallet := found;

  if v_source_wallet.reserved_balance <> 0
    or v_source_wallet.provider_reserved_micro_usd <> 0
    or (
      v_target_has_wallet
      and (
        v_target_wallet.reserved_balance <> 0
        or v_target_wallet.provider_reserved_micro_usd <> 0
      )
    )
    or exists (
      select 1
      from public.task_executions as e
      where e.user_id in (v_intent.source_user_id, p_target_user_id)
        and e.state = 'running'
    )
    or exists (
      select 1
      from public.agent_requests as r
      where r.user_id in (v_intent.source_user_id, p_target_user_id)
        and r.state = 'running'
    ) then
    raise exception 'ACCOUNT_MERGE_BUSY' using errcode = 'P0001';
  end if;

  if v_target_has_wallet
    and v_source_wallet.initial_balance + v_target_wallet.initial_balance
      > 3000000 then
    raise exception 'ACCOUNT_GRANT_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if v_target_has_wallet
    and v_source_wallet.provider_committed_micro_usd
      + v_target_wallet.provider_committed_micro_usd > 3000000 then
    raise exception 'PROVIDER_COST_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.ledger_entries as s
    join public.ledger_entries as t
      on t.user_id = p_target_user_id
      and t.entry_kind = s.entry_kind
      and t.idempotency_key = s.idempotency_key
    where s.user_id = v_intent.source_user_id
  ) or exists (
    select 1
    from public.task_executions as s
    join public.task_executions as t
      on t.user_id = p_target_user_id
      and t.idempotency_key = s.idempotency_key
    where s.user_id = v_intent.source_user_id
  ) or (
    v_target_has_wallet
    and exists (
      select 1
      from public.agent_requests as s
      join public.agent_requests as t
        on t.wallet_id = v_target_wallet.id
        and t.idempotency_key = s.idempotency_key
      where s.wallet_id = v_source_wallet.id
    )
  ) or exists (
    select 1
    from public.partner_connections as s
    join public.partner_connections as t
      on t.user_id = p_target_user_id
      and t.provider = s.provider
    where s.user_id = v_intent.source_user_id
  ) then
    raise exception 'ACCOUNT_MERGE_CONFLICT' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.promo_batches
    where created_by = v_intent.source_user_id
  ) or exists (
    select 1 from public.admin_inventory_mutations
    where operator_id = v_intent.source_user_id
  ) or exists (
    select 1 from public.provider_policies
    where created_by = v_intent.source_user_id
  ) or exists (
    select 1 from public.partner_rewards
    where assigned_by = v_intent.source_user_id
      or revoked_by = v_intent.source_user_id
  ) then
    raise exception 'ACCOUNT_MERGE_PRIVILEGED_SOURCE'
      using errcode = 'P0001';
  end if;

  v_source_active_remaining := case
    when v_source_wallet.expires_at > v_clock
      then v_source_wallet.remaining_balance
    else 0
  end;
  if v_target_has_wallet then
    v_target_active_remaining := case
      when v_target_wallet.expires_at > v_clock
        then v_target_wallet.remaining_balance
      else 0
    end;
  end if;
  v_expired_credits :=
    v_source_wallet.remaining_balance - v_source_active_remaining
    + case
      when v_target_has_wallet then
        v_target_wallet.remaining_balance - v_target_active_remaining
      else 0
    end;
  v_credits_transferred := v_source_active_remaining;
  -- Signing in must never mint time. Only a successful redemption of a
  -- distinct eligible card rolls the aggregate wallet expiry. Merging two
  -- owners therefore preserves the later already-earned expiry, while a
  -- source-only transfer keeps its existing deadline unchanged.
  v_final_expires := case
    when v_target_has_wallet then greatest(
      v_source_wallet.expires_at,
      v_target_wallet.expires_at
    )
    else v_source_wallet.expires_at
  end;

  if v_target_has_wallet then
    update public.wallets as w
    set
      initial_balance = v_target_wallet.initial_balance
        + v_source_wallet.initial_balance,
      remaining_balance = v_target_active_remaining
        + v_source_active_remaining,
      provider_committed_micro_usd =
        v_target_wallet.provider_committed_micro_usd
        + v_source_wallet.provider_committed_micro_usd,
      expires_at = v_final_expires,
      updated_at = v_clock
    where w.id = v_target_wallet.id
    returning w.id, w.remaining_balance
    into v_merged_wallet_id, v_final_remaining;
  else
    update public.wallets as w
    set
      user_id = p_target_user_id,
      remaining_balance = v_source_active_remaining,
      expires_at = v_final_expires,
      updated_at = v_clock
    where w.id = v_source_wallet.id
    returning w.id, w.remaining_balance
    into v_merged_wallet_id, v_final_remaining;
  end if;

  update public.promo_codes
  set redeemed_by = p_target_user_id
  where redeemed_by = v_intent.source_user_id;

  update public.ledger_entries
  set
    user_id = p_target_user_id,
    wallet_id = v_merged_wallet_id
  where user_id = v_intent.source_user_id;

  if v_expired_credits > 0 then
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
      provider_reserved_after_micro_usd,
      created_at,
      updated_at
    ) values (
      v_merged_wallet_id,
      p_target_user_id,
      'expire',
      'committed',
      -v_expired_credits,
      0,
      'account-merge-expiry:' || v_intent.id::text,
      v_final_remaining,
      0,
      v_source_wallet.provider_committed_micro_usd
        + case
          when v_target_has_wallet
            then v_target_wallet.provider_committed_micro_usd
          else 0
        end,
      0,
      v_clock,
      v_clock
    );
  end if;

  update public.task_sessions
  set user_id = p_target_user_id
  where user_id = v_intent.source_user_id;

  update public.task_executions
  set user_id = p_target_user_id
  where user_id = v_intent.source_user_id;

  update public.events
  set user_id = p_target_user_id
  where user_id = v_intent.source_user_id;

  update public.redemption_attempts
  set user_id = p_target_user_id
  where user_id = v_intent.source_user_id;

  update public.partner_connections
  set user_id = p_target_user_id
  where user_id = v_intent.source_user_id;

  update public.partner_rewards
  set revealed_by = p_target_user_id
  where revealed_by = v_intent.source_user_id;

  if v_target_has_wallet and exists (
    select 1
    from public.share_card_generations as g
    where g.wallet_id = v_target_wallet.id
  ) then
    delete from public.share_card_generations
    where wallet_id = v_source_wallet.id;
  else
    update public.share_card_generations
    set
      user_id = p_target_user_id,
      wallet_id = v_merged_wallet_id
    where wallet_id = v_source_wallet.id;
  end if;

  update public.agent_api_keys
  set
    user_id = p_target_user_id,
    wallet_id = v_merged_wallet_id,
    revoked_at = coalesce(revoked_at, v_clock),
    updated_at = v_clock
  where user_id = v_intent.source_user_id;

  update public.agent_requests
  set
    user_id = p_target_user_id,
    wallet_id = v_merged_wallet_id
  where user_id = v_intent.source_user_id;

  update public.agent_usage_entries
  set
    user_id = p_target_user_id,
    wallet_id = v_merged_wallet_id
  where user_id = v_intent.source_user_id;

  if v_target_has_wallet then
    delete from public.wallets
    where id = v_source_wallet.id;
  end if;

  delete from public.profiles
  where id = v_intent.source_user_id;

  insert into public.merged_account_tombstones (
    source_user_id,
    target_user_id,
    intent_id,
    merged_at
  )
  values (
    v_intent.source_user_id,
    p_target_user_id,
    v_intent.id,
    v_clock
  );

  insert into public.auth_cleanup_outbox (
    source_user_id,
    target_user_id,
    intent_id,
    state,
    created_at
  )
  values (
    v_intent.source_user_id,
    p_target_user_id,
    v_intent.id,
    'pending',
    v_clock
  );

  update public.account_merge_intents as i
  set
    target_user_id = p_target_user_id,
    consumed_at = v_clock,
    credits_transferred = v_credits_transferred,
    merged_wallet_id = v_merged_wallet_id,
    final_remaining_balance = v_final_remaining,
    final_expires_at = v_final_expires
  where i.id = v_intent.id
  returning * into v_intent;

  return query
  select
    v_intent.credits_transferred,
    v_intent.final_remaining_balance,
    v_intent.final_expires_at;
end;
$$;

alter function public.consume_account_merge_intent(text, text, uuid, text)
owner to postgres;
revoke all on function public.consume_account_merge_intent(
  text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.consume_account_merge_intent(
  text, text, uuid, text
) to service_role;

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

  if exists (
    select 1
    from public.merged_account_tombstones as t
    where t.source_user_id = v_user_id
  ) then
    raise exception 'MERGED_ACCOUNT_RETIRED' using errcode = 'P0001';
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

    select w.* into v_wallet
    from public.wallets as w
    where w.id = v_prior.wallet_id
      and w.user_id = v_user_id
    for update;
    if not found then
      raise exception 'REDEMPTION_STATE_INVALID' using errcode = 'P0001';
    end if;

    return query select
      v_prior.promo_code_id, v_prior.created_at, v_prior.wallet_id,
      v_wallet.user_id, v_wallet.initial_balance,
      v_wallet.remaining_balance, v_wallet.reserved_balance,
      v_wallet.provider_committed_micro_usd,
      v_wallet.provider_reserved_micro_usd, v_wallet.created_at,
      v_wallet.expires_at, v_prior.id, v_prior.state;
    return;
  end if;

  select c.* into v_code
  from public.promo_codes as c
  where c.code_hash = p_code_hash
  for update;
  if not found then
    raise exception 'CODE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_code.state = 'redeemed' then
    if v_code.redeemed_by is distinct from v_user_id then
      raise exception 'CODE_ALREADY_REDEEMED' using errcode = 'P0001';
    end if;
    select l.* into v_grant
    from public.ledger_entries as l
    where l.promo_code_id = v_code.id
      and l.user_id = v_user_id
      and l.entry_kind = 'grant'
    for update;
    if not found then
      raise exception 'REDEMPTION_STATE_INVALID' using errcode = 'P0001';
    end if;
    select w.* into v_wallet
    from public.wallets as w
    where w.id = v_grant.wallet_id
      and w.user_id = v_user_id
    for update;
    if not found then
      raise exception 'REDEMPTION_STATE_INVALID' using errcode = 'P0001';
    end if;

    return query select
      v_code.id, v_code.redeemed_at, v_wallet.id,
      v_wallet.user_id, v_wallet.initial_balance,
      v_wallet.remaining_balance, v_wallet.reserved_balance,
      v_wallet.provider_committed_micro_usd,
      v_wallet.provider_reserved_micro_usd, v_wallet.created_at,
      v_wallet.expires_at, v_grant.id, v_grant.state;
    return;
  elsif v_code.state = 'revoked' then
    raise exception 'CODE_REVOKED' using errcode = 'P0001';
  elsif v_code.state = 'expired'
    or (v_code.expires_at is not null and v_code.expires_at <= v_now) then
    update public.promo_codes set state = 'expired'
    where id = v_code.id;
    raise exception 'CODE_EXPIRED' using errcode = 'P0001';
  elsif v_code.state <> 'eligible' then
    raise exception 'CODE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select w.* into v_wallet
  from public.wallets as w
  where w.user_id = v_user_id
  for update;

  if found then
    if v_wallet.initial_balance + 3000 > 3000000 then
      raise exception 'ACCOUNT_GRANT_LIMIT_REACHED' using errcode = 'P0001';
    end if;
    update public.wallets as w
    set
      initial_balance = w.initial_balance + 3000,
      remaining_balance = w.remaining_balance + 3000,
      expires_at = v_now + interval '14 days',
      updated_at = v_now
    where w.id = v_wallet.id
    returning * into v_wallet;
  else
    insert into public.wallets (
      user_id, initial_balance, remaining_balance, reserved_balance,
      provider_committed_micro_usd, provider_reserved_micro_usd,
      created_at, expires_at
    ) values (
      v_user_id, 3000, 3000, 0, 0, 0,
      v_now, v_now + interval '14 days'
    ) returning * into v_wallet;
  end if;

  update public.promo_codes
  set state = 'redeemed', redeemed_by = v_user_id, redeemed_at = v_now
  where id = v_code.id;

  insert into public.ledger_entries (
    wallet_id, user_id, promo_code_id, entry_kind, state,
    credits_delta, provider_cost_micro_usd, idempotency_key,
    balance_after, reserved_after,
    provider_committed_after_micro_usd,
    provider_reserved_after_micro_usd
  ) values (
    v_wallet.id, v_user_id, v_code.id, 'grant', 'committed',
    3000, 0, p_idempotency_key,
    v_wallet.remaining_balance, v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd
  ) returning * into v_grant;

  return query select
    v_code.id, v_grant.created_at, v_wallet.id,
    v_wallet.user_id, v_wallet.initial_balance,
    v_wallet.remaining_balance, v_wallet.reserved_balance,
    v_wallet.provider_committed_micro_usd,
    v_wallet.provider_reserved_micro_usd, v_wallet.created_at,
    v_wallet.expires_at, v_grant.id, v_grant.state;
end;
$$;

alter function public.redeem_campaign_code(uuid, text, text)
owner to postgres;
revoke all on function public.redeem_campaign_code(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.redeem_campaign_code(uuid, text, text)
to service_role;

create or replace function public.get_partner_reward_summary(
  p_user_id uuid
)
returns table (
  reward_id uuid,
  reward_kind text,
  reward_state text,
  reward_expires_at timestamptz,
  reward_revealed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
begin
  if p_user_id is null then
    return;
  end if;

  update public.partner_rewards as r
  set state = 'expired', expired_at = v_clock, updated_at = v_clock
  from public.promo_codes as c
  where c.id = r.promo_code_id
    and c.state = 'redeemed'
    and c.redeemed_by = p_user_id
    and r.state in ('assigned', 'revealed')
    and r.expires_at <= v_clock;

  return query
  select r.id, r.kind, r.state, r.expires_at, r.revealed_at
  from public.partner_rewards as r
  join public.promo_codes as c on c.id = r.promo_code_id
  where c.state = 'redeemed'
    and c.redeemed_by = p_user_id
  order by r.assigned_at desc, r.id
  limit 1;
end;
$$;

alter function public.get_partner_reward_summary(uuid) owner to postgres;
revoke all on function public.get_partner_reward_summary(uuid)
from public, anon, authenticated;
grant execute on function public.get_partner_reward_summary(uuid)
to service_role;

commit;
