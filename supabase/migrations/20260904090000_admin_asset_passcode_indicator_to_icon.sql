-- 암호 표시 이미지는 별도 분류를 만들지 않고 일반 아이콘 후보를 함께 사용한다.
-- 기존 passcode_indicator 행을 icon으로 옮긴 뒤 제약에서 레거시 값을 제거한다.
alter table public.admin_assets
drop constraint if exists admin_assets_asset_kind_check;

update public.admin_assets
set asset_kind = 'icon'
where asset_kind = 'passcode_indicator';

alter table public.admin_assets
add constraint admin_assets_asset_kind_check
check (asset_kind in ('background', 'icon', 'bubble', 'profile', 'launcher', 'passcode'));
