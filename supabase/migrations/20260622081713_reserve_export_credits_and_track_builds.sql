alter table public.export_jobs
add column if not exists stage text not null default 'queued',
add column if not exists input_file_count integer not null default 0,
add column if not exists input_bytes bigint not null default 0,
add column if not exists output_bytes bigint,
add column if not exists duration_ms integer,
add column if not exists error_code text,
add column if not exists started_at timestamptz,
add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_jobs_stage_check'
      and conrelid = 'public.export_jobs'::regclass
  ) then
    alter table public.export_jobs
    add constraint export_jobs_stage_check
    check (stage in ('queued', 'preparing', 'building', 'packaging', 'finalizing', 'completed', 'failed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_jobs_input_file_count_check'
      and conrelid = 'public.export_jobs'::regclass
  ) then
    alter table public.export_jobs
    add constraint export_jobs_input_file_count_check
    check (input_file_count between 0 and 500);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_jobs_input_bytes_check'
      and conrelid = 'public.export_jobs'::regclass
  ) then
    alter table public.export_jobs
    add constraint export_jobs_input_bytes_check
    check (input_bytes between 0 and 52428800);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_jobs_output_bytes_check'
      and conrelid = 'public.export_jobs'::regclass
  ) then
    alter table public.export_jobs
    add constraint export_jobs_output_bytes_check
    check (output_bytes is null or output_bytes >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_jobs_duration_ms_check'
      and conrelid = 'public.export_jobs'::regclass
  ) then
    alter table public.export_jobs
    add constraint export_jobs_duration_ms_check
    check (duration_ms is null or duration_ms >= 0);
  end if;
end;
$$;

update public.export_jobs
set
  stage = case status
    when 'succeeded' then 'completed'
    when 'failed' then 'failed'
    else 'queued'
  end,
  started_at = coalesce(started_at, created_at),
  completed_at = case
    when status in ('succeeded', 'failed') then coalesce(completed_at, updated_at)
    else completed_at
  end;

create unique index if not exists export_jobs_one_pending_per_user_idx
on public.export_jobs (user_id)
where status = 'pending';

create index if not exists export_jobs_pending_created_idx
on public.export_jobs (created_at)
where status = 'pending';

create index if not exists export_jobs_user_created_idx
on public.export_jobs (user_id, created_at desc);

create index if not exists credit_ledger_export_job_idx
on public.credit_ledger (export_job_id)
where export_job_id is not null;

drop policy if exists "Users read own export jobs" on public.export_jobs;
create policy "Users read own export jobs"
on public.export_jobs
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.reserve_export_credit(
  p_user_id uuid,
  p_platform text,
  p_export_mode text,
  p_input_file_count integer,
  p_input_bytes bigint
)
returns table (export_job_id uuid, balance integer)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  current_balance integer;
  next_balance integer;
  new_job_id uuid;
  stale_refund integer := 0;
begin
  if p_user_id is null then raise exception 'invalid_user'; end if;
  if p_platform not in ('android', 'ios') then raise exception 'invalid_export_platform'; end if;
  if p_platform = 'android' and p_export_mode not in ('project', 'apk', 'apk-zip') then raise exception 'invalid_export_mode'; end if;
  if p_platform = 'ios' and p_export_mode not in ('theme-zip', 'ktheme') then raise exception 'invalid_export_mode'; end if;
  if p_input_file_count < 0 or p_input_file_count > 500 then raise exception 'invalid_export_file_count'; end if;
  if p_input_bytes < 0 or p_input_bytes > 52428800 then raise exception 'invalid_export_input_size'; end if;

  insert into public.credit_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select cb.balance into current_balance
  from public.credit_balances cb
  where cb.user_id = p_user_id
  for update;

  with stale_jobs as (
    update public.export_jobs
    set
      status = 'failed',
      stage = 'failed',
      error_code = 'export_reservation_expired',
      error = '중단된 내보내기 작업의 크레딧이 자동 복구되었습니다.',
      completed_at = now(),
      duration_ms = least(2147483647, greatest(0, floor(extract(epoch from (now() - created_at)) * 1000)))::integer
    where user_id = p_user_id
      and status = 'pending'
      and created_at < now() - interval '10 minutes'
    returning id, credit_cost
  ), refunded as (
    insert into public.credit_ledger (user_id, amount, type, reason, export_job_id)
    select p_user_id, credit_cost, 'export', 'export_reservation_expired_refund', id
    from stale_jobs
    returning amount
  )
  select coalesce(sum(amount), 0)::integer into stale_refund
  from refunded;

  if stale_refund > 0 then
    update public.credit_balances
    set balance = balance + stale_refund
    where user_id = p_user_id
    returning public.credit_balances.balance into current_balance;
  end if;

  if exists (
    select 1
    from public.export_jobs
    where user_id = p_user_id
      and status = 'pending'
  ) then
    raise exception 'export_already_in_progress';
  end if;

  if current_balance < 1 then raise exception 'insufficient_credits'; end if;

  insert into public.export_jobs (
    user_id,
    platform,
    export_mode,
    status,
    stage,
    credit_cost,
    input_file_count,
    input_bytes,
    started_at
  )
  values (
    p_user_id,
    p_platform,
    p_export_mode,
    'pending',
    'queued',
    1,
    p_input_file_count,
    p_input_bytes,
    now()
  )
  returning id into new_job_id;

  update public.credit_balances
  set balance = balance - 1
  where user_id = p_user_id
  returning public.credit_balances.balance into next_balance;

  insert into public.credit_ledger (user_id, amount, type, reason, export_job_id)
  values (p_user_id, -1, 'export', 'export_credit_reserved', new_job_id);

  return query select new_job_id, next_balance;
