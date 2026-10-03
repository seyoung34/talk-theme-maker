-- Local only: docker exec -i supabase_db_kakaotalk-theme-maker psql -U postgres -v ON_ERROR_STOP=1 < this file
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'diagnostics-fixture@local.invalid');
insert into auth.users (id, email) select md5('diagnostics-fixture-' || n)::uuid, 'fixture-' || n || '@local.invalid' from generate_series(1,1202) n;
insert into public.export_jobs (user_id, platform, export_mode, status, stage, created_at, duration_ms, error_code, referenced_asset_file_count, export_backend, export_number)
select md5('diagnostics-fixture-' || n)::uuid, 'android', 'apk',
  case when n <= 900 then 'succeeded' when n <= 1100 then 'failed' else 'pending' end,
  case when n <= 900 then 'completed' when n <= 1100 then 'failed' else 'queued' end,
  '2026-10-01T00:00:00Z'::timestamptz,
  case when n <= 1000 then n else null end,
  case when n between 901 and 950 or n between 1051 and 1075 then 'build_cancelled'
    when n <= 1000 then 'build_failed' when n = 1100 then null else 'private email@example.com' end,
  case when n <= 1000 then 1 else 0 end, 'cloud_run', n
from generate_series(1,1200) n;
insert into public.export_jobs (user_id, platform, export_mode, status, stage, created_at, duration_ms, export_number)
values
 ('00000000-0000-0000-0000-000000000001', 'ios', 'ktheme', 'succeeded', 'completed', '2026-10-01T00:00:00Z', 300, 1),
 ('00000000-0000-0000-0000-000000000001', 'ios', 'ktheme', 'failed', 'failed', '2026-10-02T00:00:00Z', null, 2),
 ('00000000-0000-0000-0000-000000000001', 'ios', 'ktheme', 'pending', 'queued', '2026-09-01T00:00:00Z', null, 3);
do $$
declare d jsonb; s jsonb;
begin
  d := public.admin_export_diagnostics('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z');
  s := d->'summary'->0;
  if (s->>'total')::int <> 1200 or (s->>'succeeded')::int <> 900
    or (s->>'failed')::int <> 125 or (s->>'cancelled')::int <> 75 or (s->>'pending')::int <> 100
    or (s->>'duration_count')::int <> 1000 or (s->>'duration_null_count')::int <> 200
    or (s->>'p50')::numeric <> 500.5 or abs((s->>'p95')::numeric - 950.05) > 0.00001 then raise exception 'summary mismatch: %', s; end if;
  if (d->'summary'->1->>'total')::int <> 1 then raise exception 'period boundary mismatch'; end if;
  if (s->>'succeeded')::numeric / ((s->>'total')::int - (s->>'cancelled')::int) <> 0.8 then raise exception 'success denominator mismatch'; end if;
  if jsonb_array_length(d->'recent') <> 20 then raise exception 'recent limit mismatch'; end if;
  if (d->'catalog'->0->>'total')::int <> 1000 or (d->'catalog'->0->>'failed')::int <> 50 or (d->'catalog'->0->>'cancelled')::int <> 50
    or (d->'catalog'->1->>'failed')::int <> 75 or (d->'catalog'->1->>'cancelled')::int <> 25 then raise exception 'catalog mismatch'; end if;
  if round((d->'catalog'->0->>'failed')::numeric / ((d->'catalog'->0->>'total')::int - (d->'catalog'->0->>'cancelled')::int) * 100, 1) <> 5.3 then raise exception 'catalog rate mismatch'; end if;
  if (d->'failures'->0->>'count')::int <> 75 or (d->'failures'->0->>'error_code') <> 'unknown'
    or (d->'failures'->1->>'count')::int <> 50 or jsonb_array_length(d->'failures') <> 2 then raise exception 'unsafe error grouping mismatch: %', d->'failures'; end if;
  if exists (select 1 from jsonb_array_elements(d->'recent') r where r->>'error_code' = 'build_cancelled') then raise exception 'recent contains cancellations'; end if;
  d := public.admin_export_diagnostics('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', 'ios', 'worker');
  if (d->'summary'->0->>'total')::int <> 1 or (d->>'stale_count')::int <> 1 then raise exception 'filter / old pending mismatch: %', d; end if;
  -- Same outer statement clock: exactly 15 minutes must be excluded; 15m+1s included.
  insert into public.export_jobs (user_id, platform, export_mode, export_number, status, created_at)
  values
    (md5('diagnostics-fixture-1201')::uuid, 'ios', 'ktheme', 1, 'pending', statement_timestamp() - interval '15 minutes'),
    (md5('diagnostics-fixture-1202')::uuid, 'ios', 'ktheme', 1, 'pending', statement_timestamp() - interval '15 minutes 1 second');
  d := public.admin_export_diagnostics('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', 'ios', 'worker');
  if (d->>'stale_count')::int <> 2 then raise exception '15-minute boundary mismatch'; end if;
  d := public.admin_export_diagnostics(now() - interval '1 day', now(), 'ios', 'cloud_run');
  if d->'summary' <> '[]'::jsonb then raise exception 'empty period mismatch'; end if;
  if has_function_privilege('anon', 'public.admin_export_diagnostics(timestamptz,timestamptz,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.admin_export_diagnostics(timestamptz,timestamptz,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.admin_export_diagnostics(timestamptz,timestamptz,text,text)', 'execute') then raise exception 'RPC grants mismatch'; end if;
end $$;
-- Add historical volume so the planner can choose the period index naturally (no enable_seqscan override).
insert into public.export_jobs (user_id, platform, export_mode, status, created_at, export_number)
select '00000000-0000-0000-0000-000000000001', 'android', 'apk', 'succeeded', '2025-01-01'::timestamptz + n * interval '1 minute', 1200 + n
from generate_series(1,20000) n;
analyze public.export_jobs;
explain (analyze, buffers) select count(*) from public.export_jobs where created_at >= '2026-10-01'::timestamptz and created_at < '2026-10-02'::timestamptz;
rollback;
