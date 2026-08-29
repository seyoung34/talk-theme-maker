-- Groble exposes optionId as an opaque provider value in webhook payloads. Credit packs in this
-- application use one payment window per pack, so the stable entitlement contract is the approved
-- content ID plus the fixed final amount. Keep receiving and storing optionId for audit, but do not
-- require a value that cannot be read reliably when a pending payment is created.

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
  held boolean := false;
  completion_result text;
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

    -- optionId is provider-owned and is not known when the pending row is created. The server has
    -- already allowlisted p_product_id by content ID and amount before reaching this RPC.
    if payment_row.provider <> 'groble'
      or payment_row.product_id is distinct from p_product_id
      or payment_row.seller_reference is distinct from p_seller_reference
      or payment_row.provider_content_id is distinct from p_content_id
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

    select coalesce(cb.billing_hold, false) into held
    from public.credit_balances cb
    where cb.user_id = payment_row.user_id;
    held := coalesce(held, false);

    completed_credits := public.complete_credit_purchase(payment_row.id, 'groble_credit_purchase');
    completion_result := case when held then 'review_required' else 'processed' end;

    update public.groble_webhook_events
    set
      processing_status = completion_result,
      error_code = case when held then 'completed_during_billing_hold' else error_code end,
      payment_id = payment_row.id,
      processed_at = now()
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

    return query select completion_result, payment_row.id, completed_credits;
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

  -- Refund/cancel events are matched by merchant UID after completion. The product content and
  -- final amount remain guards; the opaque option ID is only audit data.
  if payment_row.product_id is distinct from p_product_id
    or payment_row.provider_content_id is distinct from p_content_id
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
