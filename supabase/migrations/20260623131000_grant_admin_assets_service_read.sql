-- Server-only APIs use the service role to expose enabled recommendation metadata
-- without relaxing the admin-only RLS policies on the source table.
grant select on table public.admin_assets to service_role;
