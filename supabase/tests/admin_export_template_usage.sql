-- Local only: docker exec -i supabase_db_kakaotalk-theme-maker psql -U postgres -v ON_ERROR_STOP=1 < this file
begin;
-- 21 and 22 are regular accounts, 23 is an admin account.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'usage-a@local.invalid'),
  ('00000000-0000-0000-0000-000000000022', 'usage-b@local.invalid'),
  ('00000000-0000-0000-0000-000000000023', 'usage-admin@local.invalid');
insert into public.admin_profiles (user_id, email, role) values ('00000000-0000-0000-0000-000000000023', 'usage-admin@local.invalid', 'admin');
insert into public.system_template_bundles (id, title) values ('abcdef01-2345-6789-abcd-ef0123456789', '파스텔 글라스');

insert into public.export_jobs (user_id, platform, export_mode, status, stage, created_at, export_number, system_template_bundle_id, source_system_template_bundle_id) values
  -- direct use of a known bundle: two accounts, three jobs (account 21 has an Android and an iOS job)
  ('00000000-0000-0000-0000-000000000021', 'android', 'apk',   'succeeded', 'completed', '2026-11-01T00:00:00Z', 1, 'abcdef01-2345-6789-abcd-ef0123456789', null),
  ('00000000-0000-0000-0000-000000000021', 'ios',     'ktheme','succeeded', 'completed', '2026-11-01T00:00:00Z', 1, 'abcdef01-2345-6789-abcd-ef0123456789', null),
  ('00000000-0000-0000-0000-000000000022', 'android', 'apk',   'succeeded', 'completed', '2026-11-01T00:00:00Z', 1, 'abcdef01-2345-6789-abcd-ef0123456789', null),
  -- derived origin: one known bundle, one bundle that no longer exists (title must be null)
  ('00000000-0000-0000-0000-000000000021', 'android', 'apk',   'succeeded', 'completed', '2026-11-01T00:00:00Z', 2, null, 'abcdef01-2345-6789-abcd-ef0123456789'),
  ('00000000-0000-0000-0000-000000000022', 'android', 'apk',   'succeeded', 'completed', '2026-11-01T00:00:00Z', 2, null, 'abcdef09-2345-6789-abcd-ef0123456789'),
  -- unrecorded: neither value, must not be assumed to be the base template
  ('00000000-0000-0000-0000-000000000022', 'ios',     'ktheme','succeeded', 'completed', '2026-11-01T00:00:00Z', 2, null, null),
  -- both values set (should not happen): counted once, as direct
  ('00000000-0000-0000-0000-000000000021', 'android', 'apk',   'succeeded', 'completed', '2026-11-01T00:00:00Z', 3, 'abcdef01-2345-6789-abcd-ef0123456789', 'abcdef09-2345-6789-abcd-ef0123456789'),
  -- not succeeded: excluded
  ('00000000-0000-0000-0000-000000000021', 'android', 'apk',   'failed',    'failed',    '2026-11-01T00:00:00Z', 4, 'abcdef01-2345-6789-abcd-ef0123456789', null),
  -- outside the period: excluded (end is exclusive)
  ('00000000-0000-0000-0000-000000000021', 'android', 'apk',   'succeeded', 'completed', '2026-11-08T00:00:00Z', 5, 'abcdef01-2345-6789-abcd-ef0123456789', null),
  -- admin account: excluded unless requested
  ('00000000-0000-0000-0000-000000000023', 'android', 'apk',   'succeeded', 'completed', '2026-11-01T00:00:00Z', 1, 'abcdef01-2345-6789-abcd-ef0123456789', null);

