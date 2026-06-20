create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_key text unique,
  order_id text not null unique,
  amount integer not null check (amount > 0),
  credits integer not null check (credits > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  export_mode text not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  credit_cost integer not null default 1 check (credit_cost > 0),
  file_name text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('purchase', 'export')),
  reason text not null,
  payment_id uuid references public.payments(id) on delete set null,
  export_job_id uuid references public.export_jobs(id) on delete set null,
  created_at timestamptz not null default now()
);

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_credit_balances on public.credit_balances;
create trigger touch_credit_balances
before update on public.credit_balances
for each row execute function public.touch_updated_at();

drop trigger if exists touch_payments on public.payments;
create trigger touch_payments
before update on public.payments
for each row execute function public.touch_updated_at();

drop trigger if exists touch_export_jobs on public.export_jobs;
create trigger touch_export_jobs
before update on public.export_jobs
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name, avatar_url, provider)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.app_metadata->>'provider', 'email')
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    provider = excluded.provider;

  insert into public.credit_balances (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.complete_credit_purchase(p_payment_id uuid)
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
  values (payment_row.user_id, payment_row.credits, 'purchase', 'toss_credit_purchase', p_payment_id);

  return payment_row.credits;
end;
$$;

create or replace function public.spend_export_credit(p_user_id uuid, p_export_job_id uuid, p_amount integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'invalid_credit_amount';
  end if;

  insert into public.credit_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into current_balance
  from public.credit_balances
  where user_id = p_user_id
  for update;

  if current_balance < p_amount then
    raise exception 'insufficient_credits';
  end if;

  update public.credit_balances
  set balance = balance - p_amount
  where user_id = p_user_id;

  insert into public.credit_ledger (user_id, amount, type, reason, export_job_id)
  values (p_user_id, -p_amount, 'export', p_reason, p_export_job_id);

  update public.export_jobs
  set status = 'succeeded'
  where id = p_export_job_id
    and user_id = p_user_id;

  return current_balance - p_amount;
end;
$$;

alter table public.profiles enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.payments enable row level security;
alter table public.export_jobs enable row level security;

grant select on public.profiles to authenticated;
grant select on public.credit_balances to authenticated;
grant select on public.credit_ledger to authenticated;
grant select on public.payments to authenticated;
grant select on public.export_jobs to authenticated;
grant insert, update on public.profiles to authenticated;
grant execute on function public.complete_credit_purchase(uuid) to authenticated;
grant execute on function public.spend_export_credit(uuid, uuid, integer, text) to authenticated;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
on public.profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users read own credit balance" on public.credit_balances;
create policy "Users read own credit balance"
on public.credit_balances
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users read own credit ledger" on public.credit_ledger;
create policy "Users read own credit ledger"
on public.credit_ledger
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users read own payments" on public.payments;
create policy "Users read own payments"
on public.payments
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users read own export jobs" on public.export_jobs;
create policy "Users read own export jobs"
on public.export_jobs
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());
