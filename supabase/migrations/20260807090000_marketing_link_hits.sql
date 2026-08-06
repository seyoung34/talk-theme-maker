-- 홍보 링크 클릭 집계.
--
-- GA4 는 분석 쿠키에 동의한 방문자만 센다. 거부하거나 배너를 무시한 사람은 유입조차 남지
-- 않아, 어느 채널이 실제로 통했는지 판단할 수 없다.
--
-- 이 테이블은 **개인을 식별하지 않으므로 동의 대상이 아니다.** 동의가 필요한 이유는 이용자
-- 단말에 식별자를 저장하기 때문인데, 여기서는 아무것도 저장하지 않고 하루치 칸의 숫자만
-- 올린다. 되짚어 개인을 특정할 방법이 구조적으로 없다.
--
-- 그래서 **다음은 절대 넣지 않는다.**
--
--   IP 주소        개인정보다. 저장하면 처리방침 수정 대상이 된다.
--   User-Agent     조합하면 식별 가능해진다.
--   세션·쿠키 ID    이걸 쓰는 순간 동의가 필요해진다.
--   정확한 시각     일 단위까지만 남긴다.
--
-- 이 선을 넘는 컬럼을 추가하려면 개인정보 처리방침부터 고쳐야 한다.

create table if not exists public.marketing_link_hits (
  day date not null,
  code text not null check (length(btrim(code)) between 1 and 32),
  source text not null,
  medium text not null,
  campaign text not null,
  hits integer not null default 0 check (hits >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, code)
);

comment on table public.marketing_link_hits is
  'Daily click counters for /r/<code> promo links. Aggregate only — carries no visitor identifier, IP or user agent.';

create index if not exists marketing_link_hits_campaign_idx
on public.marketing_link_hits (campaign, day desc);

-- ---------------------------------------------------------------------------
-- 클릭 1건 기록.
--
-- 리다이렉트 라우트가 요청마다 부른다. `security definer` 로 감싸 익명 사용자도 호출할 수
-- 있게 하되, 테이블 자체에는 어떤 권한도 주지 않는다. 즉 **증가만 가능하고 조회·수정·삭제는
-- 불가능**하다. 누가 이 함수를 반복 호출해도 얻는 것이 없고, 값을 되돌릴 수도 없다.
--
-- source·medium·campaign 은 서버의 링크 대장에서 오는 값이라 임의 문자열이 들어올 수 없지만,
-- 저장 자체가 값을 신뢰하지 않도록 코드 길이를 제약으로 막아 둔다.
-- ---------------------------------------------------------------------------
create or replace function public.record_marketing_link_hit(
  p_code text,
  p_source text,
  p_medium text,
  p_campaign text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.marketing_link_hits (day, code, source, medium, campaign, hits)
  values ((now() at time zone 'Asia/Seoul')::date, p_code, p_source, p_medium, p_campaign, 1)
  on conflict (day, code) do update
    set hits = public.marketing_link_hits.hits + 1,
        updated_at = now();
end;
$$;

revoke all on function public.record_marketing_link_hit(text, text, text, text) from public;
grant execute on function public.record_marketing_link_hit(text, text, text, text) to anon, authenticated, service_role;

alter table public.marketing_link_hits enable row level security;

-- 집계 조회는 관리자만. 정책만으로는 부족해서 grant 도 함께 준다(이 프로젝트의 service_role 은
-- DML 을 상속하지 않는다).
grant select on public.marketing_link_hits to authenticated;
grant select, insert, update on public.marketing_link_hits to service_role;

drop policy if exists "Admins read marketing link hits" on public.marketing_link_hits;
create policy "Admins read marketing link hits"
on public.marketing_link_hits
for select
to authenticated
using (public.is_admin());
