-- Bound Agent response tombstoning so normal gateway admission never performs
-- a cross-wallet sweep. Existing migrations remain immutable.

begin;

-- Fail closed before any DDL. A same-named but drifted index or pre-existing
-- helper could otherwise be overwritten while retaining unknown ownership or
-- grants.
do $preflight$
declare
  v_definition text;
  v_predicate text;
  v_is_unique boolean;
  v_is_valid boolean;
  v_is_ready boolean;
  v_is_live boolean;
  v_is_primary boolean;
begin
  if pg_catalog.to_regprocedure(
    'public.tombstone_expired_agent_responses(integer,uuid)'
  ) is not null then
    raise exception 'AGENT_REPLAY_CLEANUP_HELPER_PRESENT'
      using errcode = 'P0001';
  end if;

  if pg_catalog.to_regclass(
    'public.agent_requests_wallet_result_expiry_idx'
  ) is not null then
    raise exception 'AGENT_REPLAY_CLEANUP_TARGET_INDEX_PRESENT'
      using errcode = 'P0001';
  end if;

  select
    pg_catalog.pg_get_indexdef(i.indexrelid),
    pg_catalog.pg_get_expr(i.indpred, i.indrelid),
    i.indisunique,
    i.indisvalid,
    i.indisready,
    i.indislive,
    i.indisprimary
  into
    v_definition,
    v_predicate,
    v_is_unique,
    v_is_valid,
    v_is_ready,
    v_is_live,
    v_is_primary
  from pg_catalog.pg_index as i
  join pg_catalog.pg_class as index_relation
    on index_relation.oid = i.indexrelid
  join pg_catalog.pg_namespace as index_namespace
    on index_namespace.oid = index_relation.relnamespace
  join pg_catalog.pg_class as table_relation
    on table_relation.oid = i.indrelid
  join pg_catalog.pg_namespace as table_namespace
    on table_namespace.oid = table_relation.relnamespace
  where index_namespace.nspname = 'public'
    and index_relation.relname =
      'agent_requests_result_expiry_idx'
    and table_namespace.nspname = 'public'
    and table_relation.relname = 'agent_requests';

  if v_definition is null
    or v_definition <>
      'CREATE INDEX agent_requests_result_expiry_idx ON public.agent_requests USING btree (result_expires_at, id) WHERE (result_expires_at IS NOT NULL)'
    or v_predicate <> '(result_expires_at IS NOT NULL)'
    or v_is_unique
    or not v_is_valid
    or not v_is_ready
    or not v_is_live
    or v_is_primary then
    raise exception 'AGENT_REPLAY_CLEANUP_INDEX_DRIFT'
      using errcode = 'P0001';
  end if;
end;
$preflight$;

-- Rebuild the global expiry index so tombstoned rows leave it, then add a
-- wallet-leading sibling so request-path cleanup never walks other wallets.
drop index public.agent_requests_result_expiry_idx;
create index agent_requests_result_expiry_idx
  on public.agent_requests (result_expires_at, id)
  where state = 'completed'
    and result_payload ? 'response';
create index agent_requests_wallet_result_expiry_idx
  on public.agent_requests (wallet_id, result_expires_at, id)
  where state = 'completed'
    and result_payload ? 'response';

