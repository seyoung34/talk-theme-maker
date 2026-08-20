-- 3트랙 에셋 저장소 — 활성화 경합에서 최신 게시가 실패하던 문제를 고친다.
--
-- 기존 RPC는 **호출자가 지목한** `p_retire_id`를 내렸다. 호출자는 바이트를 올리기 전에 읽은
-- active를 넘기므로, 그 사이 다른 게시가 끼어들면 어긋난다.
--
--   1. rev2와 rev3 게시가 모두 active = rev1을 읽는다
--   2. rev2가 먼저 rev1을 retired로 내리고 active가 된다
--   3. rev3은 이미 retired인 rev1을 내리려 한다 → `and status = 'active'` 조건으로 0행 갱신
--   4. rev2가 active로 남아 있어 rev3 활성화가 partial unique 인덱스에 걸린다
--   5. 오류가 CatalogPublishFailure로 감싸여 라우트의 23505 재시도에도 걸리지 않는다
--
-- 기존 active가 사라지지는 않지만 **최신 게시가 실패한다.**
--
-- 이제 같은 (logical_asset_id, variant_key)의 활성화는 transaction advisory lock으로 먼저
-- 직렬화한다. 그 뒤 **실제로 active인 행**을 조회하고 내리므로, 잠금 대기 중 active가 바뀌어도
-- 새 명령 snapshot에서 최신 행을 볼 수 있다.
--
-- 행 잠금만으로는 충분하지 않다. 두 SELECT ... FOR UPDATE가 같은 옛 active에서 대기하면, 두 번째
-- 명령은 먼저 기다리기 시작한 snapshot에 없던 새 active를 찾지 못하고 partial unique index에서
-- 다시 실패할 수 있다. advisory lock은 active 조회 명령 자체가 앞선 활성화 커밋 뒤에 시작되게 한다.
--
-- 더불어 전진 전용 가드를 둔다. 오래된 revision이 새 revision을 덮어쓰면 조용한 다운그레이드가
-- 된다. 이전 revision으로 되돌리는 것은 이 경로가 아니라 수동 rollback의 일이다
-- (`publish.ts`/`publishService.ts` 주석과 같은 규칙).
--
-- `p_retire_id`는 호출 계약을 깨지 않기 위해 남기지만 더 이상 권위가 없다. 다른 논리 에셋을
-- 가리키면 여전히 거절해, 잘못된 호출을 조용히 삼키지 않는다.

create or replace function public.activate_theme_asset_object(
  p_activate_id uuid,
  p_retire_id uuid default null
)
returns table (activated_id uuid, retired_id uuid)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  target record;
  current_active record;
  retired uuid;
begin
  if p_activate_id is null then raise exception 'invalid_activate_id'; end if;

  -- 먼저 잠금 key에 필요한 최소 identity만 읽는다. 이 조회에는 행 잠금을 걸지 않는다. 모든
  -- 활성화가 advisory lock -> target row -> current active 순서로 잠가야 교차 호출이 deadlock을
  -- 만들지 않는다. 잠금을 얻은 뒤 target을 다시 읽어 상태 변경·삭제를 검증한다.
  select logical_asset_id, variant_key
  into target
  from public.theme_asset_objects
  where id = p_activate_id;

  if not found then raise exception 'catalog_object_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    format('%s:%s:%s', length(target.logical_asset_id), target.logical_asset_id, target.variant_key),
    0
  ));

  select id, logical_asset_id, variant_key, status, revision
  into target
  from public.theme_asset_objects
  where id = p_activate_id
  for update;

  if not found then raise exception 'catalog_object_not_found'; end if;

  -- 이미 active면 아무 일도 하지 않는다. 재시도가 몇 번 돌아도 결과가 같아야 한다.
  if target.status = 'active' then
    return query select p_activate_id, null::uuid;
    return;
  end if;

  if target.status <> 'staged' then
    raise exception 'catalog_object_not_staged';
  end if;

  -- 호출자가 지목한 행이 다른 논리 에셋이면 잘못된 호출이다. 조용히 넘기지 않는다.
  if p_retire_id is not null then
    perform 1
    from public.theme_asset_objects
    where id = p_retire_id
      and logical_asset_id = target.logical_asset_id
      and variant_key = target.variant_key;
    if not found then raise exception 'catalog_retire_target_mismatch'; end if;
  end if;

  -- 같은 자산의 활성화는 위 advisory lock으로 직렬화됐다. 따라서 이 명령은 앞선 활성화가
  -- 커밋된 뒤 시작하며, 지금 실제로 active인 행을 snapshot에서 볼 수 있다.
  select id, revision
  into current_active
  from public.theme_asset_objects
  where logical_asset_id = target.logical_asset_id
    and variant_key = target.variant_key
    and status = 'active'
  for update;

  if found then
    if current_active.revision > target.revision then
      raise exception 'catalog_activation_not_forward';
    end if;

    update public.theme_asset_objects
    set status = 'retired'
    where id = current_active.id;
    retired := current_active.id;
  end if;

  update public.theme_asset_objects
  set status = 'active', activated_at = now()
  where id = p_activate_id and status = 'staged';

  return query select p_activate_id, retired;
end;
$$;

comment on function public.activate_theme_asset_object(uuid, uuid) is
  'Activates a staged catalog object, retiring whichever revision is actually active at commit time. Forward-only.';
