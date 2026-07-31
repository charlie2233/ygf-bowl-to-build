-- Repair the live Agent terminalization RPC without rewriting applied history.
-- COALESCE is SQL syntax, not a schema-qualified pg_catalog function. The
-- original body therefore installed successfully but failed on first use.

begin;

do $migration$
declare
  v_function_oid oid;
  v_definition text;
  v_repaired_definition text;
  v_occurrences integer;
begin
  select pg_catalog.to_regprocedure(
    'public.terminalize_agent_request(uuid,uuid,text,jsonb,integer,integer,bigint,integer,text)'
  )::oid
  into v_function_oid;

  if v_function_oid is null then
    raise exception 'AGENT_TERMINAL_FUNCTION_MISSING';
  end if;

  select pg_catalog.pg_get_functiondef(v_function_oid)
  into v_definition;

  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(
      pg_catalog.replace(
        v_definition,
        'pg_catalog.coalesce',
        ''
      )
    )
  ) / pg_catalog.length('pg_catalog.coalesce');

  if v_occurrences <> 2 then
    raise exception
      'AGENT_TERMINAL_COALESCE_REPAIR_UNEXPECTED_OCCURRENCES: %',
      v_occurrences;
  end if;

  v_repaired_definition := pg_catalog.replace(
    v_definition,
    'pg_catalog.coalesce',
    'coalesce'
  );
  execute v_repaired_definition;

  select pg_catalog.pg_get_functiondef(v_function_oid)
  into v_definition;
  if pg_catalog.strpos(
    v_definition,
    'pg_catalog.coalesce'
  ) <> 0 then
    raise exception 'AGENT_TERMINAL_COALESCE_REPAIR_FAILED';
  end if;
end;
$migration$;

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

commit;
