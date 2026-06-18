create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.system_template_bundles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  visibility text not null default 'private' check (visibility in ('private', 'public', 'unlisted')),
  pricing_type text not null default 'free' check (pricing_type in ('free', 'paid', 'credit')),
  price_amount integer,
  credit_cost integer,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_template_variants (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.system_template_bundles(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  base_template_id text not null default 'basic',
  colors jsonb not null default '{}'::jsonb,
  candidate_selections jsonb not null default '{}'::jsonb,
  bubble_edits jsonb not null default '{"markers":{},"insets":{},"stretch":{}}'::jsonb,
  upload_refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bundle_id, platform)
);

create table if not exists public.admin_assets (
  id uuid primary key default gen_random_uuid(),
  slot_role text not null,
  platform text not null check (platform in ('android', 'ios', 'all')),
  asset_kind text check (asset_kind in ('background', 'icon', 'bubble', 'profile', 'launcher', 'passcode')),
  analysis jsonb,
  bubble_adjustment jsonb,
  title text not null,
  note text,
  tags text[] not null default '{}',
  file_name text not null,
  mime_type text not null,
  storage_path text not null unique,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_system_template_bundles on public.system_template_bundles;
create trigger touch_system_template_bundles
before update on public.system_template_bundles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_system_template_variants on public.system_template_variants;
create trigger touch_system_template_variants
before update on public.system_template_variants
for each row execute function public.touch_updated_at();

drop trigger if exists touch_admin_assets on public.admin_assets;
create trigger touch_admin_assets
before update on public.admin_assets
for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.admin_profiles enable row level security;
alter table public.system_template_bundles enable row level security;
alter table public.system_template_variants enable row level security;
alter table public.admin_assets enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.admin_profiles to authenticated;
grant select on public.system_template_bundles to anon, authenticated;
grant select on public.system_template_variants to anon, authenticated;
grant select, insert, update, delete on public.admin_profiles to authenticated;
grant select, insert, update, delete on public.system_template_bundles to authenticated;
grant select, insert, update, delete on public.system_template_variants to authenticated;
grant select, insert, update, delete on public.admin_assets to authenticated;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists "Admins manage admin profiles" on public.admin_profiles;
create policy "Admins manage admin profiles"
on public.admin_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users read own admin profile" on public.admin_profiles;
create policy "Users read own admin profile"
on public.admin_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Public reads published system template bundles" on public.system_template_bundles;
create policy "Public reads published system template bundles"
on public.system_template_bundles
for select
to anon, authenticated
using (status = 'published' and visibility = 'public');

drop policy if exists "Admins manage system template bundles" on public.system_template_bundles;
create policy "Admins manage system template bundles"
on public.system_template_bundles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public reads published system template variants" on public.system_template_variants;
create policy "Public reads published system template variants"
on public.system_template_variants
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.system_template_bundles bundles
    where bundles.id = system_template_variants.bundle_id
      and bundles.status = 'published'
      and bundles.visibility = 'public'
  )
);

drop policy if exists "Admins manage system template variants" on public.system_template_variants;
create policy "Admins manage system template variants"
on public.system_template_variants
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage admin assets" on public.admin_assets;
create policy "Admins manage admin assets"
on public.admin_assets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('theme-assets', 'theme-assets', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Admins manage theme asset objects" on storage.objects;
create policy "Admins manage theme asset objects"
on storage.objects
for all
to authenticated
using (bucket_id = 'theme-assets' and public.is_admin())
with check (bucket_id = 'theme-assets' and public.is_admin());
