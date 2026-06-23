create index if not exists admin_assets_listing_idx
on public.admin_assets (enabled, platform, asset_kind, updated_at desc, id desc);

create index if not exists admin_assets_slot_listing_idx
on public.admin_assets (slot_role, enabled, updated_at desc, id desc);

create index if not exists system_template_bundles_gallery_idx
on public.system_template_bundles (status, visibility, updated_at desc, id desc);

create index if not exists system_template_variants_listing_idx
on public.system_template_variants (updated_at desc, id desc);
