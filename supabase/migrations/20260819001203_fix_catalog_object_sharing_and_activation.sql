-- 3트랙 에셋 저장소 — catalog registry 결함 두 건 수정.
--
-- 계약 문서: docs/architecture/three-track-asset-storage.md §3.2, §8

-- ---------------------------------------------------------------------------
-- 1. gcs_object_key의 unique 제약 제거
--
-- content-addressed 키는 **같은 바이트를 하나의 객체로 모으는 것**이 목적이다. 따라서 서로 다른
-- 논리 에셋이 같은 객체를 가리키는 것이 정상이고 오히려 설계 의도다. 실측에서도 논리 에셋 126개가
-- 객체 90개를 공유한다 — unique로 두면 36건이 삽입 단계에서 실패한다.
--
-- 이 인덱스의 용도는 GC와 고아 보고서의 역조회다. 조회 성능만 필요하므로 non-unique로 바꾼다.
-- ---------------------------------------------------------------------------
drop index if exists public.theme_asset_objects_gcs_object_key_idx;

create index if not exists theme_asset_objects_gcs_object_key_idx
on public.theme_asset_objects (gcs_object_key);

-- ---------------------------------------------------------------------------
-- 2. active revision 교체를 원자적으로
--
-- 기존 구현은 PostgREST로 UPDATE 두 번을 보냈다. 부분 unique 인덱스
-- (theme_asset_objects_active_revision_idx) 때문에 반드시 "이전 것을 내리고 → 새 것을 올리는"
-- 순서여야 하는데, 그 사이에서 끊기면 **active revision이 하나도 없는 상태**가 남는다.
-- 그때 export는 해당 에셋을 해석하지 못한다.
--
-- plpgsql 함수 본문은 하나의 트랜잭션이므로 두 UPDATE가 함께 커밋되거나 함께 롤백된다.
--
-- 전제 조건을 함수 안에서 검사한다. 호출부가 stale한 상태를 들고 재시도해도 잘못된 전환이
-- 일어나지 않게 하기 위해서다.
-- ---------------------------------------------------------------------------
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
  previous record;
begin
  if p_activate_id is null then raise exception 'invalid_activate_id'; end if;

  select id, logical_asset_id, variant_key, status
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

  if p_retire_id is not null then
    select id, logical_asset_id, variant_key, status
    into previous
    from public.theme_asset_objects
    where id = p_retire_id
    for update;

    if not found then raise exception 'catalog_retire_target_not_found'; end if;
    -- 다른 논리 에셋의 active를 실수로 내리지 않는다.
    if previous.logical_asset_id <> target.logical_asset_id
       or previous.variant_key <> target.variant_key then
      raise exception 'catalog_retire_target_mismatch';
    end if;

    update public.theme_asset_objects
    set status = 'retired'
    where id = p_retire_id and status = 'active';
  end if;

  update public.theme_asset_objects
  set status = 'active', activated_at = now()
  where id = p_activate_id and status = 'staged';

  return query select p_activate_id, p_retire_id;
end;
$$;

revoke all on function public.activate_theme_asset_object(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_theme_asset_object(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. 실패한 revision을 같은 내용으로 재시도
--
-- R2 업로드나 DB 처리의 일시 오류로 revision이 `failed`가 되면, 지금은 같은 revision으로 다시
-- 올릴 수 없어 내용이 같은데도 번호를 올려야 했다. revision은 "내용의 이름"이므로 같은 바이트에
-- 새 번호를 붙이는 것은 의미를 흐린다.
--
-- 같은 sha256일 때만 `failed` → `staged`로 되돌린다. 다른 내용으로 덮어쓰는 요청은 여기서 막히고
-- 호출부의 sha256 검사에서도 막힌다.
-- ---------------------------------------------------------------------------
create or replace function public.restage_failed_theme_asset_object(
  p_id uuid,
  p_sha256 text
)
returns table (restaged_id uuid)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  target record;
begin
  select id, status, sha256 into target
  from public.theme_asset_objects
  where id = p_id
  for update;

  if not found then raise exception 'catalog_object_not_found'; end if;
  if target.sha256 <> p_sha256 then raise exception 'catalog_object_hash_mismatch'; end if;
  if target.status <> 'failed' then raise exception 'catalog_object_not_failed'; end if;

  update public.theme_asset_objects
  set status = 'staged'
  where id = p_id and status = 'failed';

  return query select p_id;
end;
$$;

revoke all on function public.restage_failed_theme_asset_object(uuid, text) from public, anon, authenticated;
grant execute on function public.restage_failed_theme_asset_object(uuid, text) to service_role;
