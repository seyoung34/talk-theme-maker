-- 계정 삭제 시 문의 기록을 가명 이관한다.
--
-- 개인정보 처리방침이 "소비자 불만 또는 분쟁처리에 관한 기록 3년"을 선언하고 있는데 그 칸을
-- 채우는 저장소가 없었다. 결제·크레딧 증빙과 같은 방식으로 private 스키마에 담는다.

create table if not exists private.legal_inquiry_records (
  source_inquiry_id uuid primary key,
  retention_subject_id uuid not null,
  category text not null,
  title text not null,
  status text not null,
  -- created_at 오름차순으로 담는다. jsonb 는 배열 순서를 보존하므로 이관 시점의 정렬이 곧
  -- 보존본의 정렬이다. 관리자 답변자 ID(author_user_id)는 담지 않는다 — 분쟁 처리 기록의
  -- 요건은 "무엇을 문의했고 어떻게 처리했는가"이고, 응대 직원이 누구였는지는 그 요건이 아니다.
  messages jsonb not null,
  opened_at timestamptz not null,
  last_activity_at timestamptz not null,
  archived_at timestamptz not null default now(),
  retention_expires_at timestamptz not null
);

comment on table private.legal_inquiry_records is
  'Minimum consumer complaint and dispute-handling evidence retained separately after account deletion.';

create index if not exists legal_inquiry_records_subject_idx
on private.legal_inquiry_records (retention_subject_id);

create index if not exists legal_inquiry_records_expiry_idx
on private.legal_inquiry_records (retention_expires_at);

-- legal_payment_records·legal_credit_records 와 같은 권한. 이관 RPC 와 만료 파기 RPC 가
-- security invoker 로 service_role 에서 돌기 때문에 명시가 필요하다. update 는 주지 않는다 —
-- 보존본은 한 번 쓰고 만료 시 지우는 읽기 전용 증빙이다.
grant select, insert, delete on private.legal_inquiry_records to service_role;

alter table private.account_deletion_jobs
  add column if not exists archived_inquiry_count integer not null default 0
    check (archived_inquiry_count >= 0);

-- ---------------------------------------------------------------------------
-- 삭제 준비 RPC에 문의 이관을 더한다.
--
-- 반환 형태는 그대로 둔다. 호출부(lib/account/supabaseAccountDeletion.ts)가 error 만 보므로
-- 컬럼을 늘릴 이유가 없고, 늘리면 drop 이 필요해 배포 순서가 까다로워진다. 이관 건수는
-- account_deletion_jobs.archived_inquiry_count 에 남는다.
--
-- **문의 이관은 조기 반환보다 앞에 둔다.** 이유:
--
--   1. prepare 성공 → 이관·삭제 완료, 작업 상태 'prepared'
--   2. deleteAuthUser() 실패 → 사용자는 계정이 살아 있어 새 문의를 쓸 수 있다
--   3. 재시도 → 옛 구조에서는 'prepared' 라서 조기 반환, 이관도 삭제도 하지 않았다
--   4. deleteAuthUser() 성공 → inquiries.user_id 의 on delete cascade 가 그 문의를
--      증빙 없이 지운다
--
-- 즉 3년 보존 의무가 있는 기록이 조용히 사라지는 경로가 있었다. 이관 블록을 앞으로 빼면
-- 재시도가 남은 문의를 반드시 담는다. 대상이 없으면 아무 일도 하지 않으므로 몇 번 돌아도 안전하다.
-- 새 문의 자체는 is_account_deletion_pending() 을 쓰는 RLS 가 1차로 막는다(20260805140000).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 만료 파기에 문의 보존본을 더한다.
--
-- 반환 컬럼이 늘어나므로 `create or replace` 가 통하지 않는다(반환 타입 변경). drop 후
-- 재생성한다. 별도 RPC 로 나누지 않는 이유는, 만료 파기가 두 곳이 되면 한쪽만 스케줄에
-- 걸리는 사고가 나고 그 실패는 "보존기간이 지난 개인정보가 남는" 쪽이기 때문이다.
--
-- pg_cron 스케줄은 `select * from public.purge_expired_legal_records()` 라 컬럼 수에
-- 의존하지 않는다. 스케줄은 그대로 둔다.
-- ---------------------------------------------------------------------------
drop function if exists public.purge_expired_legal_records();

create function public.purge_expired_legal_records()
returns table (
  deleted_payment_records integer,
  deleted_credit_records integer,
  deleted_inquiry_records integer,
  deleted_deletion_jobs integer
)
language plpgsql
security invoker
set search_path = private
as $$
declare
  payment_count integer;
  credit_count integer;
  inquiry_count integer;
  job_count integer;
begin
  delete from private.legal_credit_records where retention_expires_at <= now();
  get diagnostics credit_count = row_count;

  delete from private.legal_payment_records where retention_expires_at <= now();
  get diagnostics payment_count = row_count;

  delete from private.legal_inquiry_records where retention_expires_at <= now();
  get diagnostics inquiry_count = row_count;

  -- 작업 레코드는 가명 매핑을 들고 있으므로 증빙보다 먼저 사라지면 안 된다. 마지막에 지운다.
  delete from private.account_deletion_jobs where retention_expires_at <= now();
  get diagnostics job_count = row_count;

  return query select payment_count, credit_count, inquiry_count, job_count;
end;
$$;

revoke all on function public.purge_expired_legal_records() from public, anon, authenticated;
grant execute on function public.purge_expired_legal_records() to service_role;
