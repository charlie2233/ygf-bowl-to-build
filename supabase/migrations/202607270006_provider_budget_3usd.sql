-- Raise the shared per-wallet provider-cost ceiling from $0.25 to $3.00.
-- Existing migrations remain immutable. This upgrade fails closed if the
-- expected schema or function definitions have drifted.

begin;

do $migration$
declare
  v_actual integer;
  v_expected record;
begin
  for v_expected in
    select *
    from (
      values
        (
          'wallets'::text,
          'wallets_check1'::text,
          'wallets_provider_cost_cap_3usd_check'::text,
          'CHECK (((provider_committed_micro_usd + provider_reserved_micro_usd) <= 250000))'::text
        ),
        (
          'ledger_entries'::text,
          'ledger_entries_check1'::text,
          'ledger_entries_provider_cost_cap_3usd_check'::text,
          'CHECK (((provider_committed_after_micro_usd + provider_reserved_after_micro_usd) <= 250000))'::text
        ),
        (
          'task_executions'::text,
          'task_executions_provider_cost_ceiling_micro_usd_check'::text,
          'task_executions_provider_cost_cap_3usd_check'::text,
          'CHECK (((provider_cost_ceiling_micro_usd >= 0) AND (provider_cost_ceiling_micro_usd <= 250000)))'::text
        ),
        (
          'provider_policies'::text,
          'provider_policies_maximum_request_cost_micro_usd_check'::text,
          'provider_policies_request_cost_cap_3usd_check'::text,
          'CHECK (((maximum_request_cost_micro_usd >= 0) AND (maximum_request_cost_micro_usd <= 250000)))'::text
        ),
        (
          'agent_api_keys'::text,
          'agent_api_keys_provider_cost_limit_micro_usd_check'::text,
          'agent_api_keys_provider_cost_limit_3usd_check'::text,
          'CHECK (((provider_cost_limit_micro_usd >= 1) AND (provider_cost_limit_micro_usd <= 250000)))'::text
        ),
        (
          'agent_requests'::text,
          'agent_requests_provider_cost_ceiling_micro_usd_check'::text,
          'agent_requests_provider_cost_ceiling_3usd_check'::text,
          'CHECK (((provider_cost_ceiling_micro_usd >= 1) AND (provider_cost_ceiling_micro_usd <= 250000)))'::text
        ),
        (
          'agent_requests'::text,
          'agent_requests_provider_cost_micro_usd_check'::text,
          'agent_requests_provider_cost_actual_3usd_check'::text,
          'CHECK (((provider_cost_micro_usd IS NULL) OR ((provider_cost_micro_usd >= 0) AND (provider_cost_micro_usd <= 250000))))'::text
        ),
        (
          'agent_usage_entries'::text,
          'agent_usage_entries_provider_cost_micro_usd_check'::text,
          'agent_usage_entries_provider_cost_3usd_check'::text,
          'CHECK (((provider_cost_micro_usd >= 0) AND (provider_cost_micro_usd <= 250000)))'::text
        ),
        (
          'agent_usage_entries'::text,
          'agent_usage_entries_provider_committed_after_micro_usd_check'::text,
          'agent_usage_entries_committed_cost_3usd_check'::text,
          'CHECK (((provider_committed_after_micro_usd >= 0) AND (provider_committed_after_micro_usd <= 250000)))'::text
        ),
        (
          'agent_usage_entries'::text,
          'agent_usage_entries_provider_reserved_after_micro_usd_check'::text,
          'agent_usage_entries_reserved_cost_3usd_check'::text,
          'CHECK (((provider_reserved_after_micro_usd >= 0) AND (provider_reserved_after_micro_usd <= 250000)))'::text
        )
    ) as expected(
      table_name,
      constraint_name,
      replacement_constraint_name,
      definition
    )
  loop
    select pg_catalog.count(*)::integer
    into v_actual
    from pg_catalog.pg_constraint as c
    join pg_catalog.pg_class as t on t.oid = c.conrelid
    join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = v_expected.table_name
      and c.conname = v_expected.replacement_constraint_name;

    if v_actual <> 0 then
      raise exception
        'PROVIDER_BUDGET_TARGET_CONSTRAINT_PRESENT: %.%. found %',
        v_expected.table_name,
        v_expected.replacement_constraint_name,
        v_actual;
    end if;

    select pg_catalog.count(*)::integer
    into v_actual
    from pg_catalog.pg_constraint as c
    join pg_catalog.pg_class as t on t.oid = c.conrelid
    join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = v_expected.table_name
      and c.contype = 'c'
      and c.conname = v_expected.constraint_name
      and c.convalidated
      and pg_catalog.pg_get_constraintdef(c.oid)
        = v_expected.definition;

    if v_actual <> 1 then
      raise exception
        'PROVIDER_BUDGET_SCHEMA_DRIFT: %.%. expected exact validated constraint, found %',
        v_expected.table_name,
        v_expected.constraint_name,
        v_actual;
    end if;

    execute pg_catalog.format(
      'alter table public.%I drop constraint %I',
      v_expected.table_name,
      v_expected.constraint_name
    );
  end loop;
