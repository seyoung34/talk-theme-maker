set lock_timeout = '5s';
alter table public.export_jobs
  add column system_template_bundle_id uuid,
  add column system_template_variant_id uuid;
reset lock_timeout;
comment on column public.export_jobs.system_template_bundle_id is 'Untrusted client analytics attribution; never used for billing or authorization. No historical backfill.';
comment on column public.export_jobs.system_template_variant_id is 'Platform variant analytics attribution; nullable, no foreign key or entitlement meaning.';

-- Keep the old RPC and signature intact for in-flight requests from older Workers.
-- Both reservation and attribution execute in the same transaction; builder contracts are unchanged.
create function public.reserve_export_credit_with_template(
  p_user_id uuid,
  p_platform text,
  p_export_mode text,
  p_input_file_count integer,
  p_input_bytes bigint,
  p_referenced_asset_bytes bigint default 0,
  p_referenced_asset_file_count integer default 0,
  p_system_template_bundle_id text default null,
  p_system_template_variant_id text default null
)
returns table (export_job_id uuid, balance integer)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  reserved record;
  bundle_id uuid;
  variant_id uuid;
begin
  if length(p_system_template_bundle_id) = 36 and p_system_template_bundle_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    bundle_id := p_system_template_bundle_id::uuid;
    if length(p_system_template_variant_id) = 36 and p_system_template_variant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      variant_id := p_system_template_variant_id::uuid;
    end if;
  end if;
  select * into strict reserved from public.reserve_export_credit(
    p_user_id, p_platform, p_export_mode, p_input_file_count, p_input_bytes,
    p_referenced_asset_bytes, p_referenced_asset_file_count
  );
  update public.export_jobs set system_template_bundle_id = bundle_id, system_template_variant_id = variant_id
    where id = reserved.export_job_id and user_id = p_user_id;
  return query select reserved.export_job_id::uuid, reserved.balance::integer;
end;
$$;
revoke all on function public.reserve_export_credit_with_template(uuid, text, text, integer, bigint, bigint, integer, text, text) from public, anon, authenticated;
grant execute on function public.reserve_export_credit_with_template(uuid, text, text, integer, bigint, bigint, integer, text, text) to service_role;
