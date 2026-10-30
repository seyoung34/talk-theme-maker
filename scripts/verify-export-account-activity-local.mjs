import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// The query is identical except for test-only temporary table names and typed dates.
const source = readFileSync(new URL('./export-account-activity.sql', import.meta.url), 'utf8');
function query(end) {
  return source.replace('null::date as requested_end_date', `${end} as requested_end_date`)
    .replaceAll('public.export_jobs', 'pg_temp.export_jobs')
    .replaceAll('public.admin_profiles', 'pg_temp.admin_profiles');
}

const sql = `
begin;
create temporary table export_jobs (user_id text not null, created_at timestamptz not null, status text not null);
create temporary table admin_profiles (user_id text not null);
insert into admin_profiles values ('1');
insert into export_jobs select n::text, '2026-09-03 15:00:00+00',
  case n % 3 when 0 then 'pending' when 1 then 'failed' else 'succeeded' end
  from generate_series(1, 2300) n;
insert into export_jobs values
  ('2', '2026-09-04 00:00:00+00', 'failed'),
  ('2', '2026-10-03 14:59:59+00', 'pending'),
  ('3001', '2026-10-03 14:59:59+00', 'succeeded'),
  ('1', '2026-10-03 14:59:59+00', 'failed'),
  ('outside-start', '2026-09-03 14:59:59+00', 'pending'),
  ('outside-end', '2026-10-03 15:00:00+00', 'pending');
create temporary table result as ${query("date '2026-10-03'")}
do $$ declare r record; begin
  select * into strict r from result;
  if r.validation_error is not null or r.start_date <> date '2026-09-04' or r.end_date <> date '2026-10-03'
     or r.window_days <> 30 or r.partial_end_day or r.window_distinct_accounts <> 2300
     or r.end_day_accounts <> 2 or r.end_day_to_window_ratio <> 2::numeric / 2300
     or jsonb_array_length(r.daily_accounts) <> 30
     or (r.daily_accounts->0->>'accounts')::int <> 2299
     or (r.daily_accounts->1->>'accounts')::int <> 0
     or (r.daily_accounts->29->>'accounts')::int <> 2 then
    raise exception 'populated fixture mismatch: %', row_to_json(r);
  end if;
end $$;
truncate export_jobs;
create temporary table empty_result as ${query("date '2026-10-03'")}
do $$ declare r record; begin
  select * into strict r from empty_result;
  if r.window_distinct_accounts <> 0 or r.end_day_accounts <> 0 or r.end_day_to_window_ratio is not null
     or jsonb_array_length(r.daily_accounts) <> 30 then raise exception 'empty fixture mismatch'; end if;
end $$;
create temporary table today_result as ${query("(statement_timestamp() at time zone 'Asia/Seoul')::date")}
do $$ begin
  if not (select partial_end_day from today_result) then raise exception 'today must be partial'; end if;
end $$;
create temporary table default_result as ${query('null::date')}
do $$ begin
  if not (select end_date = (statement_timestamp() at time zone 'Asia/Seoul')::date - 1
          and not partial_end_day from default_result) then raise exception 'default must end yesterday'; end if;
end $$;
create temporary table future_result as ${query("(statement_timestamp() at time zone 'Asia/Seoul')::date + 1")}
do $$ begin
  if not (select validation_error is not null and window_distinct_accounts is null and daily_accounts is null from future_result)
    then raise exception 'future date must be rejected'; end if;
end $$;
rollback;
`;
const result = spawnSync('docker', ['exec', '-i', 'supabase_db_kakaotalk-theme-maker', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql, encoding: 'utf8' });
if (result.error || result.status !== 0) {
  console.error(result.error ?? result.stderr);
  process.exit(1);
}
const invalid = spawnSync('docker', ['exec', '-i', 'supabase_db_kakaotalk-theme-maker', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
  input: "select date '2026-02-30';", encoding: 'utf8',
});
if (invalid.error || invalid.status === 0 || !invalid.stderr.includes('date/time field value out of range')) {
  console.error('Invalid date was not rejected as expected:', invalid.error ?? invalid.stderr);
  process.exit(1);
}
console.log('PostgreSQL fixtures passed: 2300 accounts, boundaries, duplicates, admins, empty, default, today, future and invalid date; rolled back.');
