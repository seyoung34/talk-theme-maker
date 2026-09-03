-- Server-only operational events and Telegram delivery outbox.
--
-- The tables intentionally remain inaccessible to anon/authenticated. The Worker uses the
-- service role client and the RPCs below; no user-facing API needs to expose this data.

create table if not exists public.ops_events (
  event_id text primary key,
  event_type text not null,
  severity text not null check (severity in ('P1', 'P2', 'P3')),
  source text not null check (source in ('export', 'billing', 'runtime', 'admin')),
  entity_kind text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_notification_deliveries (
  event_id text not null references public.ops_events(event_id) on delete cascade,
  channel text not null check (channel in ('telegram')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'retry', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_id uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, channel)
);

create index if not exists ops_events_dedupe_idx
on public.ops_events (dedupe_key, created_at desc);

create index if not exists ops_notification_deliveries_ready_idx
on public.ops_notification_deliveries (next_attempt_at, created_at)
where status in ('pending', 'retry');

create index if not exists ops_notification_deliveries_lease_idx
on public.ops_notification_deliveries (lease_expires_at)
where status = 'sending';

create or replace function public.touch_ops_notification_delivery_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_ops_notification_deliveries on public.ops_notification_deliveries;
create trigger touch_ops_notification_deliveries
before update on public.ops_notification_deliveries
for each row execute function public.touch_ops_notification_delivery_updated_at();

alter table public.ops_events enable row level security;
alter table public.ops_notification_deliveries enable row level security;

revoke all on public.ops_events from public, anon, authenticated;
revoke all on public.ops_notification_deliveries from public, anon, authenticated;
grant select, insert, update on public.ops_events to service_role;
grant select, insert, update on public.ops_notification_deliveries to service_role;

-- Inserts the canonical event and its Telegram delivery atomically. A deterministic event_id
-- makes repeated status polling and provider retries safe without relying on an application-side
-- read-then-insert race.
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

-- Claims a bounded batch with SKIP LOCKED. Expired leases are claimable so a crashed worker does
-- not leave a delivery stuck forever. The lease_id prevents a late worker from overwriting a newer
-- attempt's result.
create or replace function public.claim_ops_notification_batch(
  p_limit integer default 10,
  p_lease_seconds integer default 60
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
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 60), 10))
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

create or replace function public.mark_ops_notification_sent(
  p_event_id text,
  p_channel text,
  p_lease_id uuid,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  update public.ops_notification_deliveries
  set
    status = 'sent',
    provider_message_id = p_provider_message_id,
    lease_id = null,
    lease_expires_at = null,
    next_attempt_at = now(),
    last_error_code = null,
    sent_at = now()
  where event_id = p_event_id
    and channel = p_channel
    and status = 'sending'
    and lease_id = p_lease_id;
  return found;
end;
$$;

create or replace function public.mark_ops_notification_retry(
  p_event_id text,
  p_channel text,
  p_lease_id uuid,
  p_error_code text,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  update public.ops_notification_deliveries
  set
    status = 'retry',
    lease_id = null,
    lease_expires_at = null,
    next_attempt_at = p_next_attempt_at,
    last_error_code = left(coalesce(nullif(p_error_code, ''), 'temporary_failure'), 80)
  where event_id = p_event_id
    and channel = p_channel
    and status = 'sending'
    and lease_id = p_lease_id;
  return found;
end;
$$;

create or replace function public.mark_ops_notification_dead_letter(
  p_event_id text,
  p_channel text,
  p_lease_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  update public.ops_notification_deliveries
  set
    status = 'dead_letter',
    lease_id = null,
    lease_expires_at = null,
    next_attempt_at = now(),
    last_error_code = left(coalesce(nullif(p_error_code, ''), 'permanent_failure'), 80)
  where event_id = p_event_id
    and channel = p_channel
    and status = 'sending'
    and lease_id = p_lease_id;
  return found;
end;
$$;

revoke all on function public.touch_ops_notification_delivery_updated_at() from public, anon, authenticated;
revoke all on function public.enqueue_ops_event(text, text, text, text, text, text, jsonb, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.claim_ops_notification_batch(integer, integer) from public, anon, authenticated;
revoke all on function public.mark_ops_notification_sent(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_ops_notification_retry(text, text, uuid, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.mark_ops_notification_dead_letter(text, text, uuid, text)
from public, anon, authenticated;

grant execute on function public.enqueue_ops_event(text, text, text, text, text, text, jsonb, text, timestamptz)
to service_role;
grant execute on function public.claim_ops_notification_batch(integer, integer) to service_role;
grant execute on function public.mark_ops_notification_sent(text, text, uuid, text) to service_role;
grant execute on function public.mark_ops_notification_retry(text, text, uuid, text, timestamptz)
to service_role;
grant execute on function public.mark_ops_notification_dead_letter(text, text, uuid, text)
to service_role;
