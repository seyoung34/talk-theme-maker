-- Allow PostgREST to embed a builder design's decoration layers directly.
-- Decorations are meaningful only while their one-to-one bubble design exists.
alter table public.admin_asset_bubble_decorations
  add constraint admin_asset_bubble_decorations_design_asset_id_fkey
  foreign key (asset_id)
  references public.admin_asset_bubble_designs(asset_id)
  on delete cascade;
