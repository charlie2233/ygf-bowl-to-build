-- Extend claim admission from one broad network signal to independent,
-- privacy-preserving session, account, and claim dimensions. Raw network
-- addresses, session cookies, Turnstile tokens, and plaintext codes never
-- cross this database boundary.

-- Apply through the transaction-capable migration lane. SET LOCAL bounds DDL
-- waits without leaking timeout settings if the transaction rolls back.
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.public_validation_attempts
  add column session_digest text,
  add column code_digest text,
  add column account_digest text;

alter table public.redemption_attempts
  add column session_digest text,
  add column code_digest text;

alter table public.public_validation_attempts
  add constraint public_validation_attempts_session_digest_check
    check (
      session_digest is null
      or (
        char_length(session_digest) = 64
        and session_digest ~ '^[0-9a-f]{64}$'
      )
    ) not valid,
  add constraint public_validation_attempts_code_digest_check
    check (
      code_digest is null
      or (
        char_length(code_digest) = 64
        and code_digest ~ '^[0-9a-f]{64}$'
      )
    ) not valid,
  add constraint public_validation_attempts_account_digest_check
    check (
      account_digest is null
      or (
        char_length(account_digest) = 64
        and account_digest ~ '^[0-9a-f]{64}$'
      )
    ) not valid;

alter table public.redemption_attempts
  add constraint redemption_attempts_session_digest_check
    check (
      session_digest is null
      or (
        char_length(session_digest) = 64
        and session_digest ~ '^[0-9a-f]{64}$'
      )
    ) not valid,
  add constraint redemption_attempts_code_digest_check
    check (
      code_digest is null
      or (
        char_length(code_digest) = 64
        and code_digest ~ '^[0-9a-f]{64}$'
      )
    ) not valid;

-- Ordinary indexes are allowed only for the paused, reviewed small-table lane.
-- Abort before validation or index creation if either table is no longer small;
-- a larger table requires a dedicated concurrent-index migration after the
-- migration runner/version has been pinned and verified.
do $$
declare
  v_public_rows integer;
  v_redemption_rows integer;
begin
  select pg_catalog.count(*)::integer
  into v_public_rows
  from (
    select 1
    from public.public_validation_attempts
    limit 10001
  ) as bounded_public_rows;

  select pg_catalog.count(*)::integer
  into v_redemption_rows
  from (
    select 1
    from public.redemption_attempts
    limit 10001
  ) as bounded_redemption_rows;

  if v_public_rows > 10000 or v_redemption_rows > 10000 then
    raise exception 'ADMISSION_INDEX_PREFLIGHT_REQUIRED'
      using errcode = 'P0001';
  end if;
end;
$$;

alter table public.public_validation_attempts
  validate constraint public_validation_attempts_session_digest_check;
alter table public.public_validation_attempts
  validate constraint public_validation_attempts_code_digest_check;
alter table public.public_validation_attempts
  validate constraint public_validation_attempts_account_digest_check;
alter table public.redemption_attempts
  validate constraint redemption_attempts_session_digest_check;
alter table public.redemption_attempts
  validate constraint redemption_attempts_code_digest_check;

create index public_validation_attempts_session_bucket_idx
  on public.public_validation_attempts (
    session_digest,
    signal_bucket
  )
  where allowed and session_digest is not null;

create index public_validation_attempts_code_bucket_idx
  on public.public_validation_attempts (
    code_digest,
    signal_bucket
  )
  where allowed and code_digest is not null;

create index public_validation_attempts_account_bucket_idx
  on public.public_validation_attempts (
    account_digest,
    signal_bucket
  )
  where allowed and account_digest is not null;

create index redemption_attempts_session_bucket_idx
  on public.redemption_attempts (
    session_digest,
    signal_bucket
  )
  where session_digest is not null and outcome <> 'throttled';

create index redemption_attempts_code_bucket_idx
  on public.redemption_attempts (
    code_digest,
    signal_bucket
  )
  where code_digest is not null and outcome <> 'throttled';

