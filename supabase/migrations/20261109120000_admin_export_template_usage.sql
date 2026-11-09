-- Read-only aggregate for the admin export page. Direct use (system_template_bundle_id) and
-- derived origin (source_system_template_bundle_id, "My templates") are counted separately and
-- never merged. Jobs with neither value are unrecorded: unknown, not "base template".
-- Both ids are untrusted client attribution, so each list is capped and reports its full size.
create function public.admin_export_template_usage(
  p_start timestamptz,
  p_end timestamptz,
  p_include_admins boolean default false
)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare result jsonb;
begin
  if p_start is null or p_end is null or p_start >= p_end or p_end - p_start > interval '31 days' then
    raise exception 'invalid_template_usage_period';
  end if;
  if p_include_admins is null then raise exception 'invalid_template_usage_filter'; end if;

  with jobs as materialized (
    select j.id, j.user_id, j.platform,
      case when j.system_template_bundle_id is not null then 'direct'
           when j.source_system_template_bundle_id is not null then 'derived'
           else 'unrecorded' end as kind,
      coalesce(j.system_template_bundle_id, j.source_system_template_bundle_id) as bundle_id
    from public.export_jobs j
    where j.status = 'succeeded' and j.created_at >= p_start and j.created_at < p_end
      and (p_include_admins or not exists (select 1 from public.admin_profiles a where a.user_id = j.user_id))
  ), grouped as (
    select kind, bundle_id, count(*) as jobs, count(distinct user_id) as accounts,
      count(*) filter (where platform = 'android') as android,
      count(*) filter (where platform = 'ios') as ios
    from jobs where kind <> 'unrecorded' group by kind, bundle_id
  ), ranked as (
    select g.*, b.title,
      row_number() over (partition by g.kind order by g.jobs desc, g.accounts desc, g.bundle_id) as position,
      count(*) over (partition by g.kind) as bundle_count
    from grouped g left join public.system_template_bundles b on b.id = g.bundle_id
  )
  select jsonb_build_object(
    'succeeded_jobs', (select count(*) from jobs),
    'direct_jobs', (select count(*) from jobs where kind = 'direct'),
    'derived_jobs', (select count(*) from jobs where kind = 'derived'),
    'unrecorded_jobs', (select count(*) from jobs where kind = 'unrecorded'),
    'include_admins', p_include_admins,
    'direct_bundle_count', coalesce((select max(bundle_count) from ranked where kind = 'direct'), 0),
    'derived_bundle_count', coalesce((select max(bundle_count) from ranked where kind = 'derived'), 0),
    'direct', coalesce((select jsonb_agg(jsonb_build_object('bundle_id', bundle_id, 'title', title, 'jobs', jobs, 'accounts', accounts, 'android', android, 'ios', ios) order by position)
      from ranked where kind = 'direct' and position <= 100), '[]'::jsonb),
    'derived', coalesce((select jsonb_agg(jsonb_build_object('bundle_id', bundle_id, 'title', title, 'jobs', jobs, 'accounts', accounts, 'android', android, 'ios', ios) order by position)
      from ranked where kind = 'derived' and position <= 100), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_export_template_usage(timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.admin_export_template_usage(timestamptz, timestamptz, boolean) to service_role;
