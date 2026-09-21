-- Add operator Telegram notifications for newly opened inquiries and user follow-ups.
-- Inquiry bodies and titles stay out of the ops payload; the event carries only identifiers,
-- category metadata, and an internal admin link.

alter table public.ops_events
  drop constraint if exists ops_events_event_type_check;

alter table public.ops_events
  add constraint ops_events_event_type_check
  check (event_type in (
    'export.enqueue_failed',
    'export.failed',
    'export.watchdog_timeout',
    'export.failure_spike',
    'billing.webhook_rejected',
    'billing.webhook_processing_failed',
    'billing.refund_failed',
    'runtime.health_failed',
    'admin.template_published',
    'inquiry.created',
    'inquiry.user_replied',
    'ops.daily_summary'
  ));

alter table public.ops_events
  drop constraint if exists ops_events_entity_kind_check;

alter table public.ops_events
  add constraint ops_events_entity_kind_check
  check (entity_kind is null or entity_kind in ('export_job', 'payment', 'template', 'runtime', 'inquiry'));

-- Keep the service-role RPC validation aligned with the table checks. Existing event types and
-- sources remain valid; only inquiry event/entity values are added.
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
    'inquiry.created',
    'inquiry.user_replied',
    'ops.daily_summary'
  ) then
    raise exception 'invalid_ops_event_type';
  end if;

  if p_entity_kind is not null and p_entity_kind not in ('export_job', 'payment', 'template', 'runtime', 'inquiry') then
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

revoke all on function public.enqueue_ops_event(text, text, text, text, text, text, jsonb, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.enqueue_ops_event(text, text, text, text, text, text, jsonb, text, timestamptz)
to service_role;