create function public.admit_campaign_public_validation_v2(
  p_signal_digest text,
  p_signal_version text,
  p_signal_purpose text,
  p_signal_bucket bigint,
  p_signal_expires_at timestamptz,
  p_session_digest text,
  p_code_digest text,
  p_account_digest text
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
  v_session_lock_key bigint;
  v_code_lock_key bigint;
  v_account_lock_key bigint;
  v_lock_key bigint;
  v_signal_admitted_count bigint;
  v_session_admitted_count bigint;
  v_code_admitted_count bigint := 0;
  v_account_admitted_count bigint := 0;
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
    or p_signal_expires_at is null
    or p_session_digest is null
    or p_session_digest !~ '^[0-9a-f]{64}$'
    or (
      p_code_digest is not null
      and p_code_digest !~ '^[0-9a-f]{64}$'
    )
    or (
      p_account_digest is not null
      and p_account_digest !~ '^[0-9a-f]{64}$'
    ) then
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
  v_session_lock_key := pg_catalog.hashtextextended(
    'ygf:public-validation:session:v2:'
      || p_signal_bucket::text
      || ':'
      || p_session_digest,
    0
  );
  if p_code_digest is not null then
    v_code_lock_key := pg_catalog.hashtextextended(
      'ygf:public-validation:code:v2:'
        || p_signal_bucket::text
        || ':'
        || p_code_digest,
      0
    );
  end if;
  if p_account_digest is not null then
    v_account_lock_key := pg_catalog.hashtextextended(
      'ygf:public-validation:account:v2:'
        || p_signal_bucket::text
        || ':'
        || p_account_digest,
      0
    );
  end if;

  for v_lock_key in
    select distinct candidate.lock_key
    from pg_catalog.unnest(
      array[
        v_signal_lock_key,
        v_session_lock_key,
        v_code_lock_key,
        v_account_lock_key
      ]::bigint[]
    ) as candidate(lock_key)
    where candidate.lock_key is not null
    order by candidate.lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock_key);
  end loop;

  select pg_catalog.count(*)
  into v_signal_admitted_count
  from public.public_validation_attempts as a
  where a.signal_version = p_signal_version
    and a.signal_purpose = p_signal_purpose
    and a.signal_digest = p_signal_digest
    and a.signal_bucket = p_signal_bucket
    and a.allowed;

  select pg_catalog.count(*)
  into v_session_admitted_count
  from public.public_validation_attempts as a
  where a.session_digest = p_session_digest
    and a.signal_bucket = p_signal_bucket
    and a.allowed;

  if p_code_digest is not null then
    select pg_catalog.count(*)
    into v_code_admitted_count
    from public.public_validation_attempts as a
    where a.code_digest = p_code_digest
      and a.signal_bucket = p_signal_bucket
      and a.allowed;
  end if;

  if p_account_digest is not null then
    select pg_catalog.count(*)
    into v_account_admitted_count
    from public.public_validation_attempts as a
    where a.account_digest = p_account_digest
      and a.signal_bucket = p_signal_bucket
      and a.allowed;
  end if;

  v_allowed :=
    v_signal_admitted_count < 300
    and v_session_admitted_count < 12
    and (
      p_code_digest is null
      or v_code_admitted_count < 20
    )
    and (
      p_account_digest is null
      or v_account_admitted_count < 10
    );

  if not v_allowed then
    return false;
  end if;

  insert into public.public_validation_attempts (
    signal_digest,
    signal_version,
    signal_purpose,
    signal_bucket,
    session_digest,
    code_digest,
    account_digest,
    allowed,
    created_at,
    expires_at
  )
  values (
    p_signal_digest,
    p_signal_version,
    p_signal_purpose,
    p_signal_bucket,
    p_session_digest,
    p_code_digest,
    p_account_digest,
    true,
    v_now,
    p_signal_expires_at
  );

  return true;
end;
$$;

alter function public.admit_campaign_public_validation_v2(
  text,
  text,
  text,
  bigint,
  timestamptz,
  text,
  text,
  text
) owner to postgres;

create function public.admit_campaign_redemption_attempt_v2(
  p_user_id uuid,
  p_signal_digest text,
  p_signal_version text,
  p_signal_purpose text,
  p_signal_bucket bigint,
  p_signal_expires_at timestamptz,
  p_session_digest text,
  p_code_digest text
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
  v_session_lock_key bigint;
  v_code_lock_key bigint;
  v_lock_key bigint;
  v_user_admitted_count bigint;
  v_signal_admitted_count bigint;
  v_session_admitted_count bigint;
  v_code_admitted_count bigint;
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
    or p_signal_purpose <> 'redeem'
    or p_signal_bucket is null
    or p_signal_bucket <> v_current_signal_bucket
    or p_signal_expires_at is null
    or p_session_digest is null
    or p_session_digest !~ '^[0-9a-f]{64}$'
    or p_code_digest is null
    or p_code_digest !~ '^[0-9a-f]{64}$' then
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
  v_session_lock_key := pg_catalog.hashtextextended(
    'ygf:redemption:session:v2:'
      || p_signal_bucket::text
      || ':'
      || p_session_digest,
    0
  );
  v_code_lock_key := pg_catalog.hashtextextended(
    'ygf:redemption:code:v2:'
      || p_signal_bucket::text
      || ':'
      || p_code_digest,
    0
  );

  for v_lock_key in
    select distinct candidate.lock_key
    from pg_catalog.unnest(
      array[
        v_user_lock_key,
        v_signal_lock_key,
        v_session_lock_key,
        v_code_lock_key
      ]::bigint[]
    ) as candidate(lock_key)
    order by candidate.lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock_key);
  end loop;

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

  select pg_catalog.count(*)
  into v_session_admitted_count
  from public.redemption_attempts as a
  where a.session_digest = p_session_digest
    and a.signal_bucket = p_signal_bucket
    and a.outcome <> 'throttled';

  select pg_catalog.count(*)
  into v_code_admitted_count
  from public.redemption_attempts as a
  where a.code_digest = p_code_digest
    and a.signal_bucket = p_signal_bucket
    and a.outcome <> 'throttled';

  v_allowed :=
    v_user_admitted_count < 5
    and v_signal_admitted_count < 200
    and v_session_admitted_count < 5
    and v_code_admitted_count < 10;

  if not v_allowed then
    return query select null::uuid, false;
    return;
  end if;

  insert into public.redemption_attempts (
    user_id,
    signal_digest,
    signal_version,
    signal_purpose,
    signal_bucket,
    session_digest,
    code_digest,
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
    p_session_digest,
    p_code_digest,
    'unavailable',
    v_now,
    null,
    v_now + interval '1 hour'
  )
  returning id into v_attempt_id;

  return query select v_attempt_id, true;
