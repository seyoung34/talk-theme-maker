create table if not exists public.admin_asset_targets (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.admin_assets(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios', 'all')),
  slot_role text,
  target_kind text not null default 'exact_role' check (target_kind in ('exact_role', 'asset_kind', 'shape_rule')),
  priority integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_asset_targets_kind_slot_role_check check (
    (target_kind = 'exact_role' and slot_role is not null)
    or (target_kind in ('asset_kind', 'shape_rule') and slot_role is null)
  )
);

create table if not exists public.admin_asset_bubble_specs (
  asset_id uuid primary key references public.admin_assets(id) on delete cascade,
  android_markers jsonb not null,
  ios_insets jsonb not null,
  ios_stretch jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_asset_bubble_specs_android_markers_object_check check (
    jsonb_typeof(android_markers) = 'object'
    and android_markers ? 'top'
    and android_markers ? 'left'
    and android_markers ? 'right'
    and android_markers ? 'bottom'
  ),
  constraint admin_asset_bubble_specs_ios_insets_object_check check (
    jsonb_typeof(ios_insets) = 'object'
    and ios_insets ? 'top'
    and ios_insets ? 'right'
    and ios_insets ? 'bottom'
    and ios_insets ? 'left'
  ),
  constraint admin_asset_bubble_specs_ios_stretch_object_check check (
    jsonb_typeof(ios_stretch) = 'object'
    and ios_stretch ? 'x'
    and ios_stretch ? 'y'
  )
);

drop trigger if exists touch_admin_asset_targets on public.admin_asset_targets;
create trigger touch_admin_asset_targets
before update on public.admin_asset_targets
for each row execute function public.touch_updated_at();

drop trigger if exists touch_admin_asset_bubble_specs on public.admin_asset_bubble_specs;
create trigger touch_admin_asset_bubble_specs
before update on public.admin_asset_bubble_specs
for each row execute function public.touch_updated_at();

create index if not exists admin_assets_canonical_listing_idx
on public.admin_assets (enabled, asset_kind, updated_at desc, id desc);

create index if not exists admin_asset_targets_lookup_idx
on public.admin_asset_targets (platform, slot_role, enabled, priority desc);

create index if not exists admin_asset_targets_asset_lookup_idx
on public.admin_asset_targets (asset_id, enabled);

create unique index if not exists admin_asset_targets_unique_target_idx
on public.admin_asset_targets (asset_id, platform, target_kind, coalesce(slot_role, ''));

alter table public.admin_asset_targets enable row level security;
alter table public.admin_asset_bubble_specs enable row level security;

grant select, insert, update, delete on public.admin_asset_targets to authenticated;
grant select, insert, update, delete on public.admin_asset_bubble_specs to authenticated;
grant select on table public.admin_asset_targets to service_role;
grant select on table public.admin_asset_bubble_specs to service_role;

drop policy if exists "Admins manage admin asset targets" on public.admin_asset_targets;
create policy "Admins manage admin asset targets"
on public.admin_asset_targets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage admin asset bubble specs" on public.admin_asset_bubble_specs;
create policy "Admins manage admin asset bubble specs"
on public.admin_asset_bubble_specs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.admin_asset_targets (
  asset_id,
  platform,
  slot_role,
  target_kind,
  priority,
  enabled
)
select
  assets.id,
  assets.platform,
  assets.slot_role,
  'exact_role',
  0,
  assets.enabled
from public.admin_assets assets
where not exists (
  select 1
  from public.admin_asset_targets targets
  where targets.asset_id = assets.id
    and targets.platform = assets.platform
    and targets.target_kind = 'exact_role'
    and targets.slot_role = assets.slot_role
);

insert into public.admin_asset_bubble_specs (
  asset_id,
  android_markers,
  ios_insets,
  ios_stretch
)
select
  assets.id,
  assets.bubble_adjustment -> 'markers',
  assets.bubble_adjustment -> 'insets',
  assets.bubble_adjustment -> 'stretch'
from public.admin_assets assets
where assets.asset_kind = 'bubble'
  and jsonb_typeof(assets.bubble_adjustment) = 'object'
  and jsonb_typeof(assets.bubble_adjustment -> 'markers') = 'object'
  and (assets.bubble_adjustment -> 'markers') ? 'top'
  and (assets.bubble_adjustment -> 'markers') ? 'left'
  and (assets.bubble_adjustment -> 'markers') ? 'right'
  and (assets.bubble_adjustment -> 'markers') ? 'bottom'
  and jsonb_typeof(assets.bubble_adjustment -> 'insets') = 'object'
  and (assets.bubble_adjustment -> 'insets') ? 'top'
  and (assets.bubble_adjustment -> 'insets') ? 'right'
  and (assets.bubble_adjustment -> 'insets') ? 'bottom'
  and (assets.bubble_adjustment -> 'insets') ? 'left'
  and jsonb_typeof(assets.bubble_adjustment -> 'stretch') = 'object'
  and (assets.bubble_adjustment -> 'stretch') ? 'x'
  and (assets.bubble_adjustment -> 'stretch') ? 'y'
on conflict (asset_id) do update set
  android_markers = excluded.android_markers,
  ios_insets = excluded.ios_insets,
  ios_stretch = excluded.ios_stretch,
  updated_at = now();
