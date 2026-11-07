set lock_timeout = '5s';
alter table public.export_jobs
  add column source_system_template_bundle_id uuid;
reset lock_timeout;
comment on column public.export_jobs.source_system_template_bundle_id is 'Untrusted client analytics attribution: the system template bundle a "My templates" work started from. Mutually exclusive with system_template_bundle_id (direct use). Never used for billing or authorization. No historical backfill; null means unknown.';

-- Keep reserve_export_credit_with_template and reserve_export_credit intact for in-flight requests
-- from older Workers. This wrapper reserves through the existing function (same transaction) and then
-- records the derived origin. Direct use and derived origin are never both stored.
create function public.reserve_export_credit_with_template_source(
  p_user_id uuid,
  p_platform text,
  p_export_mode text,
  p_input_file_count integer,
  p_input_bytes bigint,
  p_referenced_asset_bytes bigint default 0,
  p_referenced_asset_file_count integer default 0,
  p_system_template_bundle_id text default null,
  p_system_template_variant_id text default null,
  p_source_system_template_bundle_id text default null
)
returns table (export_job_id uuid, balance integer)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  reserved record;
  source_id uuid;
  direct_id uuid;
begin
  select * into strict reserved from public.reserve_export_credit_with_template(
    p_user_id, p_platform, p_export_mode, p_input_file_count, p_input_bytes,
    p_referenced_asset_bytes, p_referenced_asset_file_count,
    p_system_template_bundle_id, p_system_template_variant_id
  );
  if length(p_source_system_template_bundle_id) = 36
    and p_source_system_template_bundle_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    source_id := p_source_system_template_bundle_id::uuid;
  end if;
  if source_id is not null then
    select j.system_template_bundle_id into direct_id
      from public.export_jobs j
      where j.id = reserved.export_job_id and j.user_id = p_user_id;
    -- A direct system template use already carries the origin in system_template_bundle_id.
    if direct_id is null then
      update public.export_jobs set source_system_template_bundle_id = source_id
        where id = reserved.export_job_id and user_id = p_user_id;
    end if;
  end if;
  return query select reserved.export_job_id::uuid, reserved.balance::integer;
end;
$$;
revoke all on function public.reserve_export_credit_with_template_source(uuid, text, text, integer, bigint, bigint, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_export_credit_with_template_source(uuid, text, text, integer, bigint, bigint, integer, text, text, text) to service_role;
