-- The catalog shadow publisher updates these legacy pointers only after the
-- GCS/R2 object has been verified and registered. Keep the source tables
-- admin-only while allowing the server-only publisher to complete the link.
grant update on table public.admin_assets to service_role;
grant update on table public.admin_asset_variants to service_role;
