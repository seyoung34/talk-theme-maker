-- 목록 비공개는 별도 공유 경로가 없어 비공개와 동일하게 동작했다.
-- 기존 데이터를 먼저 정규화한 뒤 새 값이 저장되지 않도록 제약조건을 좁힌다.
update public.system_template_bundles
set visibility = 'private'
where visibility = 'unlisted';

alter table public.system_template_bundles
drop constraint if exists system_template_bundles_visibility_check;

alter table public.system_template_bundles
add constraint system_template_bundles_visibility_check
check (visibility in ('private', 'public'));
