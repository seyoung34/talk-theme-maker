-- `shape_rule` target 종류 제거 (계획 Phase 4).
--
-- 이 종류는 도입 이후 실제 shape 조건을 가진 적이 없다. 매칭 코드에서 `asset_kind`와 조건이
-- 완전히 같았고(`assetKind === slot.kind`) 순위만 1 대신 2였다. 저장 경로도 이 값을 만들지
-- 않아 새 행이 생길 통로가 없었다.
--
-- 프로덕션 실측: `select count(*) from admin_asset_targets where target_kind = 'shape_rule'` = 0.
-- 남은 행이 없으므로 값 변환 없이 제약만 좁힌다. 남아 있었다면 이 migration은 실패하고,
-- 그때는 `asset_kind`로 UPDATE한 뒤 다시 실행해야 한다 — 조용히 통과시키지 않는 편이 맞다.
--
-- 제약을 함께 좁히는 이유: 코드가 더 이상 해석하지 못하는 값을 DB가 계속 받아들이면, 어떤
-- 경로로든 한 행이 들어오는 순간 그 target은 어느 슬롯에도 매칭되지 않으면서 오류도 내지
-- 않는다. 조용히 적용 범위만 잃는다.

do $$
declare
  v_remaining bigint;
begin
  select count(*) into v_remaining
  from public.admin_asset_targets
  where target_kind = 'shape_rule';

  if v_remaining > 0 then
    raise exception 'shape_rule target이 %건 남아 있습니다. asset_kind로 변환한 뒤 다시 실행하세요.', v_remaining;
  end if;
end
$$;

alter table public.admin_asset_targets
  drop constraint if exists admin_asset_targets_kind_slot_role_check;

alter table public.admin_asset_targets
  drop constraint if exists admin_asset_targets_target_kind_check;

alter table public.admin_asset_targets
  add constraint admin_asset_targets_target_kind_check
  check (target_kind in ('exact_role', 'asset_kind'));

-- `exact_role`만 슬롯을 지정한다. 나머지는 kind 전체가 적용 범위이므로 slot_role이 비어야 한다.
alter table public.admin_asset_targets
  add constraint admin_asset_targets_kind_slot_role_check
  check (
    (target_kind = 'exact_role' and slot_role is not null)
    or (target_kind = 'asset_kind' and slot_role is null)
  );
