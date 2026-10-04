-- Short lock acquisition budget: fail and retry rather than waiting behind live writes.
set lock_timeout = '5s';
create index if not exists export_jobs_created_at_idx on public.export_jobs (created_at);
reset lock_timeout;

create function public.admin_export_diagnostics(
  p_start timestamptz,
  p_end timestamptz,
  p_platform text default null,
  p_backend text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare result jsonb;
begin
  if p_start is null or p_end is null or p_start >= p_end
    or p_end - p_start > interval '31 days' then raise exception 'invalid_diagnostics_period'; end if;
  if p_platform is not null and p_platform not in ('android', 'ios') then raise exception 'invalid_platform'; end if;
  if p_backend is not null and p_backend not in ('worker', 'cloud_run', 'unknown') then raise exception 'invalid_backend'; end if;

  with jobs as materialized (
    select id, platform, status, stage, created_at, duration_ms,
      coalesce(export_backend, 'unknown') as backend,
      referenced_asset_file_count > 0 as catalog,
      case when length(error_code) between 1 and 64 and error_code ~ '^[a-z0-9_.-]+$'
        then error_code else 'unknown' end as error_code
    from public.export_jobs
    where created_at >= p_start and created_at < p_end
      and (p_platform is null or platform = p_platform)
      and (p_backend is null or coalesce(export_backend, 'unknown') = p_backend)
  ), summary as (
    select platform, count(*) as total,
      count(*) filter (where status = 'succeeded') as succeeded,
      count(*) filter (where status = 'failed' and error_code <> 'build_cancelled') as failed,
      count(*) filter (where status = 'failed' and error_code = 'build_cancelled') as cancelled,
      count(*) filter (where status = 'pending') as pending,
      count(duration_ms) as duration_count,
      count(*) filter (where duration_ms is null) as duration_null_count,
      percentile_cont(0.5) within group (order by duration_ms) as p50,
      percentile_cont(0.95) within group (order by duration_ms) as p95
    from jobs group by platform
  ), failures as (
    select platform, backend, stage, error_code, count(*) as count
    from jobs where status = 'failed' and error_code <> 'build_cancelled' group by platform, backend, stage, error_code
  ), comparison as (
    select catalog, count(*) as total,
      count(*) filter (where status = 'failed' and error_code <> 'build_cancelled') as failed,
      count(*) filter (where status = 'failed' and error_code = 'build_cancelled') as cancelled
    from jobs group by catalog
  ), recent as (
    select id, platform, backend, stage, error_code, created_at
    from jobs where status = 'failed' and error_code <> 'build_cancelled' order by created_at desc, id desc limit 20
  ), stale as (
    -- Operational queue is independent of the selected period; old pending jobs must remain visible.
    select id, platform, coalesce(export_backend, 'unknown') as backend, stage, created_at
    from public.export_jobs
    where status = 'pending' and created_at < statement_timestamp() - interval '15 minutes'
      and (p_platform is null or platform = p_platform)
      and (p_backend is null or coalesce(export_backend, 'unknown') = p_backend)
    order by created_at, id limit 100
  )
  select jsonb_build_object(
    'summary', coalesce((select jsonb_agg(to_jsonb(s) order by platform) from summary s), '[]'::jsonb),
    'failures', coalesce((select jsonb_agg(to_jsonb(f) order by count desc, platform, backend, stage, error_code) from failures f), '[]'::jsonb),
    'catalog', coalesce((select jsonb_agg(to_jsonb(c) order by catalog desc) from comparison c), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc, id desc) from recent r), '[]'::jsonb),
    'stale', coalesce((select jsonb_agg(to_jsonb(s) order by created_at, id) from stale s), '[]'::jsonb),
    'stale_count', (select count(*) from public.export_jobs where status = 'pending'
      and created_at < statement_timestamp() - interval '15 minutes'
      and (p_platform is null or platform = p_platform)
      and (p_backend is null or coalesce(export_backend, 'unknown') = p_backend))
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_export_diagnostics(timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.admin_export_diagnostics(timestamptz, timestamptz, text, text) to service_role;