end;
$migration$;

alter table public.wallets
  add constraint wallets_provider_cost_cap_3usd_check
  check (
    provider_committed_micro_usd + provider_reserved_micro_usd
      <= 3000000
  );

alter table public.ledger_entries
  add constraint ledger_entries_provider_cost_cap_3usd_check
  check (
    provider_committed_after_micro_usd
      + provider_reserved_after_micro_usd <= 3000000
  );

alter table public.task_executions
  add constraint task_executions_provider_cost_cap_3usd_check
  check (provider_cost_ceiling_micro_usd between 0 and 3000000);

alter table public.provider_policies
  add constraint provider_policies_request_cost_cap_3usd_check
  check (maximum_request_cost_micro_usd between 0 and 3000000);

alter table public.agent_api_keys
  alter column provider_cost_limit_micro_usd set default 3000000;

update public.agent_api_keys
set provider_cost_limit_micro_usd = 3000000
where provider_cost_limit_micro_usd = 250000;

alter table public.agent_api_keys
  add constraint agent_api_keys_provider_cost_limit_3usd_check
  check (provider_cost_limit_micro_usd between 1 and 3000000);

alter table public.agent_requests
  add constraint agent_requests_provider_cost_ceiling_3usd_check
  check (provider_cost_ceiling_micro_usd between 1 and 3000000),
  add constraint agent_requests_provider_cost_actual_3usd_check
  check (
    provider_cost_micro_usd is null
    or provider_cost_micro_usd between 0 and 3000000
  );

alter table public.agent_usage_entries
  add constraint agent_usage_entries_provider_cost_3usd_check
  check (provider_cost_micro_usd between 0 and 3000000),
  add constraint agent_usage_entries_committed_cost_3usd_check
  check (
    provider_committed_after_micro_usd between 0 and 3000000
  ),
  add constraint agent_usage_entries_reserved_cost_3usd_check
  check (
    provider_reserved_after_micro_usd between 0 and 3000000
  );

do $migration$
declare
  v_acl pg_catalog.aclitem[];
  v_config text[];
  v_definition text;
  v_definition_hash text;
  v_expected record;
  v_new_acl pg_catalog.aclitem[];
  v_new_config text[];
  v_new_definition text;
  v_new_definition_hash text;
  v_new_oid oid;
  v_oid oid;
  v_replacement_count integer;
  v_security_definer boolean;
