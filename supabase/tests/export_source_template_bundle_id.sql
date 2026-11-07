begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000003', 'source-attribution-fixture@local.invalid');
update public.credit_balances set balance = 10 where user_id = '00000000-0000-0000-0000-000000000003';
do $$
declare
  r record;
  job public.export_jobs;
  fn text := 'public.reserve_export_credit_with_template_source(uuid,text,text,integer,bigint,bigint,integer,text,text,text)';
begin
  -- 1. derived origin only (My templates): source recorded, direct columns null, one credit reserved
  select * into r from public.reserve_export_credit_with_template_source('00000000-0000-0000-0000-000000000003', 'android', 'apk', 1, 10, 0, 0,
    null, null, 'ABCDEF01-2345-6789-ABCD-EF0123456789');
  select * into job from public.export_jobs where id = r.export_job_id;
  if job.source_system_template_bundle_id::text is distinct from 'abcdef01-2345-6789-abcd-ef0123456789'
    or job.system_template_bundle_id is not null or job.system_template_variant_id is not null or r.balance is distinct from 9 then
    raise exception 'derived origin mismatch'; end if;
  perform public.cancel_export_job('00000000-0000-0000-0000-000000000003', r.export_job_id, 1);

  -- 2. direct use + derived origin: the two are never stored together
  select * into r from public.reserve_export_credit_with_template_source('00000000-0000-0000-0000-000000000003', 'ios', 'ktheme', 1, 10, 0, 0,
    'abcdef03-2345-6789-abcd-ef0123456789', 'abcdef02-2345-6789-abcd-ef0123456789', 'abcdef01-2345-6789-abcd-ef0123456789');
  select * into job from public.export_jobs where id = r.export_job_id;
  if job.system_template_bundle_id::text is distinct from 'abcdef03-2345-6789-abcd-ef0123456789' or job.source_system_template_bundle_id is not null then
    raise exception 'direct use must not store a derived origin'; end if;
  perform public.cancel_export_job('00000000-0000-0000-0000-000000000003', r.export_job_id, 1);

  -- 3. malformed origin: null, reservation still succeeds
  select * into r from public.reserve_export_credit_with_template_source('00000000-0000-0000-0000-000000000003', 'ios', 'ktheme', 1, 10, 0, 0,
    null, null, 'pastel-glass');
  select * into job from public.export_jobs where id = r.export_job_id;
  if job.source_system_template_bundle_id is not null or r.balance is distinct from 9 then raise exception 'malformed origin must be null'; end if;
  perform public.cancel_export_job('00000000-0000-0000-0000-000000000003', r.export_job_id, 1);

  -- 4. existing RPCs keep working and never write the new column (no backfill, null = unknown)
  select * into r from public.reserve_export_credit_with_template('00000000-0000-0000-0000-000000000003', 'ios', 'ktheme', 1, 10, 0, 0, null, null);
  select * into job from public.export_jobs where id = r.export_job_id;
  if job.source_system_template_bundle_id is not null then raise exception 'existing RPC wrote the new column'; end if;
  perform public.cancel_export_job('00000000-0000-0000-0000-000000000003', r.export_job_id, 1);
  select * into r from public.reserve_export_credit('00000000-0000-0000-0000-000000000003', 'ios', 'ktheme', 1, 10);
  select * into job from public.export_jobs where id = r.export_job_id;
  if job.source_system_template_bundle_id is not null then raise exception 'legacy RPC wrote the new column'; end if;
  perform public.cancel_export_job('00000000-0000-0000-0000-000000000003', r.export_job_id, 1);

  -- 5. grants: service_role only
  if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute')
    or not has_function_privilege('service_role', fn, 'execute') then raise exception 'RPC grants mismatch'; end if;
end $$;

-- 6. if recording the origin fails, the reservation made by the same call rolls back with it
create function public.fail_source_origin_update() returns trigger language plpgsql as $f$
begin raise exception 'forced_source_update_failure'; end;
$f$;
create trigger fail_source_origin_update before update of source_system_template_bundle_id on public.export_jobs
  for each row execute function public.fail_source_origin_update();
do $$
declare
  jobs_before bigint;
  balance_before integer;
  ledger_before bigint;
begin
  select count(*) into jobs_before from public.export_jobs where user_id = '00000000-0000-0000-0000-000000000003';
  select balance into balance_before from public.credit_balances where user_id = '00000000-0000-0000-0000-000000000003';
  select count(*) into ledger_before from public.credit_ledger where user_id = '00000000-0000-0000-0000-000000000003';
  begin
    perform public.reserve_export_credit_with_template_source('00000000-0000-0000-0000-000000000003', 'android', 'apk', 1, 10, 0, 0,
      null, null, 'abcdef01-2345-6789-abcd-ef0123456789');
    raise exception 'origin update failure was swallowed';
  exception when others then
    if sqlerrm is distinct from 'forced_source_update_failure' then raise; end if;
  end;
  if (select count(*) from public.export_jobs where user_id = '00000000-0000-0000-0000-000000000003') is distinct from jobs_before
    or (select balance from public.credit_balances where user_id = '00000000-0000-0000-0000-000000000003') is distinct from balance_before
    or (select count(*) from public.credit_ledger where user_id = '00000000-0000-0000-0000-000000000003') is distinct from ledger_before then
    raise exception 'failed origin update left a partial reservation';
  end if;
end $$;
rollback;
