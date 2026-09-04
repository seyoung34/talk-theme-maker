-- Re-running an idempotent operational event is also the explicit recovery path for a
-- dead-lettered Telegram delivery. Sent, pending, retry, and in-flight deliveries are left alone.
create or replace function public.requeue_ops_notification(
  p_event_id text,
  p_channel text default 'telegram'
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'invalid_ops_notification_event_id';
  end if;

  if p_channel is null or p_channel <> 'telegram' then
    raise exception 'invalid_ops_notification_channel';
  end if;

  update public.ops_notification_deliveries
  set
    status = 'pending',
    attempt_count = 0,
    lease_id = null,
    lease_expires_at = null,
    next_attempt_at = now(),
    provider_message_id = null,
    last_error_code = null,
    sent_at = null
  where event_id = p_event_id
    and channel = p_channel
    and status = 'dead_letter';

  return found;
end;
$$;

revoke all on function public.requeue_ops_notification(text, text)
from public, anon, authenticated;
grant execute on function public.requeue_ops_notification(text, text)
to service_role;
