-- 서비스 내 공지사항. 정책 문서와 달리 운영 중 수시로 추가되는 글이라 코드가 아닌 DB에 둔다.
--
-- 공지는 개인정보를 담지 않으므로 계정 삭제 RPC와 무관하다. 작성자만 auth.users를 참조하는데,
-- 관리자 계정이 사라져도 공지 자체는 남아야 하므로 on delete set null 이다.

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 20000),
  category text not null default 'etc'
    check (category in ('update', 'maintenance', 'policy', 'etc')),
  pinned boolean not null default false,
  -- null이면 비공개 초안. 미래 시각이면 그 시각까지 노출되지 않는다.
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notices is
  'Service announcements shown at /notice. Contains no personal data and is unaffected by account deletion.';

-- 공개 목록은 항상 "발행됨 + 고정 우선 + 최신순"으로만 읽는다.
create index if not exists notices_published_idx
on public.notices (pinned desc, published_at desc)
where published_at is not null;

drop trigger if exists touch_notices on public.notices;
create trigger touch_notices
before update on public.notices
for each row execute function public.touch_updated_at();

alter table public.notices enable row level security;

grant select on public.notices to anon, authenticated;
grant insert, update, delete on public.notices to authenticated;

-- 초안과 예약 발행분은 관리자에게만 보인다. anon도 읽어야 하므로 to anon, authenticated 다.
drop policy if exists "Public reads published notices" on public.notices;
create policy "Public reads published notices"
on public.notices
for select
to anon, authenticated
using (published_at is not null and published_at <= now());

drop policy if exists "Admins manage notices" on public.notices;
create policy "Admins manage notices"
on public.notices
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