do $index_postcheck$
begin
  perform 1
  from pg_catalog.pg_index as i
  join pg_catalog.pg_class as index_relation
    on index_relation.oid = i.indexrelid
  join pg_catalog.pg_namespace as index_namespace
    on index_namespace.oid = index_relation.relnamespace
  join pg_catalog.pg_class as table_relation
    on table_relation.oid = i.indrelid
  join pg_catalog.pg_namespace as table_namespace
    on table_namespace.oid = table_relation.relnamespace
  where index_namespace.nspname = 'public'
    and index_relation.relname =
      'agent_requests_result_expiry_idx'
    and table_namespace.nspname = 'public'
    and table_relation.relname = 'agent_requests'
    and pg_catalog.pg_get_indexdef(i.indexrelid) =
      'CREATE INDEX agent_requests_result_expiry_idx ON public.agent_requests USING btree (result_expires_at, id) WHERE ((state = ''completed''::text) AND (result_payload ? ''response''::text))'
    and pg_catalog.pg_get_expr(i.indpred, i.indrelid) =
      '((state = ''completed''::text) AND (result_payload ? ''response''::text))'
    and not i.indisunique
    and i.indisvalid
    and i.indisready
    and i.indislive
    and not i.indisprimary;
  if not found then
    raise exception 'AGENT_REPLAY_CLEANUP_GLOBAL_INDEX_INVALID'
      using errcode = 'P0001';
  end if;

  perform 1
  from pg_catalog.pg_index as i
  join pg_catalog.pg_class as index_relation
    on index_relation.oid = i.indexrelid
  join pg_catalog.pg_namespace as index_namespace
    on index_namespace.oid = index_relation.relnamespace
  join pg_catalog.pg_class as table_relation
    on table_relation.oid = i.indrelid
  join pg_catalog.pg_namespace as table_namespace
    on table_namespace.oid = table_relation.relnamespace
  where index_namespace.nspname = 'public'
    and index_relation.relname =
      'agent_requests_wallet_result_expiry_idx'
    and table_namespace.nspname = 'public'
    and table_relation.relname = 'agent_requests'
    and pg_catalog.pg_get_indexdef(i.indexrelid) =
      'CREATE INDEX agent_requests_wallet_result_expiry_idx ON public.agent_requests USING btree (wallet_id, result_expires_at, id) WHERE ((state = ''completed''::text) AND (result_payload ? ''response''::text))'
    and pg_catalog.pg_get_expr(i.indpred, i.indrelid) =
      '((state = ''completed''::text) AND (result_payload ? ''response''::text))'
    and not i.indisunique
    and i.indisvalid
    and i.indisready
    and i.indislive
    and not i.indisprimary;
  if not found then
    raise exception 'AGENT_REPLAY_CLEANUP_WALLET_INDEX_INVALID'
      using errcode = 'P0001';
  end if;
end;
$index_postcheck$;

