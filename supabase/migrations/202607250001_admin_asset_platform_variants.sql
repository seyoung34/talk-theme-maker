create table if not exists public.admin_asset_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.admin_assets(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, platform)
);

create table if not exists public.admin_asset_bubble_designs (
  asset_id uuid primary key references public.admin_assets(id) on delete cascade,
  recipe jsonb not null,
  geometry_mode text not null default 'generated' check (geometry_mode in ('generated', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_asset_bubble_decorations (
  asset_id uuid not null references public.admin_assets(id) on delete cascade,
  layer_id text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (asset_id, layer_id)
);

create index if not exists admin_asset_variants_platform_lookup_idx
on public.admin_asset_variants (platform, asset_id);

drop trigger if exists touch_admin_asset_variants on public.admin_asset_variants;
create trigger touch_admin_asset_variants
before update on public.admin_asset_variants
for each row execute function public.touch_updated_at();

drop trigger if exists touch_admin_asset_bubble_designs on public.admin_asset_bubble_designs;
create trigger touch_admin_asset_bubble_designs
before update on public.admin_asset_bubble_designs
for each row execute function public.touch_updated_at();

drop trigger if exists touch_admin_asset_bubble_decorations on public.admin_asset_bubble_decorations;
create trigger touch_admin_asset_bubble_decorations
before update on public.admin_asset_bubble_decorations
for each row execute function public.touch_updated_at();

alter table public.admin_asset_variants enable row level security;
alter table public.admin_asset_bubble_designs enable row level security;
alter table public.admin_asset_bubble_decorations enable row level security;

grant select, insert, update, delete on public.admin_asset_variants to authenticated;
grant select, insert, update, delete on public.admin_asset_bubble_designs to authenticated;
grant select, insert, update, delete on public.admin_asset_bubble_decorations to authenticated;
grant select on public.admin_asset_variants to service_role;
grant select on public.admin_asset_bubble_designs to service_role;
grant select on public.admin_asset_bubble_decorations to service_role;

drop policy if exists "Admins manage admin asset variants" on public.admin_asset_variants;
create policy "Admins manage admin asset variants"
on public.admin_asset_variants
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage admin asset bubble designs" on public.admin_asset_bubble_designs;
create policy "Admins manage admin asset bubble designs"
on public.admin_asset_bubble_designs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage admin asset bubble decorations" on public.admin_asset_bubble_decorations;
create policy "Admins manage admin asset bubble decorations"
on public.admin_asset_bubble_decorations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
