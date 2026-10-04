begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000002', 'attribution-fixture@local.invalid');
update public.credit_balances set balance = 10 where user_id = '00000000-0000-0000-0000-000000000002';
do $$
declare r record; job public.export_jobs;
begin
  select * into r from public.reserve_export_credit_with_template('00000000-0000-0000-0000-000000000002', 'android', 'apk', 1, 10, 0, 0,
    'abcdef01-2345-6789-abcd-ef0123456789', 'abcdef02-2345-6789-abcd-ef0123456789');
  select * into job from public.export_jobs where id = r.export_job_id;
  if job.system_template_bundle_id::text <> 'abcdef01-2345-6789-abcd-ef0123456789'
    or job.system_template_variant_id::text <> 'abcdef02-2345-6789-abcd-ef0123456789' or r.balance <> 9 then raise exception 'valid attribution mismatch'; end if;
  perform public.cancel_export_job('00000000-0000-0000-0000-000000000002', r.export_job_id, 1);
  select * into r from public.reserve_export_credit_with_template('00000000-0000-0000-0000-000000000002', 'ios', 'ktheme', 1, 10, 0, 0, 'invalid', 'abcdef02-2345-6789-abcd-ef0123456789');
  select * into job from public.export_jobs where id = r.export_job_id;
  if job.system_template_bundle_id is not null or job.system_template_variant_id is not null then raise exception 'invalid attribution mismatch'; end if;
  perform public.cancel_export_job('00000000-0000-0000-0000-000000000002', r.export_job_id, 1);
  select * into r from public.reserve_export_credit('00000000-0000-0000-0000-000000000002', 'ios', 'ktheme', 1, 10);
  select * into job from public.export_jobs where id = r.export_job_id;
  if job.system_template_bundle_id is not null or job.system_template_variant_id is not null then raise exception 'legacy attribution mismatch'; end if;
  if has_function_privilege('anon', 'public.reserve_export_credit_with_template(uuid,text,text,integer,bigint,bigint,integer,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.reserve_export_credit_with_template(uuid,text,text,integer,bigint,bigint,integer,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.reserve_export_credit_with_template(uuid,text,text,integer,bigint,bigint,integer,text,text)', 'execute') then raise exception 'RPC grants mismatch'; end if;
end $$;
rollback;
