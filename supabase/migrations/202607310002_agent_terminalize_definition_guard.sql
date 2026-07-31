-- Pin the repaired settlement function after the targeted runtime rewrite.
-- The previous provider-budget migration already pinned the exact pre-repair
-- definition. This guard pins the post-repair definition and its privileged
-- execution boundary so catalog drift cannot be silently accepted.

begin;

do $migration$
declare
  v_definition text;
  v_definition_hash text;
  v_oid oid;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
begin
  v_oid := pg_catalog.to_regprocedure(
    'public.terminalize_agent_request(uuid,uuid,text,jsonb,integer,integer,bigint,integer,text)'
  );
  if v_oid is null then
    raise exception 'AGENT_TERMINAL_GUARD_FUNCTION_MISSING';
  end if;

  select
    pg_catalog.pg_get_functiondef(p.oid),
    p.prosecdef,
    p.proconfig,
    owner.rolname
  into
    v_definition,
    v_security_definer,
    v_config,
    v_owner
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_roles as owner on owner.oid = p.proowner
  where p.oid = v_oid;

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
    or v_owner <> 'postgres'
    or v_config is distinct from
      array['search_path=pg_catalog, public, extensions']::text[]
    or pg_catalog.strpos(v_definition, 'pg_catalog.coalesce') <> 0
    or pg_catalog.has_function_privilege(
      'public',
      v_oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      v_oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_oid,
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      v_oid,
      'EXECUTE'
    ) then
    raise exception
      'AGENT_TERMINAL_GUARD_DEFINITION_OR_SECURITY_DRIFT: %',
      v_definition_hash;
  end if;
end;
$migration$;

commit;
