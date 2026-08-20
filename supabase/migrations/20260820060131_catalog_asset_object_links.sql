-- 3트랙 에셋 저장소 — 추천 에셋과 현재 catalog revision을 명시적으로 연결한다.
--
-- 파일명·MIME은 같은 경로에 새 바이트를 덮어쓸 때 바뀌지 않을 수 있다. 추천 API가
-- 그 두 값만 비교하면 예전 registry object가 새 Supabase 에셋에 붙는다. canonical은
-- admin_assets.asset_object_id, 플랫폼 variant는 이 컬럼으로 현재 registry object를 가리킨다.
-- 연결이 없는 항목은 catalog ref를 만들지 않고 기존 field 경로를 사용한다.

alter table public.admin_asset_variants
  add column if not exists asset_object_id uuid
    references public.theme_asset_objects(id) on delete set null;

create index if not exists admin_asset_variants_asset_object_id_idx
on public.admin_asset_variants (asset_object_id)
where asset_object_id is not null;

comment on column public.admin_assets.asset_object_id is
  'The active catalog object whose bytes match the current canonical admin asset.';
comment on column public.admin_asset_variants.asset_object_id is
  'The active catalog object whose bytes match the current platform variant.';

-- 기존 backfill 행 중 registry가 admin asset보다 나중에 만들어진 경우만 연결한다.
-- 관리자가 그 뒤에 같은 Storage 경로를 교체했다면 연결하지 않아 stale catalog export를
-- 일으키지 않고 legacy field 경로로 안전하게 남긴다. 다음 publisher 성공 시 새 링크가 생긴다.
update public.admin_assets as asset
set asset_object_id = object.id
from public.theme_asset_objects as object
where asset.asset_object_id is null
  and object.logical_asset_id = 'admin:' || asset.id::text
  and object.variant_key = 'canonical'
  and object.status = 'active'
  and asset.updated_at <= object.created_at;
