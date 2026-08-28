-- 관리자 에셋 저장·수정을 한 트랜잭션으로 (계획 Phase 5-1).
--
-- 지금까지 일반 저장은 브라우저에서 여섯 단계를 순차 실행했다.
--   Storage 업로드 → admin_assets upsert → target DELETE → target INSERT
--   → bubble spec DELETE/INSERT → asset_object_id 해제
--
-- 중간에 탭이 닫히거나 네트워크가 끊기면 보상 코드가 돌지 못한다. 특히 target DELETE와
-- INSERT 사이에서 끊기면 **target이 하나도 없는 에셋**이 남는데, 그 상태는 조용하다.
-- `parseTargets`가 부모 컬럼으로 legacy `exact_role` target 하나를 만들어 내므로 오류 없이
-- 적용 범위만 kind 전체에서 슬롯 하나로 좁아진다.
--
-- 말풍선 빌더는 이미 `upsert_admin_asset_bundle`로 원자적이었다. 같은 화면의 두 저장 경로가
-- 다른 보장을 갖고 있던 셈이라, 일반 경로를 같은 RPC로 옮긴다.
--
-- 배포 순서: 이 migration을 **먼저** 적용한 뒤 애플리케이션을 배포한다. 반대 순서면 새 코드가
-- 옛 RPC를 불러 `asset_object_id`가 남고, 새 바이트를 올린 에셋이 이전 catalog 객체로
-- 내보내진다. 옛 코드가 새 RPC를 부르는 조합은 안전하다 — 코드가 뒤이어 실행하는 포인터
-- 해제가 이미 끝난 일을 한 번 더 하는 no-op이 된다.

-- ---------------------------------------------------------------------------
-- 1. bundle RPC가 catalog 포인터까지 같은 트랜잭션에서 끊는다.
--
-- 이 RPC는 **새 Storage 바이트와 함께만** 호출된다. 바이트가 바뀌면 이전 catalog 객체는 더
-- 이상 이 에셋의 내용이 아니므로, publisher가 새 객체를 올릴 때까지 export가 그것을 쓰지
-- 못하게 해야 한다. variant는 아래에서 지우고 다시 넣으므로 새 행이 NULL로 시작한다.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_admin_asset_bundle(
  p_asset jsonb,
  p_targets jsonb,
  p_variants jsonb default '[]'::jsonb,
  p_bubble_spec jsonb default null,
  p_bubble_design jsonb default null,
  p_decorations jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_asset_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  v_asset_id := (p_asset ->> 'id')::uuid;
  if v_asset_id is null then
    raise exception 'INVALID_ASSET_ID';
  end if;

  insert into public.admin_assets (
    id, slot_role, platform, asset_kind, analysis, bubble_adjustment,
    title, note, tags, file_name, mime_type, storage_path, enabled, created_by
  )
  values (
    v_asset_id,
    p_asset ->> 'slot_role',
    p_asset ->> 'platform',
    nullif(p_asset ->> 'asset_kind', ''),
    p_asset -> 'analysis',
    p_asset -> 'bubble_adjustment',
    p_asset ->> 'title',
    nullif(p_asset ->> 'note', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_asset -> 'tags', '[]'::jsonb))), '{}'),
    p_asset ->> 'file_name',
    p_asset ->> 'mime_type',
    p_asset ->> 'storage_path',
    coalesce((p_asset ->> 'enabled')::boolean, true),
    auth.uid()
  )
  on conflict (id) do update set
    slot_role = excluded.slot_role,
    platform = excluded.platform,
    asset_kind = excluded.asset_kind,
    analysis = excluded.analysis,
    bubble_adjustment = excluded.bubble_adjustment,
    title = excluded.title,
    note = excluded.note,
    tags = excluded.tags,
    file_name = excluded.file_name,
    mime_type = excluded.mime_type,
    storage_path = excluded.storage_path,
    enabled = excluded.enabled,
    -- 새 바이트가 들어왔으므로 이전 catalog 객체 연결을 끊는다.
    asset_object_id = null;

  delete from public.admin_asset_targets where asset_id = v_asset_id;
  insert into public.admin_asset_targets (asset_id, platform, slot_role, target_kind, priority, enabled)
  select
    v_asset_id,
    target.platform,
    target.slot_role,
    target.target_kind,
    coalesce(target.priority, 0),
    coalesce(target.enabled, true)
  from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb)) as target(
    platform text,
    slot_role text,
    target_kind text,
    priority integer,
    enabled boolean
  );

  delete from public.admin_asset_variants where asset_id = v_asset_id;
  insert into public.admin_asset_variants (asset_id, platform, storage_path, file_name, mime_type, analysis)
  select
    v_asset_id,
    variant.platform,
    variant.storage_path,
    variant.file_name,
    variant.mime_type,
    variant.analysis
  from jsonb_to_recordset(coalesce(p_variants, '[]'::jsonb)) as variant(
    platform text,
    storage_path text,
    file_name text,
    mime_type text,
    analysis jsonb
  );

  delete from public.admin_asset_bubble_specs where asset_id = v_asset_id;
  if p_bubble_spec is not null then
    insert into public.admin_asset_bubble_specs (asset_id, android_markers, ios_insets, ios_stretch, geometry)
    values (
      v_asset_id,
      p_bubble_spec -> 'android_markers',
      p_bubble_spec -> 'ios_insets',
      p_bubble_spec -> 'ios_stretch',
      -- 클라이언트는 geometry가 없을 때 JSON null을 담아 보낸다. `->`는 그것을 SQL NULL이
      -- 아니라 jsonb 'null'로 돌려주므로, 그대로 넣으면 아래 object 체크에 걸려 RPC 전체가
      -- 롤백된다(업로드된 스토리지 객체까지). 여기서 SQL NULL로 낮춘다.
      nullif(p_bubble_spec -> 'geometry', 'null'::jsonb)
    );
  end if;

  delete from public.admin_asset_bubble_decorations where asset_id = v_asset_id;
  delete from public.admin_asset_bubble_designs where asset_id = v_asset_id;
  if p_bubble_design is not null then
    insert into public.admin_asset_bubble_designs (asset_id, recipe, geometry_mode)
    values (v_asset_id, p_bubble_design -> 'recipe', p_bubble_design ->> 'geometry_mode');

    insert into public.admin_asset_bubble_decorations (asset_id, layer_id, storage_path, file_name, mime_type)
    select
      v_asset_id,
      decoration.layer_id,
      decoration.storage_path,
      decoration.file_name,
      decoration.mime_type
    from jsonb_to_recordset(coalesce(p_decorations, '[]'::jsonb)) as decoration(
      layer_id text,
      storage_path text,
      file_name text,
      mime_type text
    );
  end if;

  return v_asset_id;
