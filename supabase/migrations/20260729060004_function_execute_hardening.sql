-- Keep internal authorization helpers out of the PostgREST-exposed public
-- schema and remove the function EXECUTE grants inherited from Supabase's
-- default privileges. Moving the existing functions preserves trigger and
-- row-level-security policy dependencies by object identity.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;

alter function public.handle_campaign_auth_user()
  set schema private;
alter function public.is_campaign_admin()
  set schema private;

revoke all on function private.handle_campaign_auth_user()
  from public, anon, authenticated, service_role;
revoke all on function private.is_campaign_admin()
  from public, anon, authenticated, service_role;

grant execute on function private.is_campaign_admin()
  to authenticated, service_role;
