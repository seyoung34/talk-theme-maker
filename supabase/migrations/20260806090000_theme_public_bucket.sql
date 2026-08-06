-- 갤러리 카드 썸네일용 공개 버킷.
--
-- 카드 썸네일은 `/template` 갤러리에 그대로 노출되는 합성 미리보기다. 그런데 비공개 버킷에
-- 두고 10분짜리 서명 URL로 내보내고 있었다. 갤러리는 마운트 시 한 번 URL을 받아 계속 들고
-- 있으므로, 탭을 10분 넘게 열어 두면 썸네일이 전부 깨졌다.
--
-- 보호할 이유가 없는 이미지를 서명으로 감싸느라 생긴 문제다. 공개 버킷으로 옮기면 URL이
-- 영구히 유효하고 서명 왕복도 사라진다.
--
-- 원본 에셋(배경·말풍선·프로필)은 `theme-assets`(비공개)에 그대로 둔다. 그쪽은 내보내기
-- 결과물에 들어가는 실제 재료라 앱을 거치지 않고 받아갈 수 있으면 안 된다.

insert into storage.buckets (id, name, public)
values ('theme-public', 'theme-public', true)
on conflict (id) do update set public = excluded.public;

-- 읽기는 버킷의 public 플래그가 처리한다. 쓰기만 관리자로 제한한다.
drop policy if exists "Admins manage public theme objects" on storage.objects;
create policy "Admins manage public theme objects"
on storage.objects
for all
to authenticated
using (bucket_id = 'theme-public' and public.is_admin())
with check (bucket_id = 'theme-public' and public.is_admin());
