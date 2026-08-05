-- 서비스 내 1:1 문의. 로그인 사용자만 접수하고, 답변은 서비스 안에서 확인한다.
--
-- 계정 삭제 시 이 데이터는 지우지 않고 private 스키마로 가명 이관한다(3년 보존). 그 이관은
-- Phase 3에서 붙이며, 여기서는 이관 전에 새 글이 끼어드는 경로를 먼저 막는다.

-- ---------------------------------------------------------------------------
-- 삭제가 시작된 계정을 판별한다.
--
-- private 스키마는 authenticated 가 직접 읽을 수 없으므로 security definer 로 감싼다.
-- 삭제 작업이 만들어진 뒤에는 새 문의가 들어오면 안 된다 — 이관이 이미 끝난 상태에서
-- 들어온 글은 재시도 시 보존되지 않고 auth 사용자 삭제의 cascade 로 사라진다.
-- ---------------------------------------------------------------------------
create or replace function public.is_account_deletion_pending()
returns boolean
language sql
stable
security definer
set search_path = private, pg_catalog
as $$
  select exists (select 1 from private.account_deletion_jobs where user_id = auth.uid());
$$;

revoke all on function public.is_account_deletion_pending() from public;
grant execute on function public.is_account_deletion_pending() to authenticated, service_role;

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null
    check (category in ('payment', 'export', 'account', 'privacy', 'etc')),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  -- 내보내기 문의일 때의 참조값. FK 를 걸지 않는다 — 내보내기 기록이 정리돼도 문의는 남아야
  -- 한다. 대신 접수 시점에 서버가 본인 소유인지 확인한다(lib/inquiries/api.ts).
  export_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 마지막 관리자 답변 시각. 첫 답변으로 두면 대화가 이어질 때 값이 멈춰 응대 종료 시점을 잃는다.
  answered_at timestamptz,
  -- 미확인 답변 배지용. 사용자가 조작하지 못하도록 서버 API 만 갱신한다.
  user_read_at timestamptz
);

create table if not exists public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  author text not null check (author in ('user', 'admin')),
  -- 관리자 답변자. 사용자 메시지는 null 이며, 보존본으로는 이관하지 않는다.
  author_user_id uuid references auth.users (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  -- 사용자 메시지가 답변자 ID 를 달고 들어오는 위조를 스키마에서 막는다.
  constraint inquiry_messages_author_identity check (author = 'admin' or author_user_id is null)
);

comment on table public.inquiries is
  'User support threads. Retained for three years after account deletion as pseudonymous records in private.legal_inquiry_records.';

create index if not exists inquiries_user_idx on public.inquiries (user_id, created_at desc);
create index if not exists inquiries_status_idx on public.inquiries (status, created_at desc);
create index if not exists inquiry_messages_inquiry_idx on public.inquiry_messages (inquiry_id, created_at);

drop trigger if exists touch_inquiries on public.inquiries;
create trigger touch_inquiries
before update on public.inquiries
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 메시지가 붙으면 부모 문의의 상태·시각을 갱신한다.
--
-- 사용자에게는 inquiries UPDATE 권한이 없으므로(아래 정책) 트리거가 아니면 갱신할 방법이 없다.
-- 애플리케이션에서 두 번 쓰면 한쪽만 성공하는 경우가 생기는 것도 트리거를 쓰는 이유다.
--
--   사용자 메시지 → open      (답변을 받은 뒤 되물으면 다시 대기 상태가 되어야 목록에 잡힌다)
--   관리자 메시지 → answered  (answered_at 갱신)
-- ---------------------------------------------------------------------------
create or replace function public.apply_inquiry_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.inquiries
  set
    status = case when new.author = 'admin' then 'answered' else 'open' end,
    answered_at = case when new.author = 'admin' then new.created_at else answered_at end,
    updated_at = now()
  where id = new.inquiry_id;
  return new;
end;
$$;

drop trigger if exists apply_inquiry_message on public.inquiry_messages;
create trigger apply_inquiry_message
after insert on public.inquiry_messages
for each row execute function public.apply_inquiry_message();

alter table public.inquiries enable row level security;
alter table public.inquiry_messages enable row level security;

-- 사용자에게 UPDATE 를 주지 않는다. RLS 는 컬럼 단위로 막지 못하므로, UPDATE 를 허용하면
-- status·answered_at·user_read_at·user_id 를 함께 열어 주는 셈이 된다. 그 값들은 트리거와
-- 서버 API(service_role)만 바꾼다.
grant select, insert on public.inquiries to authenticated;
grant select, insert on public.inquiry_messages to authenticated;
grant select, insert, update, delete on public.inquiries to service_role;
grant select, insert, update, delete on public.inquiry_messages to service_role;

drop policy if exists "Users read own inquiries" on public.inquiries;
create policy "Users read own inquiries"
on public.inquiries
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users open own inquiries" on public.inquiries;
create policy "Users open own inquiries"
on public.inquiries
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'open'
  and answered_at is null
  and user_read_at is null
  and not public.is_account_deletion_pending()
);

drop policy if exists "Users read own inquiry messages" on public.inquiry_messages;
create policy "Users read own inquiry messages"
on public.inquiry_messages
for select
to authenticated
using (
  public.is_admin()
  or exists (select 1 from public.inquiries where id = inquiry_id and user_id = auth.uid())
);

-- 종료된 문의에는 글이 붙지 않는다. 붙으면 관리자 목록에서 사라진 채 대화가 이어진다.
drop policy if exists "Users reply to own inquiries" on public.inquiry_messages;
create policy "Users reply to own inquiries"
on public.inquiry_messages
for insert
to authenticated
with check (
  author = 'user'
  and author_user_id is null
  and not public.is_account_deletion_pending()
  and exists (
    select 1 from public.inquiries
    where id = inquiry_id and user_id = auth.uid() and status <> 'closed'
  )
);
