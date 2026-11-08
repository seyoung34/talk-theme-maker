-- Observation is independent of reservation and settlement. A missing row means
-- unknown, never zero. Records follow the export job's retention and deletion.
create table public.export_catalog_observations (
  export_job_id uuid primary key references public.export_jobs(id) on delete cascade,
  has_unobserved_sources boolean not null,
  created_at timestamptz not null default now()
);
comment on column public.export_catalog_observations.has_unobserved_sources is 'At least one submitted manifest item is outside verified admin catalog coverage; false does not cover files already present in the builder base project.';
create table public.export_catalog_observation_assets (
  export_job_id uuid not null references public.export_catalog_observations(export_job_id) on delete cascade,
  asset_id uuid not null,
  primary key (export_job_id, asset_id)
);
alter table public.export_catalog_observations enable row level security;
alter table public.export_catalog_observation_assets enable row level security;
revoke all on public.export_catalog_observations, public.export_catalog_observation_assets from public, anon, authenticated;
grant select, insert on public.export_catalog_observations, public.export_catalog_observation_assets to service_role;

create function public.record_export_catalog_observation(p_job_id uuid, p_has_unobserved_sources boolean, p_asset_ids uuid[])
returns void language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if p_has_unobserved_sources is null or p_asset_ids is null or cardinality(p_asset_ids) > 300 or array_position(p_asset_ids, null) is not null then
    raise exception 'invalid_catalog_observation';
  end if;
  insert into public.export_catalog_observations(export_job_id, has_unobserved_sources)
    values (p_job_id, p_has_unobserved_sources) on conflict do nothing;
  if found then
    insert into public.export_catalog_observation_assets(export_job_id, asset_id)
      select p_job_id, asset_id from unnest(p_asset_ids) as asset_id on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.record_export_catalog_observation(uuid, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.record_export_catalog_observation(uuid, boolean, uuid[]) to service_role;

-- Aggregate in PostgreSQL rather than fetching potentially truncated rows through PostgREST.
create function public.admin_export_catalog_observation(p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare result jsonb;
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid_observation_period';
  end if;
  with jobs as materialized (
    select j.id, o.export_job_id is not null as observed, o.has_unobserved_sources
    from public.export_jobs j left join public.export_catalog_observations o on o.export_job_id = j.id
    where j.status = 'succeeded' and j.created_at >= p_start and j.created_at < p_end
  ), counts as (
    select a.asset_id, count(*) as job_count from jobs j
    join public.export_catalog_observation_assets a on a.export_job_id = j.id
    group by a.asset_id
  )
  select jsonb_build_object(
    'succeeded_jobs', count(*),
    'observed_jobs', count(*) filter (where observed),
    'unknown_jobs', count(*) filter (where not observed),
    'jobs_with_unobserved_manifest_sources', count(*) filter (where observed and has_unobserved_sources),
    'assets', coalesce((select jsonb_agg(jsonb_build_object('asset_id', asset_id, 'job_count', job_count) order by job_count desc, asset_id) from counts), '[]'::jsonb)
  ) into result from jobs;
  return result;
end;
$$;
revoke all on function public.admin_export_catalog_observation(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_export_catalog_observation(timestamptz, timestamptz) to service_role;