end;
$$;

create or replace function public.complete_export_job(
  p_user_id uuid,
  p_export_job_id uuid,
  p_file_name text,
  p_output_bytes bigint,
  p_duration_ms integer
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  job_row public.export_jobs%rowtype;
  current_balance integer;
begin
  select * into job_row
  from public.export_jobs
  where id = p_export_job_id
    and user_id = p_user_id
  for update;

  if not found then raise exception 'export_job_not_found'; end if;

  if job_row.status = 'succeeded' then
    select balance into current_balance from public.credit_balances where user_id = p_user_id;
    return coalesce(current_balance, 0);
  end if;

  if job_row.status <> 'pending' then raise exception 'export_job_not_pending'; end if;
  if p_output_bytes < 0 then raise exception 'invalid_export_output_size'; end if;
  if p_duration_ms < 0 then raise exception 'invalid_export_duration'; end if;

  update public.export_jobs
  set
    status = 'succeeded',
    stage = 'completed',
    file_name = left(p_file_name, 255),
    output_bytes = p_output_bytes,
    duration_ms = p_duration_ms,
    error = null,
    error_code = null,
    completed_at = now()
  where id = p_export_job_id;

  select balance into current_balance
  from public.credit_balances
  where user_id = p_user_id;

  return coalesce(current_balance, 0);
end;
$$;

create or replace function public.fail_export_job(
  p_user_id uuid,
  p_export_job_id uuid,
  p_error_code text,
  p_error_message text,
  p_duration_ms integer
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  job_row public.export_jobs%rowtype;
  next_balance integer;
begin
  select * into job_row
  from public.export_jobs
  where id = p_export_job_id
    and user_id = p_user_id
  for update;

  if not found then raise exception 'export_job_not_found'; end if;

  if job_row.status = 'failed' then
    select balance into next_balance from public.credit_balances where user_id = p_user_id;
    return coalesce(next_balance, 0);
  end if;

  if job_row.status <> 'pending' then raise exception 'export_job_not_pending'; end if;

  update public.export_jobs
  set
    status = 'failed',
    stage = 'failed',
    error_code = left(coalesce(nullif(p_error_code, ''), 'export_failed'), 80),
    error = left(coalesce(nullif(p_error_message, ''), '내보내기 작업에 실패했습니다.'), 500),
    duration_ms = greatest(0, p_duration_ms),
    completed_at = now()
  where id = p_export_job_id;

  update public.credit_balances
  set balance = balance + job_row.credit_cost
  where user_id = p_user_id
  returning public.credit_balances.balance into next_balance;

  insert into public.credit_ledger (user_id, amount, type, reason, export_job_id)
  values (p_user_id, job_row.credit_cost, 'export', 'export_credit_refund', p_export_job_id);

  return coalesce(next_balance, 0);
end;
$$;

revoke all on function public.reserve_export_credit(uuid, text, text, integer, bigint) from public, anon, authenticated;
revoke all on function public.complete_export_job(uuid, uuid, text, bigint, integer) from public, anon, authenticated;
revoke all on function public.fail_export_job(uuid, uuid, text, text, integer) from public, anon, authenticated;

grant execute on function public.reserve_export_credit(uuid, text, text, integer, bigint) to service_role;
grant execute on function public.complete_export_job(uuid, uuid, text, bigint, integer) to service_role;
grant execute on function public.fail_export_job(uuid, uuid, text, text, integer) to service_role;
