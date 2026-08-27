-- Groble one-time credit billing.
-- Provider payloads are verified and reduced to a PII-free shape in the application before this RPC.

alter table public.payments
  add column if not exists product_id text,
  add column if not exists seller_reference text,
  add column if not exists provider_content_id text,
  add column if not exists provider_option_id text,
  add column if not exists refund_status text not null default 'none',
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists refund_amount integer not null default 0,
  add column if not exists refunded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_product_id_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_product_id_check
      check (product_id is null or product_id in ('credit-1', 'credit-2', 'credit-5'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_refund_status_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_refund_status_check
      check (refund_status in ('none', 'requested', 'refunded', 'review_required'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_refund_amount_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_refund_amount_check
      check (refund_amount >= 0 and refund_amount <= amount);
  end if;
end $$;

create unique index if not exists payments_provider_seller_reference_unique
on public.payments (provider, seller_reference)
where seller_reference is not null;

alter table public.credit_balances
  add column if not exists billing_hold boolean not null default false,
  add column if not exists billing_hold_reason text,
  add column if not exists billing_hold_payment_id uuid references public.payments(id) on delete set null;

create index if not exists credit_balances_billing_hold_idx
on public.credit_balances (billing_hold, updated_at)
where billing_hold = true;

create index if not exists credit_balances_billing_hold_payment_idx
on public.credit_balances (billing_hold_payment_id)
where billing_hold_payment_id is not null;

alter table public.credit_ledger
  drop constraint if exists credit_ledger_type_check;

alter table public.credit_ledger
  add constraint credit_ledger_type_check
  check (type in ('purchase', 'export', 'promotion', 'refund'));

create unique index if not exists credit_ledger_payment_refund_unique
on public.credit_ledger (payment_id)
where type = 'refund' and payment_id is not null;

create table if not exists public.groble_webhook_events (
  event_id text primary key,
  idempotency_key text not null unique,
  event_type text not null check (event_type in ('payment.completed', 'payment.cancel_requested', 'payment.refunded')),
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'pending_match', 'review_required', 'rejected', 'test_received')),
  payment_id uuid references public.payments(id) on delete set null,
  merchant_uid text,
  seller_reference text,
  product_id text,
  content_id text,
  option_id text,
  amount integer check (amount is null or amount > 0),
  refund_amount integer check (refund_amount is null or refund_amount > 0),
  partial_refund boolean,
  action_at timestamptz,
  occurred_at timestamptz not null,
  sanitized_payload jsonb not null default '{}'::jsonb,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.groble_webhook_events is
  'Server-only, PII-free Groble webhook inbox used for idempotency, ordering recovery, and billing audits.';

create index if not exists groble_webhook_events_payment_idx
on public.groble_webhook_events (payment_id, occurred_at);

create index if not exists groble_webhook_events_pending_merchant_idx
on public.groble_webhook_events (merchant_uid, event_type, occurred_at)
where processing_status = 'pending_match';

alter table public.groble_webhook_events enable row level security;
revoke all on public.groble_webhook_events from public, anon, authenticated;
grant select, insert, update on public.groble_webhook_events to service_role;

-- A billing hold is an explicit operational stop. It blocks new exports and account cleanup until
-- the refunded purchase has been reconciled; existing in-flight export jobs may still finish.
create or replace function public.block_billing_hold_export()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'pending' and exists (
    select 1 from public.credit_balances cb
    where cb.user_id = new.user_id and cb.billing_hold = true
  ) then
    raise exception 'billing_hold';
  end if;
  return new;
end;
$$;

create or replace function public.block_billing_hold_payment()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'pending' and exists (
    select 1 from public.credit_balances cb
    where cb.user_id = new.user_id and cb.billing_hold = true
  ) then
    raise exception 'billing_hold';
  end if;
  return new;
end;
$$;

drop trigger if exists block_billing_hold_payment on public.payments;
create trigger block_billing_hold_payment
before insert on public.payments
for each row execute function public.block_billing_hold_payment();

drop trigger if exists block_billing_hold_export on public.export_jobs;
create trigger block_billing_hold_export
before insert on public.export_jobs
for each row execute function public.block_billing_hold_export();

create or replace function public.block_billing_hold_account_cleanup()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if old.billing_hold then raise exception 'billing_hold'; end if;
  return old;
end;
$$;

drop trigger if exists block_billing_hold_account_cleanup on public.credit_balances;
create trigger block_billing_hold_account_cleanup
before delete on public.credit_balances
for each row execute function public.block_billing_hold_account_cleanup();

revoke all on function public.block_billing_hold_export() from public, anon, authenticated;
revoke all on function public.block_billing_hold_payment() from public, anon, authenticated;
revoke all on function public.block_billing_hold_account_cleanup() from public, anon, authenticated;

create or replace function private.apply_groble_refund(
  p_payment_id uuid,
  p_refund_amount integer,
  p_partial_refund boolean,
  p_refunded_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = public, private, pg_catalog
as $$
declare
  payment_row public.payments%rowtype;
  current_balance integer;
  refund_ledger_id uuid;
begin
  select * into payment_row
  from public.payments
  where id = p_payment_id
  for update;

  if not found then return 'pending_match'; end if;
  if payment_row.refund_status = 'refunded' then return 'processed'; end if;

  insert into public.credit_balances (user_id, balance)
  values (payment_row.user_id, 0)
  on conflict (user_id) do nothing;

  select balance into current_balance
  from public.credit_balances
  where user_id = payment_row.user_id
  for update;

  if payment_row.status <> 'paid'
    or p_partial_refund
    or p_refund_amount <> payment_row.amount
    or current_balance < payment_row.credits then
    update public.payments
    set
      refund_status = 'review_required',
      refund_amount = least(amount, refund_amount + p_refund_amount),
      refunded_at = coalesce(p_refunded_at, refunded_at)
    where id = payment_row.id;

    update public.credit_balances
    set
      billing_hold = true,
      billing_hold_reason = case
        when p_partial_refund then 'groble_partial_refund'
        when payment_row.status <> 'paid' then 'groble_refund_payment_state'
        else 'groble_refund_insufficient_balance'
      end,
      billing_hold_payment_id = payment_row.id
    where user_id = payment_row.user_id;

    return 'review_required';
  end if;

  insert into public.credit_ledger (user_id, amount, type, reason, payment_id)
  values (payment_row.user_id, -payment_row.credits, 'refund', 'groble_credit_refund', payment_row.id)
  on conflict do nothing
  returning id into refund_ledger_id;

  if refund_ledger_id is null then return 'processed'; end if;

  update public.credit_balances
  set
    balance = balance - payment_row.credits,
    billing_hold = case when billing_hold_payment_id = payment_row.id then false else billing_hold end,
    billing_hold_reason = case when billing_hold_payment_id = payment_row.id then null else billing_hold_reason end,
    billing_hold_payment_id = case when billing_hold_payment_id = payment_row.id then null else billing_hold_payment_id end
  where user_id = payment_row.user_id;

  update public.payments
  set
    status = 'canceled',
    refund_status = 'refunded',
    refund_amount = amount,
    refunded_at = coalesce(p_refunded_at, now())
  where id = payment_row.id;

  return 'processed';
end;
$$;

revoke all on function private.apply_groble_refund(uuid, integer, boolean, timestamptz) from public, anon, authenticated;
grant execute on function private.apply_groble_refund(uuid, integer, boolean, timestamptz) to service_role;

create or replace function public.process_groble_webhook_event(
  p_event_id text,
  p_idempotency_key text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_payment_id uuid,
  p_merchant_uid text,
  p_seller_reference text,
  p_product_id text,
  p_content_id text,
  p_option_id text,
  p_amount integer,
  p_refund_amount integer,
  p_partial_refund boolean,
  p_action_at timestamptz,
  p_sanitized_payload jsonb
)
returns table (result text, matched_payment_id uuid, granted_credits integer)
language plpgsql
security invoker
set search_path = public, private, pg_catalog
as $$
declare
  payment_row public.payments%rowtype;
  inserted_event_id text;
  refund_event public.groble_webhook_events%rowtype;
  refund_result text;
  completed_credits integer := 0;
begin
  if p_event_type not in ('payment.completed', 'payment.cancel_requested', 'payment.refunded') then
    raise exception 'unsupported_groble_event';
  end if;

  insert into public.groble_webhook_events (
    event_id, idempotency_key, event_type, payment_id, merchant_uid, seller_reference,
    product_id, content_id, option_id, amount, refund_amount, partial_refund,
    action_at, occurred_at, sanitized_payload
  ) values (
    p_event_id, p_idempotency_key, p_event_type, p_payment_id, p_merchant_uid, p_seller_reference,
    p_product_id, p_content_id, p_option_id, p_amount, p_refund_amount, p_partial_refund,
    p_action_at, p_occurred_at, coalesce(p_sanitized_payload, '{}'::jsonb)
  )
  on conflict do nothing
  returning event_id into inserted_event_id;

  if inserted_event_id is null then
    return query select 'duplicate'::text, null::uuid, 0;
    return;
  end if;

  if p_event_id like 'evt_test_%' then
    update public.groble_webhook_events
    set processing_status = 'test_received', processed_at = now()
    where event_id = p_event_id;
    return query select 'test_received'::text, null::uuid, 0;
    return;
  end if;

  if p_event_type = 'payment.completed' then
    select * into payment_row
    from public.payments
    where id = p_payment_id
    for update;

    if not found then
      update public.groble_webhook_events
      set processing_status = 'rejected', error_code = 'payment_not_found', processed_at = now()
      where event_id = p_event_id;
      return query select 'rejected'::text, p_payment_id, 0;
      return;
    end if;

    if payment_row.provider <> 'groble'
      or payment_row.product_id is distinct from p_product_id
      or payment_row.seller_reference is distinct from p_seller_reference
      or payment_row.provider_content_id is distinct from p_content_id
      or payment_row.provider_option_id is distinct from p_option_id
      or payment_row.amount is distinct from p_amount then
      update public.groble_webhook_events
      set processing_status = 'rejected', error_code = 'payment_product_mismatch', processed_at = now()
      where event_id = p_event_id;
      return query select 'rejected'::text, payment_row.id, 0;
      return;
    end if;

    if payment_row.status <> 'pending' then
      if payment_row.provider_payment_id is distinct from p_merchant_uid then
        update public.groble_webhook_events
        set processing_status = 'rejected', error_code = 'merchant_uid_conflict', processed_at = now()
        where event_id = p_event_id;
        return query select 'rejected'::text, payment_row.id, 0;
        return;
      end if;

      update public.groble_webhook_events
      set processing_status = 'processed', payment_id = payment_row.id, processed_at = now()
      where event_id = p_event_id;
      return query select 'duplicate'::text, payment_row.id, payment_row.credits;
      return;
    end if;

    update public.payments
    set
      provider_payment_id = p_merchant_uid,
      provider_content_id = p_content_id,
      provider_option_id = p_option_id,
      raw_payload = coalesce(p_sanitized_payload, '{}'::jsonb)
    where id = payment_row.id;

    completed_credits := public.complete_credit_purchase(payment_row.id, 'groble_credit_purchase');

    update public.groble_webhook_events
    set processing_status = 'processed', payment_id = payment_row.id, processed_at = now()
    where event_id = p_event_id;

    if exists (
      select 1 from public.groble_webhook_events
      where merchant_uid = p_merchant_uid
        and event_type = 'payment.cancel_requested'
        and processing_status = 'pending_match'
    ) then
      update public.payments
      set
        refund_status = case when refund_status = 'none' then 'requested' else refund_status end,
        cancel_requested_at = coalesce(cancel_requested_at, (
          select min(coalesce(action_at, occurred_at))
          from public.groble_webhook_events
          where merchant_uid = p_merchant_uid
            and event_type = 'payment.cancel_requested'
            and processing_status = 'pending_match'
        ))
      where id = payment_row.id;

      update public.groble_webhook_events
      set processing_status = 'processed', payment_id = payment_row.id, processed_at = now()
      where merchant_uid = p_merchant_uid
        and event_type = 'payment.cancel_requested'
        and processing_status = 'pending_match';
    end if;

    for refund_event in
      select * from public.groble_webhook_events
      where merchant_uid = p_merchant_uid
        and event_type = 'payment.refunded'
        and processing_status = 'pending_match'
      order by occurred_at, event_id
      for update
    loop
      refund_result := private.apply_groble_refund(
        payment_row.id,
        refund_event.refund_amount,
        coalesce(refund_event.partial_refund, false),
        coalesce(refund_event.action_at, refund_event.occurred_at)
      );
      update public.groble_webhook_events
      set
        processing_status = case when refund_result = 'review_required' then 'review_required' else 'processed' end,
        payment_id = payment_row.id,
        processed_at = now()
      where event_id = refund_event.event_id;
    end loop;

    return query select 'processed'::text, payment_row.id, completed_credits;
    return;
  end if;

  select * into payment_row
  from public.payments
  where provider = 'groble' and provider_payment_id = p_merchant_uid
  for update;

  if not found then
    update public.groble_webhook_events
    set processing_status = 'pending_match'
    where event_id = p_event_id;
    return query select 'pending_match'::text, null::uuid, 0;
    return;
  end if;

  if payment_row.product_id is distinct from p_product_id
    or payment_row.provider_content_id is distinct from p_content_id
    or payment_row.provider_option_id is distinct from p_option_id
    or payment_row.amount is distinct from p_amount then
    update public.groble_webhook_events
    set processing_status = 'rejected', payment_id = payment_row.id,
        error_code = 'payment_product_mismatch', processed_at = now()
    where event_id = p_event_id;
    return query select 'rejected'::text, payment_row.id, 0;
    return;
  end if;

  if p_event_type = 'payment.cancel_requested' then
    update public.payments
    set
      refund_status = case when refund_status = 'none' then 'requested' else refund_status end,
      cancel_requested_at = coalesce(cancel_requested_at, p_action_at, p_occurred_at),
      raw_payload = coalesce(p_sanitized_payload, '{}'::jsonb)
    where id = payment_row.id;
    refund_result := 'processed';
  else
    refund_result := private.apply_groble_refund(
      payment_row.id,
      p_refund_amount,
      coalesce(p_partial_refund, false),
      coalesce(p_action_at, p_occurred_at)
    );
  end if;

  update public.groble_webhook_events
  set
    processing_status = case when refund_result = 'review_required' then 'review_required' else 'processed' end,
    payment_id = payment_row.id,
    processed_at = now()
  where event_id = p_event_id;

  return query select refund_result, payment_row.id, 0;
end;
$$;

revoke all on function public.process_groble_webhook_event(
  text, text, text, timestamptz, uuid, text, text, text, text, text,
  integer, integer, boolean, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.process_groble_webhook_event(
  text, text, text, timestamptz, uuid, text, text, text, text, text,
  integer, integer, boolean, timestamptz, jsonb
) to service_role;

grant select, insert, update on public.payments to service_role;
grant select, insert, update on public.credit_balances to service_role;
grant select, insert on public.credit_ledger to service_role;
