-- 문의 쓰기를 RPC 뒤로 옮기고, 계정 삭제와 같은 락으로 직렬화한다.
--
-- 세 가지 문제를 함께 고친다.
--
-- 1. `authenticated` 에게 두 테이블의 INSERT 권한이 있어 PostgREST 를 직접 호출하면 서버의
--    접수 빈도 제한과 `export_job_id` 소유권 검증을 통째로 건너뛸 수 있었다.
-- 2. 문의와 첫 메시지를 두 번에 나눠 저장해, 그 사이에 계정 삭제가 끼면 본문 없는 빈 문의만
--    보존본에 남았다.
-- 3. 계정 삭제 트랜잭션이 작업 행을 넣고 커밋하기 전에는 다른 세션의
--    `is_account_deletion_pending()` 이 그 행을 보지 못한다. 그 틈에 들어온 문의는 이관되지
--    않은 채 auth 사용자 삭제의 cascade 로 사라진다. 재시도 이관은 재시도가 있을 때만 돕는다.
--
-- 셋 다 "검증과 쓰기가 한 트랜잭션 안에서, 삭제와 직렬화되어" 일어나면 사라진다.

-- 사용자별 직렬화 지점. 문의 쓰기와 계정 삭제가 같은 키를 잡는다.
create or replace function private.lock_account_writes(p_user_id uuid)
returns void
language sql
as $$
  select pg_advisory_xact_lock(hashtextextended('account_writes:' || p_user_id::text, 0));
$$;

revoke all on function private.lock_account_writes(uuid) from public, anon, authenticated;
-- 계정 삭제 RPC 는 security invoker 라 service_role 로 실행된다. 이 grant 가 없으면 삭제가
-- 42501 로 죽고, 그러면 삭제 자체가 막혀 문의 차단도 걸리지 않는다.
-- 아래 문의 쓰기 RPC 는 security definer 라 소유자 권한으로 호출하므로 별도 grant 가 필요 없다.
grant execute on function private.lock_account_writes(uuid) to service_role;

-- 접수 빈도 상한. 서버 코드가 아니라 여기서 강제해야 우회되지 않는다.
create or replace function public.create_inquiry(
  p_category text,
  p_title text,
  p_body text,
  p_export_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  recent_count integer;
  new_inquiry_id uuid;
begin
  if actor is null then raise exception 'unauthenticated'; end if;

  perform private.lock_account_writes(actor);

  -- 락을 잡은 뒤에 확인한다. 삭제 트랜잭션이 진행 중이면 여기서 대기했다가 커밋된 상태를 본다.
  if exists (select 1 from private.account_deletion_jobs where user_id = actor) then
    raise exception 'deletion_pending';
  end if;

  select count(*) into recent_count
  from public.inquiries
  where user_id = actor and created_at >= now() - interval '1 hour';
  if recent_count >= 10 then raise exception 'rate_limited'; end if;

  -- FK 를 걸지 않는 대신 여기서 본인 소유인지 본다. 걸지 않는 이유는 내보내기 기록이
  -- 정리돼도 문의는 남아야 하기 때문이다.
  if p_export_job_id is not null and not exists (
    select 1 from public.export_jobs where id = p_export_job_id and user_id = actor
  ) then
    raise exception 'export_job_not_owned';
  end if;

  insert into public.inquiries (user_id, category, title, export_job_id)
  values (actor, p_category, p_title, p_export_job_id)
  returning id into new_inquiry_id;

  -- 같은 트랜잭션에서 본문까지 넣는다. 나뉘어 있으면 본문 없는 문의가 남을 수 있다.
  insert into public.inquiry_messages (inquiry_id, author, body)
  values (new_inquiry_id, 'user', p_body);

  return new_inquiry_id;
end;
$$;

create or replace function public.add_inquiry_message(p_inquiry_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  target public.inquiries%rowtype;
  recent_count integer;
  new_message_id uuid;
begin
  if actor is null then raise exception 'unauthenticated'; end if;

  perform private.lock_account_writes(actor);

  if exists (select 1 from private.account_deletion_jobs where user_id = actor) then
    raise exception 'deletion_pending';
  end if;

  select * into target from public.inquiries where id = p_inquiry_id and user_id = actor;
  if not found then raise exception 'inquiry_not_found'; end if;
  -- 종료된 문의에 글이 붙으면 관리자 목록에서 사라진 채 대화가 이어진다.
  if target.status = 'closed' then raise exception 'inquiry_closed'; end if;

  select count(*) into recent_count
  from public.inquiry_messages
  where inquiry_id = p_inquiry_id and author = 'user' and created_at >= now() - interval '1 minute';
  if recent_count >= 10 then raise exception 'rate_limited'; end if;

  insert into public.inquiry_messages (inquiry_id, author, body)
  values (p_inquiry_id, 'user', p_body)
  returning id into new_message_id;

  return new_message_id;
end;
$$;

revoke all on function public.create_inquiry(text, text, text, uuid) from public, anon;
revoke all on function public.add_inquiry_message(uuid, text) from public, anon;
grant execute on function public.create_inquiry(text, text, text, uuid) to authenticated;
grant execute on function public.add_inquiry_message(uuid, text) to authenticated;

-- 직접 INSERT 를 막는다. 위 RPC 가 유일한 쓰기 경로다. SELECT 는 그대로 RLS 가 지킨다.
-- INSERT 정책은 남겨 둔다 — 권한이 다시 부여되더라도 소유권·종료·삭제중 조건은 계속 걸린다.
revoke insert on public.inquiries from authenticated;
revoke insert on public.inquiry_messages from authenticated;

-- ---------------------------------------------------------------------------
-- 읽음 처리가 활동 시각을 밀지 않게 한다.
--
-- `touch_updated_at()` 은 어떤 UPDATE 에도 updated_at 을 now() 로 올린다. 그래서 사용자가
-- 문의를 열어 보기만 해도
--   - 관리자 목록(updated_at 정렬)에서 새 글처럼 위로 올라오고
--   - 사용자 목록의 날짜가 바뀌며
--   - 보존본의 last_activity_at, 나아가 3년 만료 시점까지 밀린다.
-- 읽음 시각만 달라진 UPDATE 는 활동으로 보지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.touch_inquiry_updated_at()
returns trigger
language plpgsql
as $$
begin
  if to_jsonb(new) - 'user_read_at' - 'updated_at' = to_jsonb(old) - 'user_read_at' - 'updated_at' then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists touch_inquiries on public.inquiries;
create trigger touch_inquiries
before update on public.inquiries
for each row execute function public.touch_inquiry_updated_at();
