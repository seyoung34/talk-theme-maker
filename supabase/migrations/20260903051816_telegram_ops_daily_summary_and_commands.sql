-- Server-only daily operations summaries used by the scheduled Telegram report and read-only
-- operator commands. The summary is deliberately aggregate-only: no email, title, payload, or
-- payment/provider identifier crosses this database boundary.

-- Keep the aggregate queries index-friendly as the service grows. These are all append-oriented
-- timestamps or low-cardinality status filters, so the partial indexes stay small.
create index if not exists profiles_created_at_ops_idx
on public.profiles (created_at);

create index if not exists payments_paid_at_ops_idx
on public.payments (paid_at)
where status = 'paid' and paid_at is not null;

create index if not exists payments_updated_at_ops_idx
on public.payments (updated_at, status);

create index if not exists payments_refunded_at_ops_idx
on public.payments (refunded_at)
where refund_status = 'refunded' and refunded_at is not null;

create index if not exists export_jobs_completed_at_ops_idx
on public.export_jobs (completed_at, status)
where completed_at is not null;

create index if not exists inquiries_created_at_ops_idx
on public.inquiries (created_at);

create index if not exists ops_events_occurred_at_severity_idx
on public.ops_events (occurred_at, severity);

create index if not exists ops_notification_deliveries_updated_at_status_idx
on public.ops_notification_deliveries (updated_at, status);

-- `ops` is the source for generated operational reports. Existing event sources remain unchanged.
alter table public.ops_events
  drop constraint if exists ops_events_source_check;

alter table public.ops_events
  add constraint ops_events_source_check
  check (source in ('export', 'billing', 'runtime', 'admin', 'ops'));

-- Keep the service-role RPC validation aligned with the table check above. This replacement also
-- retains the closed event/entity vocabularies introduced by the previous hardening migration.
create or replace function public.enqueue_ops_event(
  p_event_id text,
  p_event_type text,
  p_severity text,
  p_source text,
  p_entity_kind text,
  p_entity_id text,
  p_payload jsonb,
  p_dedupe_key text,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  inserted boolean;
begin
  if p_event_type is null or p_event_type not in (
    'export.enqueue_failed',
    'export.failed',
    'export.watchdog_timeout',
    'export.failure_spike',
    'billing.webhook_rejected',
    'billing.webhook_processing_failed',
    'billing.refund_failed',
    'runtime.health_failed',
    'admin.template_published',
    'ops.daily_summary'
  ) then
    raise exception 'invalid_ops_event_type';
  end if;

  if p_entity_kind is not null and p_entity_kind not in ('export_job', 'payment', 'template', 'runtime') then
    raise exception 'invalid_ops_entity_kind';
  end if;

  if p_severity is null or p_severity not in ('P1', 'P2', 'P3') then
    raise exception 'invalid_ops_severity';
  end if;

  if p_source is null or p_source not in ('export', 'billing', 'runtime', 'admin', 'ops') then
    raise exception 'invalid_ops_source';
  end if;

  insert into public.ops_events (
    event_id, event_type, severity, source, entity_kind, entity_id, payload, dedupe_key, occurred_at
  ) values (
    p_event_id,
    p_event_type,
    p_severity,
    p_source,
    p_entity_kind,
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb),
    p_dedupe_key,
    p_occurred_at
  )
  on conflict (event_id) do nothing;

  inserted := found;

  insert into public.ops_notification_deliveries (event_id, channel)
  values (p_event_id, 'telegram')
  on conflict (event_id, channel) do nothing;

  return case when inserted then 'inserted' else 'duplicate' end;
end;
$$;

