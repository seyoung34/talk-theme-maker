-- 잠금화면 표시(passcode_indicator_1~4, checked 포함)는 3:4 전체 배경 이미지(passcode_background)와
-- 모양·용도가 전혀 다른 작은 정사각형 아이콘이다. 지금까지 둘 다 'passcode' kind를 같이 써서,
-- 관리자가 인디케이터용 대체 아이콘을 여러 개 올려도 슬롯끼리 후보를 공유하지 못했고(탭 아이콘과
-- 달리 exact_role만 매칭), 가이던스 문구도 배경 이미지에 "정사각형 권장"을 잘못 띄웠다.
-- 'passcode'는 배경 전용으로 좁히고, 인디케이터는 'passcode_indicator'로 분리한다.
alter table public.admin_assets
drop constraint if exists admin_assets_asset_kind_check;

alter table public.admin_assets
add constraint admin_assets_asset_kind_check
check (asset_kind in ('background', 'icon', 'bubble', 'profile', 'launcher', 'passcode', 'passcode_indicator'));

-- 기존에 'passcode'로 저장된 인디케이터 행을 새 kind로 옮겨, 이미 등록된 대체 아이콘도
-- 슬롯 간 공유 후보 노출을 바로 받게 한다.
--
-- 판단 기준은 행 자신의 `slot_role`뿐이다. `admin_asset_targets`의 slot_role까지 훑으면
-- 배경 이미지 행이 어쩌다 인디케이터 target을 갖고 있을 때 3:4 배경을 인디케이터로 잘못
-- 바꾼다 — 되돌리기 어려운 방향의 오분류다. `slot_role`은 not null이고 저장 경로가 자기
-- 슬롯 기준 exact_role target을 만들므로, 이 조건만으로 실제 데이터가 모두 덮인다.
update public.admin_assets
set asset_kind = 'passcode_indicator'
where asset_kind = 'passcode'
  and slot_role like 'passcode_indicator%';