begin
  for v_expected in
    select *
    from (
      values
        (
          'public.reserve_campaign_spend(text,bigint)'::text,
          1,
          '21bd29b2d5a4ebde9fe9228419b0e4a59d8f74d4f223932d5a719720c00586ad'::text,
          '7ffcf34bf7724aa5b2385728386c81eff6a6b1b61775b12dce20a24000bd98a4'::text
        ),
        (
          'public.reserve_campaign_task_spend(uuid,uuid,timestamptz)'::text,
          1,
          '2a1fda81c95568546b20331c143e16364351f4025483b4979db3db875dd14721'::text,
          '0e8d8362cdd2cd754247d813bbf4f57d3e28bfa84f9b5a1e7c9953a1975e5379'::text
        ),
        (
          'public.begin_campaign_task_execution(uuid,text,text,text,text,bigint,uuid,timestamptz)'::text,
          1,
          'dc690db9a8ce06f4890e331cff68eaa6f40647d9611824db401bad6e7faf1271'::text,
          'a1496e578054c038a882d885ae06defbe983ae5ed3cb6f65620c41285c724ae3'::text
        ),
        (
          'public.terminalize_campaign_task_execution(uuid,uuid,uuid,text,jsonb,text,integer,integer,bigint,text,text,timestamptz)'::text,
          1,
          'f4b33610b018cb1c2c5384627f806e2ddc63749285344ebd996de1745d628bee'::text,
          '6a3116c764c5500db6f853bfc7665647da4d6eb8f6ffa72036afd958f6b9ef1c'::text
        ),
        (
          'public.begin_agent_request_unchecked(text,text,text,text,bigint,integer,uuid,timestamptz)'::text,
          2,
          'eaca06e6f87e2717f709146e08b469c42015cfc23931c15dc7ebb143e7e0dd51'::text,
          'd8c210e2bdc0c94cf16a1be813068cfd479f8dd7fb63fef84fc7a172d9fd31fe'::text
        ),
        (
          'public.terminalize_agent_request(uuid,uuid,text,jsonb,integer,integer,bigint,integer,text)'::text,
          1,
          '94ffa55037e8c3575d7021d507be8629b24a37f607b231a728a4c1e91c16de39'::text,
          'f471c37344176fb048abe5b2857ac8f4b248010edcf59c6fcdc6e8e45d83ac38'::text
        )
    ) as expected(
      function_signature,
      replacement_count,
      definition_sha256,
      replacement_definition_sha256
    )
  loop
    v_oid := pg_catalog.to_regprocedure(
      v_expected.function_signature
    );
    if v_oid is null then
      raise exception
        'PROVIDER_BUDGET_FUNCTION_MISSING: %',
        v_expected.function_signature;
    end if;

    select
      p.proacl,
      p.proconfig,
      p.prosecdef,
      pg_catalog.pg_get_functiondef(p.oid)
    into
      v_acl,
      v_config,
      v_security_definer,
      v_definition
    from pg_catalog.pg_proc as p
    where p.oid = v_oid;

    v_definition_hash := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(v_definition, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    if v_definition_hash <> v_expected.definition_sha256 then
      raise exception
        'PROVIDER_BUDGET_FUNCTION_DEFINITION_DRIFT: %. expected %, found %',
        v_expected.function_signature,
        v_expected.definition_sha256,
        v_definition_hash;
    end if;

    v_replacement_count :=
      (
        pg_catalog.length(v_definition)
          - pg_catalog.length(
            pg_catalog.replace(v_definition, '250000', '')
          )
      ) / pg_catalog.length('250000');
    if v_replacement_count <> v_expected.replacement_count then
      raise exception
        'PROVIDER_BUDGET_FUNCTION_DRIFT: %. expected %, found %',
        v_expected.function_signature,
        v_expected.replacement_count,
        v_replacement_count;
    end if;
    if not v_security_definer
      or v_config is null
      or not exists (
        select 1
        from pg_catalog.unnest(v_config) as setting
        where setting like 'search_path=%'
      ) then
      raise exception
        'PROVIDER_BUDGET_FUNCTION_SECURITY_DRIFT: %',
        v_expected.function_signature;
    end if;

    execute pg_catalog.replace(
      v_definition,
      '250000',
      '3000000'
    );

    v_new_oid := pg_catalog.to_regprocedure(
      v_expected.function_signature
    );
    select
      p.proacl,
      p.proconfig,
      pg_catalog.pg_get_functiondef(p.oid)
    into
      v_new_acl,
      v_new_config,
      v_new_definition
    from pg_catalog.pg_proc as p
    where p.oid = v_new_oid
      and p.prosecdef;

    v_new_definition_hash := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(v_new_definition, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    if not found
      or v_new_oid <> v_oid
      or v_new_acl is distinct from v_acl
      or v_new_config is distinct from v_config
      or v_new_definition_hash
        <> v_expected.replacement_definition_sha256
      or pg_catalog.strpos(v_new_definition, '250000') > 0
      or (
        (
          pg_catalog.length(v_new_definition)
            - pg_catalog.length(
              pg_catalog.replace(v_new_definition, '3000000', '')
            )
        ) / pg_catalog.length('3000000')
      ) <> v_expected.replacement_count then
      raise exception
        'PROVIDER_BUDGET_FUNCTION_REWRITE_FAILED: %',
        v_expected.function_signature;
    end if;
  end loop;
end;
$migration$;

do $migration$
declare
  v_actual integer;
  v_default text;
  v_expected record;
  v_stale integer;
begin
  for v_expected in
    select *
    from (
      values
        (
          'wallets'::text,
          'wallets_provider_cost_cap_3usd_check'::text,
          'CHECK (((provider_committed_micro_usd + provider_reserved_micro_usd) <= 3000000))'::text
        ),
        (
          'ledger_entries'::text,
          'ledger_entries_provider_cost_cap_3usd_check'::text,
          'CHECK (((provider_committed_after_micro_usd + provider_reserved_after_micro_usd) <= 3000000))'::text
        ),
        (
          'task_executions'::text,
          'task_executions_provider_cost_cap_3usd_check'::text,
          'CHECK (((provider_cost_ceiling_micro_usd >= 0) AND (provider_cost_ceiling_micro_usd <= 3000000)))'::text
        ),
        (
          'provider_policies'::text,
          'provider_policies_request_cost_cap_3usd_check'::text,
          'CHECK (((maximum_request_cost_micro_usd >= 0) AND (maximum_request_cost_micro_usd <= 3000000)))'::text
        ),
        (
          'agent_api_keys'::text,
          'agent_api_keys_provider_cost_limit_3usd_check'::text,
          'CHECK (((provider_cost_limit_micro_usd >= 1) AND (provider_cost_limit_micro_usd <= 3000000)))'::text
        ),
        (
          'agent_requests'::text,
          'agent_requests_provider_cost_ceiling_3usd_check'::text,
          'CHECK (((provider_cost_ceiling_micro_usd >= 1) AND (provider_cost_ceiling_micro_usd <= 3000000)))'::text
        ),
        (
          'agent_requests'::text,
          'agent_requests_provider_cost_actual_3usd_check'::text,
          'CHECK (((provider_cost_micro_usd IS NULL) OR ((provider_cost_micro_usd >= 0) AND (provider_cost_micro_usd <= 3000000))))'::text
        ),
        (
          'agent_usage_entries'::text,
          'agent_usage_entries_provider_cost_3usd_check'::text,
          'CHECK (((provider_cost_micro_usd >= 0) AND (provider_cost_micro_usd <= 3000000)))'::text
        ),
        (
          'agent_usage_entries'::text,
          'agent_usage_entries_committed_cost_3usd_check'::text,
          'CHECK (((provider_committed_after_micro_usd >= 0) AND (provider_committed_after_micro_usd <= 3000000)))'::text
        ),
        (
          'agent_usage_entries'::text,
          'agent_usage_entries_reserved_cost_3usd_check'::text,
          'CHECK (((provider_reserved_after_micro_usd >= 0) AND (provider_reserved_after_micro_usd <= 3000000)))'::text
        )
    ) as expected(table_name, constraint_name, definition)
  loop
    select pg_catalog.count(*)::integer
    into v_actual
    from pg_catalog.pg_constraint as c
    join pg_catalog.pg_class as t on t.oid = c.conrelid
    join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = v_expected.table_name
      and c.contype = 'c'
      and c.conname = v_expected.constraint_name
      and c.convalidated
      and pg_catalog.pg_get_constraintdef(c.oid)
        = v_expected.definition;

    if v_actual <> 1 then
      raise exception
        'PROVIDER_BUDGET_NEW_CONSTRAINT_INVALID: %.%. found %',
        v_expected.table_name,
        v_expected.constraint_name,
        v_actual;
    end if;
  end loop;

  select pg_catalog.count(*)::integer
  into v_stale
  from pg_catalog.pg_constraint as c
  join pg_catalog.pg_class as t on t.oid = c.conrelid
  join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and (
      (t.relname, c.conname) in (
        ('wallets', 'wallets_check1'),
        ('ledger_entries', 'ledger_entries_check1'),
        (
          'task_executions',
          'task_executions_provider_cost_ceiling_micro_usd_check'
        ),
        (
          'provider_policies',
          'provider_policies_maximum_request_cost_micro_usd_check'
        ),
        (
          'agent_api_keys',
          'agent_api_keys_provider_cost_limit_micro_usd_check'
        ),
        (
          'agent_requests',
          'agent_requests_provider_cost_ceiling_micro_usd_check'
        ),
        (
          'agent_requests',
          'agent_requests_provider_cost_micro_usd_check'
        ),
        (
          'agent_usage_entries',
          'agent_usage_entries_provider_cost_micro_usd_check'
        ),
        (
          'agent_usage_entries',
          'agent_usage_entries_provider_committed_after_micro_usd_check'
        ),
        (
          'agent_usage_entries',
          'agent_usage_entries_provider_reserved_after_micro_usd_check'
        )
      )
    );
  if v_stale <> 0 then
    raise exception
      'PROVIDER_BUDGET_SUPERSEDED_CONSTRAINTS_REMAIN: %',
      v_stale;
  end if;

  select pg_catalog.count(*)::integer
  into v_stale
  from pg_catalog.pg_constraint as c
  join pg_catalog.pg_class as t on t.oid = c.conrelid
  join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = any(
      array[
        'wallets',
        'ledger_entries',
        'task_executions',
        'provider_policies',
        'agent_api_keys',
        'agent_requests',
        'agent_usage_entries'
      ]
    )
    and c.contype = 'c'
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(c.oid),
      '250000'
    ) > 0;
  if v_stale <> 0 then
    raise exception 'PROVIDER_BUDGET_STALE_CHECKS: %', v_stale;
  end if;

  select pg_catalog.count(*)::integer
  into v_stale
  from pg_catalog.pg_attrdef as d
  join pg_catalog.pg_class as t on t.oid = d.adrelid
  join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
  join pg_catalog.pg_attribute as a
    on a.attrelid = t.oid
    and a.attnum = d.adnum
  where n.nspname = 'public'
    and t.relname = 'agent_api_keys'
    and a.attname = 'provider_cost_limit_micro_usd'
    and pg_catalog.strpos(
      pg_catalog.pg_get_expr(d.adbin, d.adrelid),
      '250000'
    ) > 0;
  if v_stale <> 0 then
    raise exception 'PROVIDER_BUDGET_STALE_DEFAULT';
  end if;

  select pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  into v_default
  from pg_catalog.pg_attrdef as d
  join pg_catalog.pg_class as t on t.oid = d.adrelid
  join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
  join pg_catalog.pg_attribute as a
    on a.attrelid = t.oid
    and a.attnum = d.adnum
  where n.nspname = 'public'
    and t.relname = 'agent_api_keys'
    and a.attname = 'provider_cost_limit_micro_usd';
  if not found or v_default <> '3000000' then
    raise exception
      'PROVIDER_BUDGET_DEFAULT_INVALID: %',
      pg_catalog.coalesce(v_default, '<missing>');
  end if;
end;
$migration$;

commit;
