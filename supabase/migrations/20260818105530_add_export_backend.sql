-- Distinguish legacy Worker-generated iOS files from Cloud Run outputs so account
-- history does not offer a re-download link for old synchronous exports.
alter table public.export_jobs
add column if not exists export_backend text not null default 'worker';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_jobs_export_backend_check'
      and conrelid = 'public.export_jobs'::regclass
  ) then
    alter table public.export_jobs
    add constraint export_jobs_export_backend_check
    check (export_backend in ('worker', 'cloud_run'));
  end if;
end;
$$;

create index if not exists export_jobs_backend_idx
on public.export_jobs (export_backend, created_at desc);
