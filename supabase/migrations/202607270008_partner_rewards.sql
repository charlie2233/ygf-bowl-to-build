-- Selected campaign codes may carry an independently expiring partner reward.
-- The bearer secret is encrypted by the application before it reaches
-- Postgres. This schema stores only the authenticated encryption envelope and
-- a keyed digest; no plaintext gift URL is accepted or returned.

begin;

create table public.partner_rewards (
  id uuid primary key default extensions.gen_random_uuid(),
  promo_code_id uuid not null unique
    references public.promo_codes(id) on delete restrict,
  kind text not null
    check (kind = 'claude-pro-gift'),
  state text not null default 'assigned'
    check (state in ('assigned', 'revealed', 'revoked', 'expired')),
  envelope_version smallint not null default 1
    check (envelope_version = 1),
  encryption_algorithm text not null default 'aes-256-gcm'
    check (encryption_algorithm = 'aes-256-gcm'),
  secret_ciphertext text not null
    check (
      pg_catalog.char_length(secret_ciphertext) between 1 and 4096
      and secret_ciphertext ~ '^[A-Za-z0-9_-]+$'
    ),
  secret_iv text not null
    check (
      pg_catalog.char_length(secret_iv) = 16
      and secret_iv ~ '^[A-Za-z0-9_-]{16}$'
    ),
  secret_tag text not null
    check (
      pg_catalog.char_length(secret_tag) = 22
      and secret_tag ~ '^[A-Za-z0-9_-]{22}$'
    ),
  secret_digest text not null unique
    check (
      pg_catalog.char_length(secret_digest) = 64
      and secret_digest ~ '^[0-9a-f]{64}$'
    ),
  assignment_request_id uuid not null unique,
  assignment_fingerprint text not null
    check (
      pg_catalog.char_length(assignment_fingerprint) = 64
      and assignment_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  revealed_by uuid references auth.users(id) on delete restrict,
  revealed_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  expired_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check (expires_at > assigned_at),
  check (
    (revealed_by is null and revealed_at is null)
    or (revealed_by is not null and revealed_at is not null)
  ),
  check (
    (revoked_by is null and revoked_at is null)
    or (revoked_by is not null and revoked_at is not null)
  ),
  check (
    (state = 'assigned'
      and revealed_by is null
      and revealed_at is null
      and revoked_by is null
      and revoked_at is null
      and expired_at is null)
    or
    (state = 'revealed'
      and revealed_by is not null
      and revealed_at is not null
      and revoked_by is null
      and revoked_at is null
      and expired_at is null)
    or
    (state = 'revoked'
      and revoked_by is not null
      and revoked_at is not null
      and expired_at is null)
    or
    (state = 'expired'
      and revoked_by is null
      and revoked_at is null
      and expired_at is not null)
  ),
  check (revealed_at is null or revealed_at >= assigned_at),
  check (revoked_at is null or revoked_at >= assigned_at),
  check (expired_at is null or expired_at >= assigned_at)
);

create index partner_rewards_state_expiry_idx
  on public.partner_rewards (state, expires_at, id)
  where state in ('assigned', 'revealed');

create trigger partner_rewards_set_updated_at
before update on public.partner_rewards
for each row execute function public.set_updated_at();

alter table public.partner_rewards enable row level security;
alter table public.partner_rewards force row level security;

revoke all on table public.partner_rewards
from public, anon, authenticated;
grant all on table public.partner_rewards to service_role;

create function public.assign_partner_reward(
  p_operator_id uuid,
  p_request_id uuid,
  p_row_reference text,
  p_kind text,
  p_secret_ciphertext text,
  p_secret_iv text,
  p_secret_tag text,
  p_secret_digest text,
  p_expires_at timestamptz
)
returns table (
  reward_id uuid,
  promo_code_id uuid,
  row_reference text,
  reward_kind text,
  reward_state text,
  reward_expires_at timestamptz,
  reward_revealed_at timestamptz,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_fingerprint text;
  v_code public.promo_codes%rowtype;
  v_existing public.partner_rewards%rowtype;
  v_reward public.partner_rewards%rowtype;
begin
  if p_operator_id is null
    or p_request_id is null
    or p_row_reference is null
    or p_row_reference
      !~ '^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$'
    or p_kind is distinct from 'claude-pro-gift'
    or p_secret_ciphertext is null
    or pg_catalog.char_length(p_secret_ciphertext) not between 1 and 4096
    or p_secret_ciphertext !~ '^[A-Za-z0-9_-]+$'
    or p_secret_iv is null
    or p_secret_iv !~ '^[A-Za-z0-9_-]{16}$'
    or p_secret_tag is null
    or p_secret_tag !~ '^[A-Za-z0-9_-]{22}$'
    or p_secret_digest is null
    or p_secret_digest !~ '^[0-9a-f]{64}$'
    or p_expires_at is null
    or p_expires_at <= v_clock then
    raise exception 'PARTNER_REWARD_ASSIGNMENT_INVALID'
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
          'operation', 'assign-partner-reward',
          'operatorId', p_operator_id,
          'rowReference', p_row_reference,
          'kind', p_kind,
          'secretDigest', p_secret_digest,
          'expiresAt', p_expires_at
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ygf:partner-reward:request:' || p_request_id::text,
      0
    )
  );

  select r.*
  into v_existing
  from public.partner_rewards as r
  where r.assignment_request_id = p_request_id
  for update;

  if found then
    if v_existing.assigned_by <> p_operator_id
      or v_existing.assignment_fingerprint <> v_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select
      v_existing.id,
      v_existing.promo_code_id,
      c.row_reference,
      v_existing.kind,
      v_existing.state,
      v_existing.expires_at,
      v_existing.revealed_at,
      v_existing.assigned_at
    from public.promo_codes as c
    where c.id = v_existing.promo_code_id;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ygf:partner-reward:row:' || p_row_reference,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ygf:partner-reward:digest:' || p_secret_digest,
      0
    )
  );

  select c.*
  into v_code
  from public.promo_codes as c
  where c.row_reference = p_row_reference
  for update;

  if not found then
    raise exception 'ADMIN_CODE_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  if v_code.state not in ('pending', 'eligible')
    or (
      v_code.expires_at is not null
      and v_code.expires_at <= v_clock
    ) then
    raise exception 'PARTNER_REWARD_NOT_ASSIGNABLE'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.partner_rewards as r
    where r.promo_code_id = v_code.id
  ) then
    raise exception 'PARTNER_REWARD_ALREADY_ASSIGNED'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.partner_rewards as r
    where r.secret_digest = p_secret_digest
  ) then
    raise exception 'PARTNER_REWARD_SECRET_ALREADY_ASSIGNED'
      using errcode = 'P0001';
  end if;

  begin
    insert into public.partner_rewards (
      promo_code_id,
      kind,
      state,
      secret_ciphertext,
      secret_iv,
      secret_tag,
      secret_digest,
      assignment_request_id,
      assignment_fingerprint,
      assigned_by,
      assigned_at,
      expires_at,
      updated_at
    )
    values (
      v_code.id,
      p_kind,
      'assigned',
      p_secret_ciphertext,
      p_secret_iv,
      p_secret_tag,
      p_secret_digest,
      p_request_id,
      v_fingerprint,
      p_operator_id,
      v_clock,
      p_expires_at,
      v_clock
    )
    returning * into v_reward;
  exception
    when unique_violation then
      if exists (
        select 1
        from public.partner_rewards as r
        where r.secret_digest = p_secret_digest
      ) then
        raise exception 'PARTNER_REWARD_SECRET_ALREADY_ASSIGNED'
          using errcode = 'P0001';
      end if;
      if exists (
        select 1
        from public.partner_rewards as r
        where r.promo_code_id = v_code.id
      ) then
        raise exception 'PARTNER_REWARD_ALREADY_ASSIGNED'
          using errcode = 'P0001';
      end if;
      raise exception 'PARTNER_REWARD_ASSIGNMENT_CONFLICT'
        using errcode = 'P0001';
  end;

  return query
  select
    v_reward.id,
    v_reward.promo_code_id,
    v_code.row_reference,
    v_reward.kind,
    v_reward.state,
    v_reward.expires_at,
    v_reward.revealed_at,
    v_reward.assigned_at;
