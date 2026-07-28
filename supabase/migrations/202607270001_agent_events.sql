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
        'partner_connected',
        'agent_key_created',
        'agent_call_completed',
        'agent_call_failed',
        'share_card_generated'
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
        'agent',
        'share',
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
      or
      (p_name = 'agent_key_created' and v_key = 'outcome')
      or
      (p_name = 'agent_call_completed'
        and v_key in ('outcome', 'credits', 'model'))
      or
      (p_name = 'agent_call_failed'
        and v_key in ('outcome', 'model'))
      or
      (p_name = 'share_card_generated'
        and v_key in ('outcome', 'taskType'))
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
      when 'model' then
        if pg_catalog.jsonb_typeof(v_value) <> 'string'
          or (v_value #>> '{}') <> all (
            array[
              'balanced',
              'fast',
              'coding',
              'reasoning'
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
