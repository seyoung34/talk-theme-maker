alter table public.payments
add column if not exists provider text not null default 'payapp',
add column if not exists provider_payment_id text,
add column if not exists checkout_url text,
add column if not exists receipt_url text;

create unique index if not exists payments_provider_payment_id_unique
on public.payments (provider, provider_payment_id)
where provider_payment_id is not null;

drop function if exists public.complete_credit_purchase(uuid);

create or replace function public.complete_credit_purchase(p_payment_id uuid, p_reason text default 'payapp_credit_purchase')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
begin
  select * into payment_row
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  if payment_row.status = 'paid' then
    return payment_row.credits;
  end if;

  if payment_row.status <> 'pending' then
    raise exception 'payment_not_pending';
  end if;

  update public.payments
  set status = 'paid'
  where id = p_payment_id;

  insert into public.credit_balances (user_id, balance)
  values (payment_row.user_id, payment_row.credits)
  on conflict (user_id) do update
  set balance = public.credit_balances.balance + excluded.balance;

  insert into public.credit_ledger (user_id, amount, type, reason, payment_id)
  values (payment_row.user_id, payment_row.credits, 'purchase', p_reason, p_payment_id);

  return payment_row.credits;
end;
$$;

grant execute on function public.complete_credit_purchase(uuid, text) to authenticated;
grant execute on function public.complete_credit_purchase(uuid, text) to service_role;

grant select, insert, update on public.payments to service_role;
grant select, insert, update on public.credit_balances to service_role;
grant select, insert on public.credit_ledger to service_role;
grant select on public.profiles to service_role;
grant select on public.export_jobs to service_role;
