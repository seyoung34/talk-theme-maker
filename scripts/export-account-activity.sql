-- Edit only this typed date literal: NULL uses yesterday in Korea.
-- Example: DATE '2026-10-29'. A malformed/nonexistent date is rejected by PostgreSQL.
with input as (
  select null::date as requested_end_date
), clock as (
  select (statement_timestamp() at time zone 'Asia/Seoul')::date as today_kst
), bounds as (
  select coalesce(input.requested_end_date, clock.today_kst - 1) as end_date,
         clock.today_kst
  from input cross join clock
), valid_window as (
  select end_date - 29 as start_date, end_date, today_kst
  from bounds
  where end_date <= today_kst
), activity as (
  select (j.created_at at time zone 'Asia/Seoul')::date as activity_date, j.user_id
  from public.export_jobs j cross join valid_window w
  where j.created_at >= (w.start_date::timestamp at time zone 'Asia/Seoul')
    and j.created_at < ((w.end_date + 1)::timestamp at time zone 'Asia/Seoul')
    and not exists (select 1 from public.admin_profiles a where a.user_id = j.user_id)
), daily_counts as (
  select activity_date, count(distinct user_id) as accounts
  from activity group by activity_date
), totals as (
  select count(distinct user_id) as accounts from activity
), daily as (
  select d::date as activity_date, coalesce(c.accounts, 0) as accounts
  from valid_window w
  cross join lateral generate_series(w.start_date::timestamp, w.end_date::timestamp, interval '1 day') d
  left join daily_counts c on c.activity_date = d::date
)
select case when b.end_date > b.today_kst then 'end_date must not be after today in Asia/Seoul' end as validation_error,
       'export request accounts; all statuses; current admins excluded' as metric,
       'Asia/Seoul' as timezone,
       w.start_date, w.end_date, 30 as window_days,
       w.end_date = w.today_kst as partial_end_day,
       (select accounts from daily where activity_date = w.end_date) as end_day_accounts,
       case when w.end_date is not null then t.accounts end as window_distinct_accounts,
       (select accounts from daily where activity_date = w.end_date)::numeric / nullif(t.accounts, 0) as end_day_to_window_ratio,
       (select jsonb_agg(jsonb_build_object('date', activity_date, 'accounts', accounts) order by activity_date) from daily) as daily_accounts
from bounds b left join valid_window w on true cross join totals t;