-- Only service-role operations may invoke global cleanup. A caller can choose
-- a single wallet for request-path cleanup, or omit it for a bounded scheduled
-- pass while the gateway is idle. The batch locks rows before changing them,
-- so concurrent workers neither block on nor rewrite the same replay payload.
create function public.tombstone_expired_agent_responses(
  p_limit integer default 500,
  p_wallet_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_clock timestamptz := pg_catalog.clock_timestamp();
  v_updated integer;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'AGENT_REPLAY_CLEANUP_INVALID' using errcode = 'P0001';
  end if;

  if p_wallet_id is null then
    with expired as (
      select r.id
      from public.agent_requests as r
      where r.state = 'completed'
        and r.result_expires_at <= v_clock
        and r.result_payload ? 'response'
      order by r.result_expires_at, r.id
      limit p_limit
      for update skip locked
    )
    update public.agent_requests as r
    set result_payload = pg_catalog.jsonb_build_object(
      'error',
      'REPLAY_EXPIRED'
    )
    from expired
    where r.id = expired.id;
    get diagnostics v_updated = row_count;
  else
    with expired as (
      select r.id
      from public.agent_requests as r
      where r.wallet_id = p_wallet_id
        and r.state = 'completed'
        and r.result_expires_at <= v_clock
        and r.result_payload ? 'response'
      order by r.result_expires_at, r.id
      limit p_limit
      for update skip locked
    )
    update public.agent_requests as r
    set result_payload = pg_catalog.jsonb_build_object(
      'error',
      'REPLAY_EXPIRED'
    )
    from expired
    where r.id = expired.id;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.tombstone_expired_agent_responses(
  integer,
  uuid
) from public, anon, authenticated;
grant execute on function public.tombstone_expired_agent_responses(
  integer,
  uuid
) to service_role;

do $helper_postcheck$
declare
  v_helper_oid oid;
  v_helper_owner oid;
  v_admission_owner oid;
  v_service_role oid;
  v_security_definer boolean;
  v_configuration text[];
  v_acl aclitem[];
  v_definition_hash text;
  v_acl_count integer;
  v_owner_grants integer;
  v_service_grants integer;
  v_invalid_grants integer;
begin
  select
    p.oid,
    p.proowner,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(p.oid),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_helper_oid,
    v_helper_owner,
    v_security_definer,
    v_configuration,
    v_acl,
    v_definition_hash
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.tombstone_expired_agent_responses(integer,uuid)'
  );

  select p.proowner
  into v_admission_owner
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.begin_agent_request_unchecked(text,text,text,text,bigint,integer,uuid,timestamptz)'
  );

  select r.oid
  into v_service_role
  from pg_catalog.pg_roles as r
  where r.rolname = 'service_role';

  if v_helper_oid is null
    or v_admission_owner is null
    or v_service_role is null
    or v_helper_owner <> v_admission_owner
    or not v_security_definer
    or v_configuration is distinct from
      array['search_path=pg_catalog, public, extensions']::text[]
    or v_acl is null
    or v_definition_hash <>
      '238285522427f86616158a2a9276c40d790fe2089a0ef1ce05e48185f17b2ffb' then
    raise exception 'AGENT_REPLAY_CLEANUP_HELPER_INVALID'
      using errcode = 'P0001';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where acl.grantee = v_helper_owner
        and acl.grantor = v_helper_owner
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    )::integer,
    pg_catalog.count(*) filter (
      where acl.grantee = v_service_role
        and acl.grantor = v_helper_owner
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    )::integer,
    pg_catalog.count(*) filter (
      where acl.grantee not in (
        v_helper_owner,
        v_service_role
      )
        or acl.grantor <> v_helper_owner
        or acl.privilege_type <> 'EXECUTE'
        or acl.is_grantable
    )::integer
  into
    v_acl_count,
    v_owner_grants,
    v_service_grants,
    v_invalid_grants
  from pg_catalog.aclexplode(v_acl) as acl;

  if v_acl_count <> 2
    or v_owner_grants <> 1
    or v_service_grants <> 1
    or v_invalid_grants <> 0 then
    raise exception 'AGENT_REPLAY_CLEANUP_HELPER_ACL_INVALID'
      using errcode = 'P0001';
  end if;
end;
$helper_postcheck$;

-- Migration 004 intentionally wraps this implementation. Rewrite only the
-- known 006 definition, replacing the old unbounded cross-wallet UPDATE with
-- a local, 20-row service-only cleanup call. This leaves reservations,
-- idempotency records, and usage/accounting rows untouched.
do $migration$
declare
  v_definition text;
  v_definition_hash text;
  v_function_oid oid;
  v_function_owner oid;
  v_function_acl aclitem[];
  v_function_acl_count integer;
  v_function_owner_grants integer;
  v_function_invalid_grants integer;
  v_function_configuration text[];
  v_function_security_definer boolean;
  v_new_definition text;
  v_new_definition_hash text;
  v_new_function_oid oid;
  v_new_function_owner oid;
  v_new_function_acl aclitem[];
  v_new_function_configuration text[];
  v_new_function_security_definer boolean;
  v_old_cleanup text := $cleanup$
  update public.agent_requests as r
  set result_payload =
    pg_catalog.jsonb_build_object('error', 'REPLAY_EXPIRED')
  where r.state = 'completed'
    and r.result_expires_at <= v_clock
    and r.result_payload ? 'response';$cleanup$;
  v_new_cleanup text := $cleanup$
  perform public.tombstone_expired_agent_responses(20, v_wallet.id);$cleanup$;
  v_replacement_count integer;
