-- A Worker can terminate after claiming an update but before it sends or
-- records the reply. Only a bounded processing lease is reclaimable; terminal
-- sent/acknowledged rows remain deduplicated indefinitely.
alter table public.ops_telegram_command_updates
  add column lease_expires_at timestamptz;

create index ops_telegram_command_updates_processing_lease_idx
on public.ops_telegram_command_updates (lease_expires_at)
where status = 'processing';

create or replace function public.claim_ops_telegram_command_update(p_update_id bigint)
returns text
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  current_status text;
  current_lease_expires_at timestamptz;
begin
  if p_update_id is null or p_update_id < 0 then
    raise exception 'invalid_ops_telegram_update_id';
  end if;

  insert into public.ops_telegram_command_updates (update_id, lease_expires_at)
  values (p_update_id, now() + interval '180 seconds')
  on conflict (update_id) do nothing;
  if found then return 'claimed'; end if;

  select status, lease_expires_at
  into current_status, current_lease_expires_at
  from public.ops_telegram_command_updates
  where update_id = p_update_id
  for update;
  if current_status is null then
    raise exception 'ops_telegram_update_claim_conflict';
  end if;

  if current_status = 'processing' then
    if current_lease_expires_at is null or current_lease_expires_at <= now() then
      update public.ops_telegram_command_updates
      set lease_expires_at = now() + interval '180 seconds'
      where update_id = p_update_id;
      return 'claimed';
    end if;
    return 'in_progress';
  end if;
  return 'duplicate';
end;
$$;

create or replace function public.mark_ops_telegram_command_update_sent(
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
    lease_expires_at = null,
    sent_at = now()
  where update_id = p_update_id
    and status = 'processing';
  return found;
end;
$$;

create or replace function public.acknowledge_ops_telegram_command_update(
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
    terminal_reason = p_reason,
    lease_expires_at = null
  where update_id = p_update_id
    and status = 'processing';
  return found;
end;
$$;

revoke all on function public.claim_ops_telegram_command_update(bigint) from public, anon, authenticated;
revoke all on function public.mark_ops_telegram_command_update_sent(bigint, text) from public, anon, authenticated;
revoke all on function public.acknowledge_ops_telegram_command_update(bigint, text) from public, anon, authenticated;

grant execute on function public.claim_ops_telegram_command_update(bigint) to service_role;
grant execute on function public.mark_ops_telegram_command_update_sent(bigint, text) to service_role;
grant execute on function public.acknowledge_ops_telegram_command_update(bigint, text) to service_role;
