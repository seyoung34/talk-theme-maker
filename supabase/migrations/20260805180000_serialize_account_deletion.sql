-- 계정 삭제를 문의 쓰기와 같은 advisory lock 으로 직렬화한다.
--
-- 20260805170000 이 문의 쓰기를 RPC 로 옮기면서 private.lock_account_writes() 를 도입했다.
-- 삭제 쪽도 같은 키를 잡아야 "작업 행을 넣었지만 아직 커밋하지 않은" 구간에 문의가 끼어드는
-- 경로가 닫힌다. 본문의 나머지는 20260805160000 과 같다.

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns table (
  retention_subject_id uuid,
  archived_payment_count integer,
  archived_credit_record_count integer
)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  deletion_job private.account_deletion_jobs%rowtype;
  payment_count integer := 0;
  credit_record_count integer := 0;
  inquiry_count integer := 0;
begin
  if p_user_id is null then raise exception 'invalid_user_id'; end if;

  -- 문의 쓰기와 같은 키를 잡는다. 이 락 없이는 작업 행을 넣고 커밋하기 전에 들어온 문의가
  -- is_account_deletion_pending() 에 보이지 않아, 이관되지 않은 채 cascade 로 사라진다.
  perform private.lock_account_writes(p_user_id);

  if exists (select 1 from public.admin_profiles where user_id = p_user_id) then
    raise exception 'admin_account';
  end if;

  if exists (
    select 1 from public.export_jobs
    where user_id = p_user_id and status = 'pending'
  ) then
    raise exception 'pending_export';
  end if;

  if exists (
    select 1 from public.payments
    where user_id = p_user_id and status = 'pending'
  ) then
    raise exception 'pending_payment';
  end if;

  insert into private.account_deletion_jobs (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into deletion_job
  from private.account_deletion_jobs
  where user_id = p_user_id
  for update;

  -- 조기 반환보다 앞. 재시도에서도 남은 문의를 반드시 담는다.
  insert into private.legal_inquiry_records (
    source_inquiry_id,
    retention_subject_id,
    category,
    title,
    status,
    messages,
    opened_at,
    last_activity_at,
    retention_expires_at
  )
  select
    i.id,
    deletion_job.retention_subject_id,
    i.category,
    i.title,
    i.status,
    coalesce(thread.messages, '[]'::jsonb),
    i.created_at,
    greatest(i.updated_at, coalesce(thread.last_message_at, i.updated_at)),
    greatest(i.updated_at, coalesce(thread.last_message_at, i.updated_at)) + interval '3 years'
  from public.inquiries i
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object('author', m.author, 'body', m.body, 'created_at', m.created_at)
        order by m.created_at
      ) as messages,
      max(m.created_at) as last_message_at
    from public.inquiry_messages m
    where m.inquiry_id = i.id
  ) thread on true
  where i.user_id = p_user_id
  on conflict (source_inquiry_id) do nothing;

  get diagnostics inquiry_count = row_count;

  -- inquiry_messages 는 cascade 로 함께 지워진다.
  delete from public.inquiries where user_id = p_user_id;

  if inquiry_count > 0 then
    -- 재시도에서 추가로 담긴 건수를 덮어쓰지 않고 누적한다.
    update private.account_deletion_jobs
    set archived_inquiry_count = archived_inquiry_count + inquiry_count
    where user_id = p_user_id
    returning * into deletion_job;
  end if;

  if deletion_job.status in ('prepared', 'completed') then
    return query select
      deletion_job.retention_subject_id,
      deletion_job.archived_payment_count,
      deletion_job.archived_credit_record_count;
    return;
  end if;

  insert into private.legal_payment_records (
    source_payment_id,
    retention_subject_id,
    order_id,
    provider,
    provider_payment_id,
    payment_key,
    amount,
    credits,
    status,
    purchased_at,
    last_status_at,
    retention_expires_at
  )
  select
    p.id,
    deletion_job.retention_subject_id,
    p.order_id,
    p.provider,
    p.provider_payment_id,
    p.payment_key,
    p.amount,
    p.credits,
    p.status,
    p.created_at,
    p.updated_at,
    greatest(p.created_at, p.updated_at) + interval '5 years'
  from public.payments p
  where p.user_id = p_user_id
    and p.status in ('paid', 'canceled')
  on conflict (source_payment_id) do nothing;

  get diagnostics payment_count = row_count;

  if payment_count > 0 then
    insert into private.legal_credit_records (
      source_ledger_id,
      retention_subject_id,
      source_payment_id,
      amount,
      type,
      reason,
      occurred_at,
      retention_expires_at
    )
    select
      ledger.id,
      deletion_job.retention_subject_id,
      ledger.payment_id,
      ledger.amount,
      ledger.type,
      ledger.reason,
      ledger.created_at,
      ledger.created_at + interval '5 years'
    from public.credit_ledger ledger
    where ledger.user_id = p_user_id
      and ledger.type in ('purchase', 'export')
    on conflict (source_ledger_id) do nothing;

    get diagnostics credit_record_count = row_count;
  end if;

  delete from public.credit_ledger where user_id = p_user_id;
  delete from public.credit_code_redemptions where user_id = p_user_id;
  delete from public.export_jobs where user_id = p_user_id;
  delete from public.payments where user_id = p_user_id;
  delete from public.credit_balances where user_id = p_user_id;
  delete from public.user_policy_consents where user_id = p_user_id;
  delete from public.profiles where user_id = p_user_id;

  update private.account_deletion_jobs
  set
    status = 'prepared',
    archived_payment_count = payment_count,
    archived_credit_record_count = credit_record_count,
    prepared_at = now()
  where user_id = p_user_id
  returning * into deletion_job;

  return query select
    deletion_job.retention_subject_id,
    deletion_job.archived_payment_count,
    deletion_job.archived_credit_record_count;
end;
$$;
