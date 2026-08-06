-- 홍보 클릭 집계의 리뷰 지적 반영.
--
-- 1. 기록 RPC 가 anon·authenticated 에게 열려 있었다. 누구나 REST 로 직접 호출해 임의 캠페인의
--    수치를 만들 수 있었다. 리다이렉트 라우트는 service_role 로 호출하므로 공개 권한이 필요 없다.
-- 2. 중복 키가 (day, code) 라 같은 날 캠페인을 바꾸면 옛 캠페인 행의 숫자만 계속 올랐다.
-- 3. 주간 전환 집계를 앱에서 세다 보니 Data API 의 1000행 제한에 걸릴 수 있었고, 조회 시작점이
--    UTC 라 한국 시간 월요일 오전 구간이 첫 주에서 빠졌다. 집계를 SQL 로 내린다.

-- ---------------------------------------------------------------------------
-- 1. 공개 실행 권한 회수
-- ---------------------------------------------------------------------------
revoke execute on function public.record_marketing_link_hit(text, text, text, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. 캠페인이 바뀌면 새 칸에 쌓이게 한다.
--
-- 코드를 그대로 두고 캠페인만 옮기는 것이 이 체계의 전제다(인스타 링크를 다시 올리지 않기
-- 위해). 그런데 중복 키에 캠페인이 없으면 전환 당일의 클릭이 옛 캠페인에 계속 붙는다.
-- source·medium 도 같은 이유로 키에 넣는다.
-- ---------------------------------------------------------------------------
alter table public.marketing_link_hits drop constraint if exists marketing_link_hits_pkey;
alter table public.marketing_link_hits
  add constraint marketing_link_hits_pkey primary key (day, code, source, medium, campaign);

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
  on conflict (day, code, source, medium, campaign) do update
    set hits = public.marketing_link_hits.hits + 1,
        updated_at = now();
end;
$$;

revoke all on function public.record_marketing_link_hit(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_marketing_link_hit(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. 주간 집계를 SQL 에서 끝낸다.
--
-- 앱에서 행을 다 받아 세면 Data API 의 1000행 제한에 걸려 **조용히 적게** 나온다. 오류가 아니라
-- 숫자가 작아지는 형태라 알아채기 어렵다.
--
-- 주 경계와 조회 범위를 모두 Asia/Seoul 로 계산한다. 한쪽만 서울 기준이면 한국 시간 월요일
-- 오전 0~9 시 구간이 첫 주에서 빠진다.
--
-- 전환은 **완료 시각** 기준이다. 일요일에 신청해 월요일에 끝난 내보내기는 월요일 주에 속해야
-- 한다. 결제도 승인된 시각(updated_at)으로 센다 — 별도 완료 컬럼이 없다.
-- ---------------------------------------------------------------------------
create or replace function public.marketing_weekly_summary(p_weeks integer default 8)
returns table (
  week_start date,
  signups bigint,
  exports_completed bigint,
  payments_paid bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with weeks as (
    select generate_series(
      date_trunc('week', (now() at time zone 'Asia/Seoul')) - make_interval(weeks => greatest(p_weeks, 1) - 1),
      date_trunc('week', (now() at time zone 'Asia/Seoul')),
      interval '1 week'
    )::date as week_start
  )
  select
    w.week_start,
    (select count(*) from public.profiles p
      where date_trunc('week', (p.created_at at time zone 'Asia/Seoul'))::date = w.week_start),
    (select count(*) from public.export_jobs e
      where e.status = 'succeeded' and e.completed_at is not null
        and date_trunc('week', (e.completed_at at time zone 'Asia/Seoul'))::date = w.week_start),
    (select count(*) from public.payments pay
      where pay.status = 'paid'
        and date_trunc('week', (pay.updated_at at time zone 'Asia/Seoul'))::date = w.week_start)
  from weeks w
  order by w.week_start;
$$;

revoke all on function public.marketing_weekly_summary(integer) from public, anon, authenticated;
grant execute on function public.marketing_weekly_summary(integer) to service_role;

-- 클릭도 같은 이유로 SQL 에서 주별로 접는다.
create or replace function public.marketing_weekly_clicks(p_weeks integer default 8)
returns table (week_start date, campaign text, clicks bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    date_trunc('week', h.day::timestamp)::date as week_start,
    h.campaign,
    sum(h.hits)::bigint
  from public.marketing_link_hits h
  where h.day >= (date_trunc('week', (now() at time zone 'Asia/Seoul')) - make_interval(weeks => greatest(p_weeks, 1) - 1))::date
  group by 1, 2
  order by 1;
$$;

revoke all on function public.marketing_weekly_clicks(integer) from public, anon, authenticated;
grant execute on function public.marketing_weekly_clicks(integer) to service_role;
