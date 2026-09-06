-- Telegram delivers webhooks at least once. Keep a server-only inbox keyed by
-- update_id so a lost webhook response cannot execute a read command or send
-- its operator reply twice.
create table public.ops_telegram_command_updates (
  update_id bigint primary key check (update_id >= 0),
  status text not null default 'processing' check (status in ('processing', 'sent', 'acknowledged')),
  provider_message_id text,
  terminal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index ops_telegram_command_updates_created_at_idx
on public.ops_telegram_command_updates (created_at);

create or replace function public.touch_ops_telegram_command_update_updated_at()
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

create trigger touch_ops_telegram_command_updates
before update on public.ops_telegram_command_updates
for each row execute function public.touch_ops_telegram_command_update_updated_at();

alter table public.ops_telegram_command_updates enable row level security;
revoke all on public.ops_telegram_command_updates from public, anon, authenticated;
grant select, insert, update, delete on public.ops_telegram_command_updates to service_role;

create function public.claim_ops_telegram_command_update(p_update_id bigint)
returns text
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  current_status text;
begin
  if p_update_id is null or p_update_id < 0 then
    raise exception 'invalid_ops_telegram_update_id';
  end if;

  insert into public.ops_telegram_command_updates (update_id)
  values (p_update_id)
  on conflict (update_id) do nothing;
  if found then return 'claimed'; end if;

  select status into current_status
  from public.ops_telegram_command_updates
  where update_id = p_update_id;
  if current_status is null then
    raise exception 'ops_telegram_update_claim_conflict';
  end if;

  if current_status = 'processing' then return 'in_progress'; end if;
  return 'duplicate';
end;
$$;

create function public.mark_ops_telegram_command_update_sent(
  p_update_id bigint,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if p_update_id is null or p_update_id < 0 then
    raise exception 'invalid_ops_telegram_update_id';
  end if;

  update public.ops_telegram_command_updates
  set
    status = 'sent',
    provider_message_id = nullif(left(p_provider_message_id, 120), ''),
    terminal_reason = null,
    sent_at = now()
  where update_id = p_update_id
    and status = 'processing';
  return found;
end;
$$;

-- A provider response that definitely rejected the send can safely be retried.
-- Do not release after a successful send: Telegram offers no idempotency key
-- for sendMessage, so doing so could create a duplicate operator reply.
create function public.release_ops_telegram_command_update(p_update_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if p_update_id is null or p_update_id < 0 then
    raise exception 'invalid_ops_telegram_update_id';
  end if;

  delete from public.ops_telegram_command_updates
  where update_id = p_update_id
    and status = 'processing';
  return found;
end;
$$;

create function public.acknowledge_ops_telegram_command_update(
  p_update_id bigint,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if p_update_id is null or p_update_id < 0 then
    raise exception 'invalid_ops_telegram_update_id';
  end if;
  if p_reason is null or p_reason !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise exception 'invalid_ops_telegram_update_reason';
  end if;

  update public.ops_telegram_command_updates
  set
    status = 'acknowledged',
    terminal_reason = p_reason
  where update_id = p_update_id
    and status = 'processing';
  return found;
end;
$$;

revoke all on function public.touch_ops_telegram_command_update_updated_at() from public, anon, authenticated;
revoke all on function public.claim_ops_telegram_command_update(bigint) from public, anon, authenticated;
revoke all on function public.mark_ops_telegram_command_update_sent(bigint, text) from public, anon, authenticated;
revoke all on function public.release_ops_telegram_command_update(bigint) from public, anon, authenticated;
revoke all on function public.acknowledge_ops_telegram_command_update(bigint, text) from public, anon, authenticated;

grant execute on function public.claim_ops_telegram_command_update(bigint) to service_role;
grant execute on function public.mark_ops_telegram_command_update_sent(bigint, text) to service_role;
grant execute on function public.release_ops_telegram_command_update(bigint) to service_role;
grant execute on function public.acknowledge_ops_telegram_command_update(bigint, text) to service_role;
