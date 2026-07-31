-- Pin the complete EXECUTE boundary of the repaired Agent settlement RPC.
-- This is intentionally a forward-only guard: applied migration history stays
-- immutable, while any unexpected grantee, grantor, privilege, or grant option
-- prevents this migration from being recorded.

begin;

do $migration$
declare
  v_definition text;
  v_definition_hash text;
  v_oid oid;
  v_owner oid;
  v_owner_name text;
  v_service_role oid;
  v_security_definer boolean;
  v_config text[];
  v_acl pg_catalog.aclitem[];
  v_acl_count integer;
  v_owner_grants integer;
  v_service_grants integer;
  v_invalid_grants integer;
begin
  v_oid := pg_catalog.to_regprocedure(
    'public.terminalize_agent_request(uuid,uuid,text,jsonb,integer,integer,bigint,integer,text)'
  );
  if v_oid is null then
    raise exception 'AGENT_TERMINAL_EXACT_GUARD_FUNCTION_MISSING';
  end if;

  select
    pg_catalog.pg_get_functiondef(p.oid),
    p.proowner,
    owner.rolname,
    p.prosecdef,
    p.proconfig,
    p.proacl
  into
    v_definition,
    v_owner,
    v_owner_name,
    v_security_definer,
    v_config,
    v_acl
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_roles as owner on owner.oid = p.proowner
  where p.oid = v_oid;

  select role.oid
  into v_service_role
  from pg_catalog.pg_roles as role
  where role.rolname = 'service_role';

  v_definition_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_definition, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if v_definition_hash
      <> '7581abe413420cafb9e2e37b0d317139254ca84552a31cb04db6334789b80ac7'
    or not v_security_definer
    or v_owner_name <> 'postgres'
    or v_config is distinct from
      array['search_path=pg_catalog, public, extensions']::text[]
    or v_service_role is null then
    raise exception
      'AGENT_TERMINAL_EXACT_GUARD_DEFINITION_OR_SECURITY_DRIFT: %',
      v_definition_hash;
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where acl.grantee = v_owner
        and acl.grantor = v_owner
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    )::integer,
    pg_catalog.count(*) filter (
      where acl.grantee = v_service_role
        and acl.grantor = v_owner
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    )::integer,
    pg_catalog.count(*) filter (
      where acl.grantee not in (v_owner, v_service_role)
        or acl.grantor <> v_owner
        or acl.privilege_type <> 'EXECUTE'
        or acl.is_grantable
    )::integer
  into
    v_acl_count,
    v_owner_grants,
    v_service_grants,
    v_invalid_grants
  from pg_catalog.aclexplode(v_acl) as acl;

  if v_acl is null
    or v_acl_count <> 2
    or v_owner_grants <> 1
    or v_service_grants <> 1
    or v_invalid_grants <> 0 then
    raise exception
      'AGENT_TERMINAL_EXACT_GUARD_ACL_DRIFT: total %, owner %, service %, invalid %',
      v_acl_count,
      v_owner_grants,
      v_service_grants,
      v_invalid_grants;
  end if;
end;
$migration$;

commit;
