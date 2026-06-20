create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name, avatar_url, provider)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    coalesce(new.raw_app_meta_data->>'provider', 'email')
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    provider = excluded.provider;

  insert into public.credit_balances (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.profiles (user_id, email, display_name, avatar_url, provider)
select
  id,
  coalesce(email, ''),
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
  coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture'),
  coalesce(raw_app_meta_data->>'provider', 'email')
from auth.users
on conflict (user_id) do update
set
  email = excluded.email,
  display_name = coalesce(public.profiles.display_name, excluded.display_name),
  avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
  provider = excluded.provider;

insert into public.credit_balances (user_id, balance)
select id, 0
from auth.users
on conflict (user_id) do nothing;

grant select, insert, update on public.profiles to service_role;
grant select, insert, update on public.credit_balances to service_role;
