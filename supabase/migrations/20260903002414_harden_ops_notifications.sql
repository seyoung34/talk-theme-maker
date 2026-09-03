-- Harden the Telegram outbox and make billing alerts part of the webhook transaction.

-- The application and formatter treat these fields as closed vocabularies. Keep the database
-- boundary closed too, including writes made directly with the service role.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ops_events_event_type_check'
      and conrelid = 'public.ops_events'::regclass
  ) then
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
        'ops.daily_summary'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ops_events_entity_kind_check'
      and conrelid = 'public.ops_events'::regclass
  ) then
    alter table public.ops_events
      add constraint ops_events_entity_kind_check
      check (entity_kind is null or entity_kind in ('export_job', 'payment', 'template', 'runtime'));
  end if;
end;
$$;

-- Validate before attempting the insert so callers receive a stable contract error instead of a
-- lower-level constraint violation. The CHECK constraints above remain the direct-write guard.
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

  if p_source is null or p_source not in ('export', 'billing', 'runtime', 'admin') then
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

-- A batch of 20 messages can spend 100 seconds at the Telegram request timeout alone. Keep the
-- default lease comfortably beyond that maximum so an overlapping drain cannot reclaim live work.
create or replace function public.claim_ops_notification_batch(
  p_limit integer default 10,
  p_lease_seconds integer default 180
)
returns table (
  event_id text,
  event_type text,
  severity text,
  source text,
  entity_kind text,
  entity_id text,
  payload jsonb,
  dedupe_key text,
  occurred_at timestamptz,
  attempt_count integer,
  lease_id uuid
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  return query
  with candidates as (
    select d.event_id, d.channel
    from public.ops_notification_deliveries d
    where d.channel = 'telegram'
      and (
        (d.status in ('pending', 'retry') and d.next_attempt_at <= now())
        or (d.status = 'sending' and d.lease_expires_at < now())
      )
    order by d.next_attempt_at, d.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  ), claimed as (
    update public.ops_notification_deliveries d
    set
      status = 'sending',
      attempt_count = d.attempt_count + 1,
      lease_id = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 180), 10))
    from candidates c
    where d.event_id = c.event_id
      and d.channel = c.channel
    returning d.event_id, d.attempt_count, d.lease_id
  )
  select
    e.event_id,
    e.event_type,
    e.severity,
    e.source,
    e.entity_kind,
    e.entity_id,
    e.payload,
    e.dedupe_key,
    e.occurred_at,
    c.attempt_count,
    c.lease_id
  from claimed c
  join public.ops_events e on e.event_id = c.event_id;
end;
$$;

-- Return whether this invocation actually changed a pending job. The existing fail_export_job RPC
-- remains the single place that performs the refund; this wrapper serializes the check with that
-- transition so watchdog callers cannot mistake an already-settled job for their own failure.
create or replace function public.fail_export_job_if_pending(
  p_user_id uuid,
  p_export_job_id uuid,
  p_error_code text,
  p_error_message text,
  p_duration_ms integer
)
returns table (transitioned boolean, status text, balance integer)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  job_row public.export_jobs%rowtype;
  final_status text;
  current_balance integer;
begin
  select * into job_row
  from public.export_jobs
  where id = p_export_job_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'export_job_not_found';
  end if;

  if job_row.status <> 'pending' then
    select cb.balance into current_balance
    from public.credit_balances cb
    where cb.user_id = p_user_id;
    return query select false, job_row.status, coalesce(current_balance, 0);
    return;
  end if;

  perform public.fail_export_job(
    p_user_id,
    p_export_job_id,
    p_error_code,
    p_error_message,
    p_duration_ms
  );

  select ej.status, cb.balance
  into final_status, current_balance
  from public.export_jobs ej
  left join public.credit_balances cb on cb.user_id = ej.user_id
  where ej.id = p_export_job_id;

  return query select true, final_status, coalesce(current_balance, 0);
end;
$$;

-- The webhook processor updates groble_webhook_events and the trigger inserts the operational
-- outbox row in the same transaction. If the outbox write fails, the payment/status update rolls
-- back and Groble receives a retryable 500 from the route instead of a silently lost alert.
create or replace function public.enqueue_groble_webhook_processing_ops_event()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  result text := new.processing_status;
  event_id text;
  dedupe_key text;
  summary text;
begin
  if old.processing_status is not distinct from new.processing_status
    or result not in ('rejected', 'review_required') then
    return new;
  end if;

  summary := case
    when result = 'review_required' then '결제 이벤트가 운영자 검토 상태가 되었습니다.'
    else '결제 웹훅 정산이 거절되었습니다.'
  end;
  event_id := left(
    regexp_replace(
      format('billing.webhook_processing_failed:%s:%s', new.event_id, result),
      '[^a-zA-Z0-9._:-]+', '_', 'g'
    ),
    240
  );
  dedupe_key := left(
    regexp_replace(
      format('billing:webhook:%s:%s', new.event_id, result),
      '[^a-zA-Z0-9._:-]+', '_', 'g'
    ),
    240
  );

  perform public.enqueue_ops_event(
    event_id,
    'billing.webhook_processing_failed',
    case when result = 'review_required' then 'P1' else 'P2' end,
    'billing',
    null,
    null,
    jsonb_build_object(
      'summary', summary,
      'details', jsonb_build_object(
        'providerEventId', new.event_id,
        'providerEventType', coalesce(new.event_type, 'unknown'),
        'result', result
      ),
      'adminPath', '/admin'
    ),
    dedupe_key,
    new.occurred_at
  );

  return new;
end;
$$;

drop trigger if exists enqueue_groble_webhook_processing_ops_event on public.groble_webhook_events;
create trigger enqueue_groble_webhook_processing_ops_event
after update of processing_status on public.groble_webhook_events
for each row
when (
  new.processing_status in ('rejected', 'review_required')
  and old.processing_status is distinct from new.processing_status
)
execute function public.enqueue_groble_webhook_processing_ops_event();

revoke all on function public.enqueue_ops_event(text, text, text, text, text, text, jsonb, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.enqueue_ops_event(text, text, text, text, text, text, jsonb, text, timestamptz)
to service_role;

revoke all on function public.claim_ops_notification_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ops_notification_batch(integer, integer) to service_role;

revoke all on function public.fail_export_job_if_pending(uuid, uuid, text, text, integer)
from public, anon, authenticated;
grant execute on function public.fail_export_job_if_pending(uuid, uuid, text, text, integer) to service_role;

revoke all on function public.enqueue_groble_webhook_processing_ops_event() from public, anon, authenticated;
grant execute on function public.enqueue_groble_webhook_processing_ops_event() to service_role;
