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
    update public.credit_balances as cb
    set balance = cb.balance + stale_refund
    where cb.user_id = p_user_id
    returning cb.balance into current_balance;
  end if;

  if exists (
    select 1
    from public.export_jobs ej
    where ej.user_id = p_user_id
      and ej.status = 'pending'
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

  update public.credit_balances as cb
  set balance = cb.balance - 1
  where cb.user_id = p_user_id
  returning cb.balance into next_balance;

  insert into public.credit_ledger (user_id, amount, type, reason, export_job_id)
  values (p_user_id, -1, 'export', 'export_credit_reserved', new_job_id);

  return query select new_job_id, next_balance;
end;
$$;

revoke all on function public.reserve_export_credit(uuid, text, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.reserve_export_credit(uuid, text, text, integer, bigint) to service_role;