do $$
declare d jsonb; row jsonb;
begin
  d := public.admin_export_template_usage('2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z');
  -- 3 direct + 1 more direct (both set) = 4, derived = 2, unrecorded = 1
  if (d->>'succeeded_jobs')::int is distinct from 7 or (d->>'direct_jobs')::int is distinct from 4
    or (d->>'derived_jobs')::int is distinct from 2 or (d->>'unrecorded_jobs')::int is distinct from 1
    or (d->>'direct_jobs')::int + (d->>'derived_jobs')::int + (d->>'unrecorded_jobs')::int is distinct from (d->>'succeeded_jobs')::int
    or (d->>'include_admins')::boolean is distinct from false then raise exception 'totals mismatch: %', d; end if;

  row := d->'direct'->0;
  if jsonb_array_length(d->'direct') is distinct from 1 or (d->>'direct_bundle_count')::int is distinct from 1
    or row->>'bundle_id' is distinct from 'abcdef01-2345-6789-abcd-ef0123456789' or row->>'title' is distinct from '파스텔 글라스'
    or (row->>'jobs')::int is distinct from 4 or (row->>'accounts')::int is distinct from 2
    or (row->>'android')::int is distinct from 3 or (row->>'ios')::int is distinct from 1 then raise exception 'direct mismatch: %', d->'direct'; end if;

  if jsonb_array_length(d->'derived') is distinct from 2 or (d->>'derived_bundle_count')::int is distinct from 2 then raise exception 'derived size mismatch: %', d->'derived'; end if;
  -- ties on jobs/accounts break by bundle_id: abcdef01 before abcdef09
  if d->'derived'->0->>'bundle_id' is distinct from 'abcdef01-2345-6789-abcd-ef0123456789' or d->'derived'->0->>'title' is distinct from '파스텔 글라스'
    or d->'derived'->1->>'bundle_id' is distinct from 'abcdef09-2345-6789-abcd-ef0123456789' or d->'derived'->1->'title' is distinct from 'null'::jsonb
    then raise exception 'derived rows mismatch: %', d->'derived'; end if;

  -- including admins adds exactly the admin job
  d := public.admin_export_template_usage('2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z', true);
  if (d->>'succeeded_jobs')::int is distinct from 8 or (d->>'direct_jobs')::int is distinct from 5
    or (d->'direct'->0->>'accounts')::int is distinct from 3 or (d->>'include_admins')::boolean is distinct from true then raise exception 'include_admins mismatch: %', d; end if;

  -- period end is exclusive, start is inclusive
  d := public.admin_export_template_usage('2026-11-08T00:00:00Z', '2026-11-09T00:00:00Z');
  if (d->>'succeeded_jobs')::int is distinct from 1 or (d->>'direct_jobs')::int is distinct from 1 then raise exception 'period boundary mismatch: %', d; end if;

  -- empty period is a successful empty aggregate, not an error
  d := public.admin_export_template_usage('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
  if (d->>'succeeded_jobs')::int is distinct from 0 or d->'direct' is distinct from '[]'::jsonb or d->'derived' is distinct from '[]'::jsonb
    or (d->>'direct_bundle_count')::int is distinct from 0 then raise exception 'empty period mismatch: %', d; end if;
end $$;

-- invalid input is rejected
do $$
begin
  begin perform public.admin_export_template_usage('2026-11-08T00:00:00Z', '2026-11-01T00:00:00Z'); raise exception 'reversed period accepted';
  exception when others then if sqlerrm is distinct from 'invalid_template_usage_period' then raise; end if; end;
  begin perform public.admin_export_template_usage('2026-10-01T00:00:00Z', '2026-11-08T00:00:00Z'); raise exception 'oversized period accepted';
  exception when others then if sqlerrm is distinct from 'invalid_template_usage_period' then raise; end if; end;
  begin perform public.admin_export_template_usage('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', null); raise exception 'null filter accepted';
  exception when others then if sqlerrm is distinct from 'invalid_template_usage_filter' then raise; end if; end;
end $$;

-- each list is capped at 100 rows but reports its full size
insert into public.export_jobs (user_id, platform, export_mode, status, stage, created_at, export_number, system_template_bundle_id)
select '00000000-0000-0000-0000-000000000022', 'android', 'apk', 'succeeded', 'completed', '2026-11-03T00:00:00Z', 100 + n,
  ('abcdef10-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
from generate_series(1, 120) n;
do $$
declare d jsonb;
begin
  d := public.admin_export_template_usage('2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z');
  if jsonb_array_length(d->'direct') is distinct from 100 or (d->>'direct_bundle_count')::int is distinct from 121
    or (d->>'direct_jobs')::int is distinct from 124 then raise exception 'cap mismatch: % / %', jsonb_array_length(d->'direct'), d->>'direct_bundle_count'; end if;
  -- the most used bundle stays first even when the list is truncated
  if d->'direct'->0->>'bundle_id' is distinct from 'abcdef01-2345-6789-abcd-ef0123456789' then raise exception 'ranking mismatch'; end if;
end $$;

-- grants: service_role only
do $$
declare fn constant text := 'public.admin_export_template_usage(timestamptz,timestamptz,boolean)';
begin
  if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute')
    or not has_function_privilege('service_role', fn, 'execute') then raise exception 'RPC grants mismatch'; end if;
end $$;
rollback;
