-- Serialize same-owner retries with task reserve/settle mutations so the
-- returned wallet is the authoritative current state at commit time.

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

    select w.*
    into v_wallet
    from public.wallets as w
    where w.id = v_prior.wallet_id
      and w.user_id = v_user_id
    for update;

    if not found then
      raise exception 'REDEMPTION_STATE_INVALID' using errcode = 'P0001';
    end if;

    return query
    select
      v_prior.promo_code_id,
      v_prior.created_at,
      v_prior.wallet_id,
      v_wallet.user_id,
      v_wallet.initial_balance,
      v_wallet.remaining_balance,
      v_wallet.reserved_balance,
      v_wallet.provider_committed_micro_usd,
      v_wallet.provider_reserved_micro_usd,
      v_wallet.created_at,
      v_wallet.expires_at,
      v_prior.id,
      v_prior.state;
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
    if v_code.redeemed_by is distinct from v_user_id then
      raise exception 'CODE_ALREADY_REDEEMED' using errcode = 'P0001';
    end if;

    select l.*
    into v_grant
    from public.ledger_entries as l
    where l.promo_code_id = v_code.id
      and l.user_id = v_user_id
      and l.entry_kind = 'grant'
    for update;

    if not found then
      raise exception 'REDEMPTION_STATE_INVALID' using errcode = 'P0001';
    end if;

    select w.*
    into v_wallet
    from public.wallets as w
    where w.id = v_grant.wallet_id
      and w.user_id = v_user_id
    for update;

    if not found then
      raise exception 'REDEMPTION_STATE_INVALID' using errcode = 'P0001';
    end if;

    return query
    select
      v_code.id,
      v_code.redeemed_at,
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
    return;
  elsif v_code.state = 'revoked' then
    raise exception 'CODE_REVOKED' using errcode = 'P0001';
  elsif v_code.state = 'expired'
    or (v_code.expires_at is not null and v_code.expires_at <= v_now) then
    update public.promo_codes
    set state = 'expired'
    where id = v_code.id;
    raise exception 'CODE_EXPIRED' using errcode = 'P0001';
  elsif v_code.state <> 'eligible' then
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

revoke all on function public.redeem_campaign_code(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_campaign_code(uuid, text, text)
  to service_role;
