-- Export API routes use a server-only Supabase client. RLS bypass does not
-- replace the underlying table privileges required by PostgREST.
grant select, insert, update on table public.export_jobs to service_role;
