-- Scan-first guest wallets use Supabase anonymous users. Those users still
-- carry the authenticated database role, so all existing wallet/task RLS
-- policies continue to bind rows to auth.uid().
--
-- A share-card generation is a bounded product signal: at most one row and
-- one event per wallet. Existing duplicate legacy events are intentionally
-- untouched so this migration remains safe to apply.

create table public.share_card_generations (
  wallet_id uuid primary key
    references public.wallets(id) on delete cascade,
  user_id uuid not null unique
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.share_card_generations enable row level security;
alter table public.share_card_generations force row level security;

revoke all on table public.share_card_generations
from public, anon, authenticated;
grant all on table public.share_card_generations to service_role;

create or replace function public.record_share_card_generation(
  p_user_id uuid,
  p_wallet_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_clock timestamptz;
  v_inserted_wallet_id uuid;
  v_wallet public.wallets%rowtype;
begin
  if p_user_id is null or p_wallet_id is null then
    raise exception 'SHARE_CARD_SIGNAL_INVALID' using errcode = 'P0001';
  end if;

  select w.*
  into v_wallet
  from public.wallets as w
  where w.id = p_wallet_id
    and w.user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_clock := pg_catalog.clock_timestamp();
  if v_wallet.expires_at <= v_clock then
    raise exception 'WALLET_EXPIRED' using errcode = 'P0001';
  end if;

  insert into public.share_card_generations (
    wallet_id,
    user_id,
    created_at
  )
  values (
    v_wallet.id,
    v_wallet.user_id,
    v_clock
  )
  on conflict (wallet_id) do nothing
  returning wallet_id into v_inserted_wallet_id;

  if v_inserted_wallet_id is null then
    return false;
  end if;

  insert into public.events (
    user_id,
    name,
    source,
    metadata,
    created_at
  )
  values (
    v_wallet.user_id,
    'share_card_generated',
    'share',
    pg_catalog.jsonb_build_object('outcome', 'success'),
    v_clock
  );

  return true;
end;
$$;

revoke all on function public.record_share_card_generation(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.record_share_card_generation(uuid, uuid)
to service_role;