end;
$$;

grant execute on function public.upsert_admin_asset_bundle(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 바이트를 바꾸지 않는 수정도 한 트랜잭션으로.
--
-- 제목·활성 여부·말풍선 조정값만 고치는 경로다. Storage를 건드리지 않으므로 catalog 포인터는
-- **유지한다** — 여기서 끊으면 내용이 그대로인 에셋이 export에서 legacy 경로로 떨어진다.
--
-- 모든 선택 인자는 "주지 않으면 건드리지 않는다"는 뜻이다. 특히 `p_targets`가 NULL일 때
-- target을 지우면, 제목만 고치려던 요청이 적용 범위를 날려 버린다.
-- ---------------------------------------------------------------------------
create or replace function public.update_admin_asset_metadata(
  p_asset_id uuid,
  p_title text,
  p_enabled boolean default null,
  p_bubble_adjustment jsonb default null,
  p_targets jsonb default null,
  p_bubble_spec jsonb default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_asset_id is null then
    raise exception 'INVALID_ASSET_ID';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' or length(v_title) > 100 then
    raise exception 'INVALID_ASSET_TITLE';
  end if;

  update public.admin_assets set
    title = v_title,
    enabled = coalesce(p_enabled, enabled),
    bubble_adjustment = coalesce(p_bubble_adjustment, bubble_adjustment)
  where id = p_asset_id;

  if not found then
    raise exception 'ASSET_NOT_FOUND';
  end if;

  if p_targets is not null then
    delete from public.admin_asset_targets where asset_id = p_asset_id;
    insert into public.admin_asset_targets (asset_id, platform, slot_role, target_kind, priority, enabled)
    select
      p_asset_id,
      target.platform,
      target.slot_role,
      target.target_kind,
      coalesce(target.priority, 0),
      coalesce(target.enabled, true)
    from jsonb_to_recordset(p_targets) as target(
      platform text,
      slot_role text,
      target_kind text,
      priority integer,
      enabled boolean
    );
  end if;

  if p_bubble_spec is not null then
    delete from public.admin_asset_bubble_specs where asset_id = p_asset_id;
    insert into public.admin_asset_bubble_specs (asset_id, android_markers, ios_insets, ios_stretch, geometry)
    values (
      p_asset_id,
      p_bubble_spec -> 'android_markers',
      p_bubble_spec -> 'ios_insets',
      p_bubble_spec -> 'ios_stretch',
      nullif(p_bubble_spec -> 'geometry', 'null'::jsonb)
    );

    -- 사람이 직접 좌표를 고쳤다는 뜻이므로, 빌더가 다시 생성할 때 덮어쓰지 않도록 표시한다.
    update public.admin_asset_bubble_designs set geometry_mode = 'manual' where asset_id = p_asset_id;
  end if;

  return p_asset_id;
end;
$$;

grant execute on function public.update_admin_asset_metadata(uuid, text, boolean, jsonb, jsonb, jsonb) to authenticated;