end;
$$;

alter function public.admit_campaign_redemption_attempt_v2(
  uuid,
  text,
  text,
  text,
  bigint,
  timestamptz,
  text,
  text
) owner to postgres;

-- Function EXECUTE defaults are configurable per deployment role. Reassert
-- ownership, remove PUBLIC and every unexpected direct or inherited grant,
-- and fail the migration unless the effective non-superuser boundary is
-- exactly the postgres owner plus service_role. PostgreSQL superusers retain
-- their inherent bypass and are intentionally excluded from the ACL check.
alter function public.admit_campaign_public_validation(
  text,
  text,
  text,
  bigint,
  timestamptz
) owner to postgres;
alter function public.admit_campaign_redemption_attempt(
  uuid,
  text,
  text,
  text,
  bigint,
  timestamptz
) owner to postgres;
alter function public.finish_campaign_redemption_attempt(uuid, text)
  owner to postgres;
alter function public.redeem_campaign_code(uuid, text, text)
  owner to postgres;

do $acl$
declare
  v_target regprocedure;
  v_owner_oid oid;
  v_service_oid oid := 'service_role'::regrole::oid;
  v_grantee record;
begin
  foreach v_target in array array[
    'public.admit_campaign_public_validation(text,text,text,bigint,timestamptz)'::regprocedure,
    'public.admit_campaign_redemption_attempt(uuid,text,text,text,bigint,timestamptz)'::regprocedure,
    'public.admit_campaign_public_validation_v2(text,text,text,bigint,timestamptz,text,text,text)'::regprocedure,
    'public.admit_campaign_redemption_attempt_v2(uuid,text,text,text,bigint,timestamptz,text,text)'::regprocedure,
    'public.finish_campaign_redemption_attempt(uuid,text)'::regprocedure,
    'public.redeem_campaign_code(uuid,text,text)'::regprocedure
  ]::regprocedure[]
  loop
    select p.proowner
    into strict v_owner_oid
    from pg_catalog.pg_proc as p
    where p.oid = v_target::oid;

    if v_owner_oid <> 'postgres'::regrole::oid then
      raise exception 'FUNCTION_OWNER_INVALID: %', v_target
        using errcode = 'P0001';
    end if;

    execute pg_catalog.format(
      'revoke all privileges on function %s from public cascade',
      v_target
    );

    for v_grantee in
      select distinct r.rolname
      from pg_catalog.pg_proc as p
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          p.proacl,
          pg_catalog.acldefault('f'::"char", p.proowner)
        )
      ) as acl_entry
      join pg_catalog.pg_roles as r
        on r.oid = acl_entry.grantee
      where p.oid = v_target::oid
        and acl_entry.privilege_type = 'EXECUTE'
        and acl_entry.grantee <> v_owner_oid
    loop
      execute pg_catalog.format(
        'revoke all privileges on function %s from %I cascade',
        v_target,
        v_grantee.rolname
      );
    end loop;

    execute pg_catalog.format(
      'grant execute on function %s to service_role',
      v_target
    );

    if not pg_catalog.has_function_privilege(
      v_owner_oid,
      v_target::oid,
      'EXECUTE'
    )
      or not pg_catalog.has_function_privilege(
        v_service_oid,
        v_target::oid,
        'EXECUTE'
      )
      or pg_catalog.has_function_privilege(
        v_service_oid,
        v_target::oid,
        'EXECUTE WITH GRANT OPTION'
      )
      or exists (
        select 1
        from pg_catalog.pg_roles as r
        where r.oid <> v_owner_oid
          and r.oid <> v_service_oid
          and not r.rolsuper
          and pg_catalog.has_function_privilege(
            r.oid,
            v_target::oid,
            'EXECUTE'
          )
      ) then
      raise exception 'FUNCTION_EFFECTIVE_ACL_INVALID: %', v_target
        using errcode = 'P0001';
    end if;
  end loop;
end;
$acl$;