begin
  select
    p.oid,
    p.proowner,
    p.proacl,
    p.proconfig,
    p.prosecdef,
    pg_catalog.pg_get_functiondef(p.oid)
  into
    v_function_oid,
    v_function_owner,
    v_function_acl,
    v_function_configuration,
    v_function_security_definer,
    v_definition
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.begin_agent_request_unchecked(text,text,text,text,bigint,integer,uuid,timestamptz)'
  );

  if v_function_oid is null or v_definition is null then
    raise exception 'AGENT_REPLAY_CLEANUP_FUNCTION_MISSING'
      using errcode = 'P0001';
  end if;

  if v_function_acl is null then
    raise exception 'AGENT_REPLAY_CLEANUP_FUNCTION_ACL_DRIFT'
      using errcode = 'P0001';
  end if;
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where acl.grantee = v_function_owner
        and acl.grantor = v_function_owner
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    )::integer,
    pg_catalog.count(*) filter (
      where acl.grantee <> v_function_owner
        or acl.grantor <> v_function_owner
        or acl.privilege_type <> 'EXECUTE'
        or acl.is_grantable
    )::integer
  into
    v_function_acl_count,
    v_function_owner_grants,
    v_function_invalid_grants
  from pg_catalog.aclexplode(v_function_acl) as acl;
  if v_function_acl_count <> 1
    or v_function_owner_grants <> 1
    or v_function_invalid_grants <> 0 then
    raise exception 'AGENT_REPLAY_CLEANUP_FUNCTION_ACL_DRIFT'
      using errcode = 'P0001';
  end if;

  v_definition_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_definition, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_definition_hash
    <> 'd8c210e2bdc0c94cf16a1be813068cfd479f8dd7fb63fef84fc7a172d9fd31fe' then
    raise exception 'AGENT_REPLAY_CLEANUP_FUNCTION_DRIFT'
      using errcode = 'P0001';
  end if;

  v_replacement_count := (
    pg_catalog.length(v_definition)
      - pg_catalog.length(
        pg_catalog.replace(v_definition, v_old_cleanup, '')
      )
  ) / pg_catalog.length(v_old_cleanup);
  if v_replacement_count <> 1 then
    raise exception 'AGENT_REPLAY_CLEANUP_REWRITE_INVALID: %',
      v_replacement_count using errcode = 'P0001';
  end if;

  v_new_definition := pg_catalog.replace(
    v_definition,
    v_old_cleanup,
    v_new_cleanup
  );
  execute v_new_definition;

  select
    p.oid,
    p.proowner,
    p.proacl,
    p.proconfig,
    p.prosecdef,
    pg_catalog.pg_get_functiondef(p.oid)
  into
    v_new_function_oid,
    v_new_function_owner,
    v_new_function_acl,
    v_new_function_configuration,
    v_new_function_security_definer,
    v_new_definition
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.begin_agent_request_unchecked(text,text,text,text,bigint,integer,uuid,timestamptz)'
  );

  v_new_definition_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_new_definition, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  if v_new_definition is null
    or v_new_definition_hash <>
      '6746a819491a7efe13718d18a65e6f20efe4998bb244778718ba0d61d9b772fb'
    or v_new_function_oid <> v_function_oid
    or v_new_function_owner <> v_function_owner
    or v_new_function_acl is distinct from v_function_acl
    or v_new_function_configuration is distinct from
      v_function_configuration
    or v_new_function_security_definer is distinct from
      v_function_security_definer
    or pg_catalog.strpos(
      v_new_definition,
      'perform public.tombstone_expired_agent_responses(20, v_wallet.id);'
    ) = 0
    or pg_catalog.strpos(v_new_definition, v_old_cleanup) > 0 then
    raise exception 'AGENT_REPLAY_CLEANUP_REWRITE_FAILED'
      using errcode = 'P0001';
  end if;
end;
$migration$;

commit;
