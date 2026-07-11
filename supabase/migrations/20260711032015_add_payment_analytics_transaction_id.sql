alter table public.payments
add column if not exists analytics_transaction_id uuid default gen_random_uuid();

update public.payments
set analytics_transaction_id = gen_random_uuid()
where analytics_transaction_id is null;

alter table public.payments
alter column analytics_transaction_id set not null;

create unique index if not exists payments_analytics_transaction_id_unique
on public.payments (analytics_transaction_id);
