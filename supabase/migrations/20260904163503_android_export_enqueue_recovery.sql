-- Keep the existing export status contract (`pending/succeeded/failed`) and add the
-- orchestration data needed to recover an interrupted enqueue without guessing.
alter table public.export_jobs
  add column if not exists enqueue_state text not null default 'reserved',
  add column if not exists enqueue_attempt smallint not null default 0,
  add column if not exists builder_operation_name text,
  add column if not exists builder_execution_name text,
  add column if not exists input_completed_at timestamptz,
  add column if not exists triggered_at timestamptz,
  add column if not exists builder_started_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists recovery_reason text,
  add column if not exists cancel_requested_at timestamptz;

update public.export_jobs
set enqueue_state = case
  when status <> 'pending' then 'settled'
  when stage in ('building', 'packaging', 'finalizing') then 'running'
  when stage = 'preparing' then 'uploading'
  else 'reserved'
end
where enqueue_state = 'reserved';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_jobs_enqueue_state_check'
      and conrelid = 'public.export_jobs'::regclass
  ) then
    alter table public.export_jobs
      add constraint export_jobs_enqueue_state_check
      check (enqueue_state in (
        'reserved',
        'uploading',
        'input_ready',
        'triggering',
        'trigger_ambiguous',
        'triggered',
        'running',
        'reconciling',
        'cancel_requested',
        'settled'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_jobs_enqueue_attempt_check'
      and conrelid = 'public.export_jobs'::regclass
  ) then
    alter table public.export_jobs
      add constraint export_jobs_enqueue_attempt_check
      check (enqueue_attempt between 0 and 1);
  end if;
end;
$$;

create index if not exists export_jobs_pending_enqueue_state_idx
on public.export_jobs (enqueue_state, created_at)
where status = 'pending';

create index if not exists export_jobs_builder_execution_idx
on public.export_jobs (builder_execution_name)
where builder_execution_name is not null;

-- Terminal status always has a settled orchestration state, including legacy RPCs
-- that were written before these columns existed.
create or replace function public.sync_export_job_enqueue_state()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if new.status <> 'pending' then
    new.enqueue_state := 'settled';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_export_job_enqueue_state on public.export_jobs;
create trigger sync_export_job_enqueue_state
before insert or update of status on public.export_jobs
for each row
execute function public.sync_export_job_enqueue_state();

-- Once a user cancellation has been recorded, a late result must not win the
-- race by changing the job to succeeded. The cancellation RPC can then take
-- the normal failed/refund transition.
create or replace function public.prevent_export_job_completion_after_cancel()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'succeeded' and old.cancel_requested_at is not null then
    raise exception 'export_job_cancel_requested';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_export_job_completion_after_cancel on public.export_jobs;
create trigger prevent_export_job_completion_after_cancel
before update of status on public.export_jobs
for each row
execute function public.prevent_export_job_completion_after_cancel();

-- Record the user's intent without settling yet. A builder or reconciliation sweep
-- performs the actual terminal transition after checking the current result/execution.
create or replace function public.request_export_cancellation(
  p_user_id uuid,
  p_export_job_id uuid
)
returns table (requested boolean, status text, balance integer)
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

  if not found then
    raise exception 'export_job_not_found';
  end if;

  select cb.balance into current_balance
  from public.credit_balances cb
  where cb.user_id = p_user_id;

  if job_row.status <> 'pending' then
    return query select false, job_row.status, coalesce(current_balance, 0);
    return;
  end if;

  update public.export_jobs
  set
    cancel_requested_at = coalesce(cancel_requested_at, now()),
    enqueue_state = 'cancel_requested'
  where id = p_export_job_id;

  return query select true, 'pending'::text, coalesce(current_balance, 0);
end;
$$;

-- Settle a cancellation exactly once. The row lock makes cancellation race safely
-- with complete_export_job/fail_export_job; whichever terminal transition acquires
-- the lock first owns the credit settlement.
create or replace function public.cancel_export_job(
  p_user_id uuid,
  p_export_job_id uuid,
  p_duration_ms integer
)
returns table (transitioned boolean, status text, balance integer)
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

  if not found then
    raise exception 'export_job_not_found';
  end if;

  if job_row.status <> 'pending' then
    select cb.balance into next_balance
    from public.credit_balances cb
    where cb.user_id = p_user_id;
    return query select false, job_row.status, coalesce(next_balance, 0);
    return;
  end if;

  update public.export_jobs
  set
    cancel_requested_at = coalesce(cancel_requested_at, now()),
    status = 'failed',
    stage = 'failed',
    enqueue_state = 'settled',
    error_code = 'build_cancelled',
    error = '내보내기 작업이 취소되었습니다.',
    duration_ms = least(2147483647, greatest(0, coalesce(nullif(p_duration_ms, 0)::numeric, floor(extract(epoch from (now() - job_row.created_at)) * 1000))))::integer,
    completed_at = now()
  where id = p_export_job_id;

  update public.credit_balances
  set balance = public.credit_balances.balance + job_row.credit_cost
  where user_id = p_user_id
  returning public.credit_balances.balance into next_balance;

  insert into public.credit_ledger (user_id, amount, type, reason, export_job_id)
  values (p_user_id, job_row.credit_cost, 'export', 'export_cancelled_refund', p_export_job_id);

  return query select true, 'failed'::text, coalesce(next_balance, 0);
end;
$$;

-- Claim the single allowed recovery retry atomically. The caller performs the
-- expensive GCS/Cloud Run inspection before calling this function.
create or replace function public.claim_export_recovery(
  p_user_id uuid,
  p_export_job_id uuid,
  p_expected_attempt smallint
)
returns table (claimed boolean, status text, enqueue_state text, enqueue_attempt smallint)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  job_row public.export_jobs%rowtype;
begin
  select * into job_row
  from public.export_jobs
  where id = p_export_job_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'export_job_not_found';
  end if;

  if job_row.status <> 'pending'
     or job_row.cancel_requested_at is not null
     or p_expected_attempt is null
     or job_row.enqueue_attempt <> p_expected_attempt
     or p_expected_attempt >= 1
     or job_row.enqueue_state not in ('reserved', 'uploading', 'input_ready', 'triggering', 'trigger_ambiguous', 'reconciling') then
    return query select false, job_row.status, job_row.enqueue_state, job_row.enqueue_attempt;
    return;
  end if;

  update public.export_jobs
  set
    enqueue_attempt = public.export_jobs.enqueue_attempt + 1,
    enqueue_state = 'triggering',
    recovery_reason = 'missing_cloud_run_execution'
  where id = p_export_job_id;

  return query select true, 'pending'::text, 'triggering'::text, (job_row.enqueue_attempt + 1)::smallint;
end;
$$;

revoke all on function public.request_export_cancellation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_export_job(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_export_recovery(uuid, uuid, smallint) from public, anon, authenticated;
grant execute on function public.request_export_cancellation(uuid, uuid) to service_role;
grant execute on function public.cancel_export_job(uuid, uuid, integer) to service_role;
grant execute on function public.claim_export_recovery(uuid, uuid, smallint) to service_role;
