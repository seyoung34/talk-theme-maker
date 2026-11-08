begin;
insert into auth.users(id, email) values ('00000000-0000-4000-8000-000000000001', 'catalog-fixture@local.invalid');
insert into public.export_jobs(id, user_id, platform, export_mode, status, created_at, export_number) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','android','apk','succeeded','2026-01-01',1),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','ios','ktheme','succeeded','2026-01-02',2),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','android','apk','failed','2026-01-03',3);
select public.record_export_catalog_observation('10000000-0000-4000-8000-000000000001', true,
  array['20000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000001'::uuid]);
select public.record_export_catalog_observation('10000000-0000-4000-8000-000000000001', false, '{}'::uuid[]);
select public.record_export_catalog_observation('10000000-0000-4000-8000-000000000003', false,
  array['20000000-0000-4000-8000-000000000001'::uuid]);
do $$
declare r jsonb;
begin
  r := public.admin_export_catalog_observation('2026-01-01','2026-02-01');
  if (r->>'succeeded_jobs')::int <> 2 or (r->>'observed_jobs')::int <> 1 or (r->>'unknown_jobs')::int <> 1
    or (r->>'jobs_with_unobserved_manifest_sources')::int <> 1 or (r->'assets'->0->>'job_count')::int <> 1 then
    raise exception 'incorrect observation aggregate: %', r;
  end if;
  if has_function_privilege('anon','public.record_export_catalog_observation(uuid,boolean,uuid[])','execute')
     or has_function_privilege('authenticated','public.admin_export_catalog_observation(timestamptz,timestamptz)','execute')
     or not has_function_privilege('service_role','public.record_export_catalog_observation(uuid,boolean,uuid[])','execute') then
    raise exception 'incorrect function grants';
  end if;
end $$;
delete from public.export_jobs where id = '10000000-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from public.export_catalog_observations where export_job_id = '10000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.export_catalog_observation_assets where export_job_id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'cascade failed';
  end if;
end $$;
rollback;