end;
$$;

create function public.get_partner_reward_summary(
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
  set
    state = 'expired',
    expired_at = v_clock,
    updated_at = v_clock
  from public.promo_codes as c
  where c.id = r.promo_code_id
    and c.state = 'redeemed'
    and c.redeemed_by = p_user_id
    and r.state in ('assigned', 'revealed')
    and r.expires_at <= v_clock;

  return query
  select
    r.id,
    r.kind,
    r.state,
    r.expires_at,
    r.revealed_at
  from public.partner_rewards as r
  join public.promo_codes as c
    on c.id = r.promo_code_id
  where c.state = 'redeemed'
    and c.redeemed_by = p_user_id;
end;
$$;

create function public.reveal_partner_reward(
  p_user_id uuid,
  p_reward_id uuid
)
returns table (
  reward_id uuid,
  reward_kind text,
  reward_state text,
  reward_expires_at timestamptz,
  reward_revealed_at timestamptz,
  secret_ciphertext text,
  secret_iv text,
  secret_tag text,
  secret_digest text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_reward public.partner_rewards%rowtype;
begin
  if p_user_id is null then
    raise exception 'PARTNER_REWARD_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select r.*
  into v_reward
  from public.partner_rewards as r
  join public.promo_codes as c
    on c.id = r.promo_code_id
  where c.state = 'redeemed'
    and c.redeemed_by = p_user_id
    and (p_reward_id is null or r.id = p_reward_id)
  order by r.assigned_at desc, r.id
  limit 1
  for update of r;

  if not found then
    raise exception 'PARTNER_REWARD_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  if v_reward.state = 'revoked' then
    raise exception 'PARTNER_REWARD_REVOKED'
      using errcode = 'P0001';
  end if;
  if v_reward.state = 'expired' then
    raise exception 'PARTNER_REWARD_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_reward.expires_at <= v_clock then
    -- A raised error rolls back the current statement, so do not pretend an
    -- expiry marker can be persisted here. The timestamp remains
    -- authoritative and summary reads persist the terminal state.
    raise exception 'PARTNER_REWARD_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_reward.state = 'assigned' then
    update public.partner_rewards as r
    set
      state = 'revealed',
      revealed_by = p_user_id,
      revealed_at = v_clock,
      updated_at = v_clock
    where r.id = v_reward.id
    returning * into v_reward;
  elsif v_reward.state = 'revealed'
    and v_reward.revealed_by is distinct from p_user_id then
    raise exception 'PARTNER_REWARD_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  return query
  select
    v_reward.id,
    v_reward.kind,
    v_reward.state,
    v_reward.expires_at,
    v_reward.revealed_at,
    v_reward.secret_ciphertext,
    v_reward.secret_iv,
    v_reward.secret_tag,
    v_reward.secret_digest;
end;
$$;

create function public.revoke_partner_reward(
  p_operator_id uuid,
  p_row_reference text
)
returns table (
  reward_id uuid,
  row_reference text,
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
  v_code public.promo_codes%rowtype;
  v_reward public.partner_rewards%rowtype;
begin
  if p_operator_id is null
    or p_row_reference is null
    or p_row_reference
      !~ '^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$' then
    raise exception 'PARTNER_REWARD_REVOCATION_INVALID'
      using errcode = 'P0001';
  end if;

  perform p.id
  from public.profiles as p
  where p.id = p_operator_id
    and p.campaign_role = 'admin';
  if not found then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  -- The non-secret operations reference is the only manager selector. Lock
  -- both authoritative rows so assignment/reveal/revocation cannot race.
  select c.*
  into v_code
  from public.promo_codes as c
  where c.row_reference = p_row_reference
  for update;
  if not found then
    raise exception 'PARTNER_REWARD_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select r.*
  into v_reward
  from public.partner_rewards as r
  where r.promo_code_id = v_code.id
  for update;
  if not found then
    raise exception 'PARTNER_REWARD_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_reward.state in ('assigned', 'revealed')
    and v_reward.expires_at <= v_clock then
    update public.partner_rewards as r
    set
      state = 'expired',
      expired_at = v_clock,
      updated_at = v_clock
    where r.id = v_reward.id
    returning * into v_reward;
  elsif v_reward.state in ('assigned', 'revealed') then
    update public.partner_rewards as r
    set
      state = 'revoked',
      revoked_by = p_operator_id,
      revoked_at = v_clock,
      updated_at = v_clock
    where r.id = v_reward.id
    returning * into v_reward;
  end if;

  return query
  select
    v_reward.id,
    v_code.row_reference,
    v_reward.kind,
    v_reward.state,
    v_reward.expires_at,
    v_reward.revealed_at;
end;
$$;

revoke all on function public.assign_partner_reward(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.assign_partner_reward(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

revoke all on function public.get_partner_reward_summary(uuid)
from public, anon, authenticated;
grant execute on function public.get_partner_reward_summary(uuid)
to service_role;

revoke all on function public.reveal_partner_reward(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.reveal_partner_reward(uuid, uuid)
to service_role;

revoke all on function public.revoke_partner_reward(uuid, text)
from public, anon, authenticated;
grant execute on function public.revoke_partner_reward(uuid, text)
to service_role;

commit;