-- Aggregate one KST calendar interval. The caller passes UTC instants corresponding to the KST
-- day boundaries; half-open bounds prevent an event at midnight from appearing twice.
create or replace function public.get_ops_daily_summary(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  signups bigint,
  payments_paid bigint,
  payments_paid_amount bigint,
  payment_failures bigint,
  refunds_count bigint,
  refunds_amount bigint,
  refunds_review_required bigint,
  exports_succeeded bigint,
  exports_failed bigint,
  exports_pending bigint,
  new_inquiries bigint,
  open_inquiries bigint,
  p1_issues bigint,
  p2_issues bigint,
  dead_letter_notifications bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid_ops_summary_range';
  end if;

  return query
  select
    (select count(*)
     from public.profiles p
     where p.created_at >= p_start and p.created_at < p_end),
    (select count(*)
     from public.payments pay
     where pay.status = 'paid'
       and pay.paid_at is not null
       and pay.paid_at >= p_start and pay.paid_at < p_end),
    (select coalesce(sum(pay.amount), 0)::bigint
     from public.payments pay
     where pay.status = 'paid'
       and pay.paid_at is not null
       and pay.paid_at >= p_start and pay.paid_at < p_end),
    (select count(*)
     from public.payments pay
     where pay.status in ('failed', 'canceled')
       and pay.updated_at >= p_start and pay.updated_at < p_end),
    (select count(*)
     from public.payments pay
     where pay.refund_status = 'refunded'
       and pay.refunded_at is not null
       and pay.refunded_at >= p_start and pay.refunded_at < p_end),
    (select coalesce(sum(pay.refund_amount), 0)::bigint
     from public.payments pay
     where pay.refund_status = 'refunded'
       and pay.refunded_at is not null
       and pay.refunded_at >= p_start and pay.refunded_at < p_end),
    (select count(*)
     from public.payments pay
     where pay.refund_status = 'review_required'
       and pay.updated_at >= p_start and pay.updated_at < p_end),
    (select count(*)
     from public.export_jobs e
     where e.status = 'succeeded'
       and e.completed_at is not null
       and e.completed_at >= p_start and e.completed_at < p_end),
    (select count(*)
     from public.export_jobs e
     where e.status = 'failed'
       and e.completed_at is not null
       and e.completed_at >= p_start and e.completed_at < p_end),
    (select count(*)
     from public.export_jobs e
     where e.status = 'pending'),
    (select count(*)
     from public.inquiries i
     where i.created_at >= p_start and i.created_at < p_end),
    (select count(*)
     from public.inquiries i
     where i.status in ('open', 'answered')),
    (select count(*)
     from public.ops_events e
     where e.severity = 'P1'
       and e.occurred_at >= p_start and e.occurred_at < p_end),
    (select count(*)
     from public.ops_events e
     where e.severity = 'P2'
       and e.occurred_at >= p_start and e.occurred_at < p_end),
    (select count(*)
     from public.ops_notification_deliveries d
     where d.status = 'dead_letter'
       and d.updated_at >= p_start and d.updated_at < p_end);
end;
$$;

-- A compact current-state snapshot for /status and /health. It intentionally omits payloads and
-- identifiers so the command path cannot accidentally disclose customer data.
create or replace function public.get_ops_status_snapshot()
returns table (
  pending_exports bigint,
  stale_exports bigint,
  pending_notifications bigint,
  retry_notifications bigint,
  dead_letter_notifications bigint,
  open_inquiries bigint,
  billing_holds bigint,
  last_p1_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    (select count(*) from public.export_jobs e where e.status = 'pending'),
    (select count(*)
     from public.export_jobs e
     where e.status = 'pending'
       and e.created_at <= now() - interval '15 minutes'),
    (select count(*)
     from public.ops_notification_deliveries d
     where d.status in ('pending', 'sending')),
    (select count(*)
     from public.ops_notification_deliveries d
     where d.status = 'retry'),
    (select count(*)
     from public.ops_notification_deliveries d
     where d.status = 'dead_letter'),
    (select count(*) from public.inquiries i where i.status in ('open', 'answered')),
    (select count(*) from public.credit_balances b where b.billing_hold = true),
    (select max(e.occurred_at) from public.ops_events e where e.severity = 'P1');
$$;

revoke all on function public.enqueue_ops_event(text, text, text, text, text, text, jsonb, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.enqueue_ops_event(text, text, text, text, text, text, jsonb, text, timestamptz)
to service_role;

revoke all on function public.get_ops_daily_summary(timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.get_ops_daily_summary(timestamptz, timestamptz)
to service_role;

revoke all on function public.get_ops_status_snapshot() from public, anon, authenticated;
grant execute on function public.get_ops_status_snapshot() to service_role;
