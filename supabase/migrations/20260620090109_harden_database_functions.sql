alter function public.touch_updated_at()
set search_path = pg_catalog;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

revoke all on function public.complete_credit_purchase(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_credit_purchase(uuid, text) to service_role;

revoke all on function public.spend_export_credit(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.spend_export_credit(uuid, uuid, integer, text) to service_role;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin_internal()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin_internal() from public, anon;
grant execute on function private.is_admin_internal() to authenticated, service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = private, pg_catalog
as $$
  select private.is_admin_internal();
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
