-- 결제 완료 주차를 updated_at으로 계산하면 중복 콜백이나 사후 payload 갱신으로
-- 이미 완료된 결제가 다른 주차로 이동할 수 있다. 최초 paid 전환 시각을 별도로 보존한다.

alter table public.payments
  add column if not exists paid_at timestamptz;

-- 기존 데이터는 최초 승인 시각을 알 수 없으므로 당시 사용하던 updated_at을 임시 기준으로
-- 채운다. 이후 신규 결제부터는 트리거가 paid 전환 순간을 기록한다.
update public.payments
set paid_at = updated_at
where status = 'paid'
  and paid_at is null;

create or replace function public.set_payment_paid_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'paid' then
    if tg_op = 'INSERT' then
      -- 호출자가 임의의 과거 시각을 주입하지 못하게 승인 시각은 DB의 현재 시각으로만 정한다.
      new.paid_at = now();
    elsif old.status is distinct from 'paid' then
      new.paid_at = coalesce(old.paid_at, now());
    elsif new.paid_at is null then
      -- 기존 paid 행을 갱신할 때도 완료 시각이 비어 있지 않도록 보정한다.
      new.paid_at = coalesce(old.paid_at, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_payment_paid_at on public.payments;
create trigger set_payment_paid_at
before insert or update on public.payments
for each row execute function public.set_payment_paid_at();

revoke all on function public.set_payment_paid_at() from public, anon, authenticated;

-- 주간 집계는 결제 완료 시각을 사용한다. 함수의 공개 권한은 직전 hardening migration의
-- service_role 전용 정책을 유지한다.
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
      where pay.status = 'paid' and pay.paid_at is not null
        and date_trunc('week', (pay.paid_at at time zone 'Asia/Seoul'))::date = w.week_start)
  from weeks w
  order by w.week_start;
$$;

revoke all on function public.marketing_weekly_summary(integer) from public, anon, authenticated;
grant execute on function public.marketing_weekly_summary(integer) to service_role;

-- 테스트로 남은 hits = 0 행은 캠페인 목록에 빈 항목을 만들지 않게 한다.
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
    and h.hits > 0
  group by 1, 2
  order by 1;
$$;

revoke all on function public.marketing_weekly_clicks(integer) from public, anon, authenticated;
grant execute on function public.marketing_weekly_clicks(integer) to service_role;
