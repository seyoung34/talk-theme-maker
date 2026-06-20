create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.credit_grant_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (char_length(code_hash) = 64),
  code_preview text not null,
  name text not null check (char_length(name) between 1 and 80),
  credits integer not null check (credits between 1 and 100),
  status text not null default 'active' check (status in ('active', 'inactive')),
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table public.credit_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.credit_grant_codes(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now(),
  unique (code_id, user_id)
);

create index credit_code_redemptions_user_created_idx
on public.credit_code_redemptions (user_id, created_at desc);

alter table public.credit_ledger
drop constraint if exists credit_ledger_type_check;

alter table public.credit_ledger
add constraint credit_ledger_type_check check (type in ('purchase', 'export', 'promotion')),
add column if not exists code_redemption_id uuid references public.credit_code_redemptions(id) on delete set null;

drop trigger if exists touch_credit_grant_codes on public.credit_grant_codes;
create trigger touch_credit_grant_codes
before update on public.credit_grant_codes
for each row execute function public.touch_updated_at();

alter table public.credit_grant_codes enable row level security;
alter table public.credit_code_redemptions enable row level security;

grant select, insert, update on public.credit_grant_codes to service_role;
grant select, insert on public.credit_code_redemptions to service_role;
grant select, insert, update on public.credit_grant_codes to authenticated;
grant select on public.credit_code_redemptions to authenticated;

create policy "Admins manage credit grant codes"
on public.credit_grant_codes
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins read code redemptions"
on public.credit_code_redemptions
for select
to authenticated
using ((select public.is_admin()));

create policy "Users read own code redemptions"
on public.credit_code_redemptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function private.redeem_credit_code_internal(p_code text)
returns table (credits_granted integer, balance integer)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(btrim(coalesce(p_code, '')));
  hashed_code text;
  code_row public.credit_grant_codes%rowtype;
  redemption_id uuid;
  next_balance integer;
begin
  if current_user_id is null then
    raise exception 'unauthenticated';
  end if;

  if normalized_code !~ '^[A-Z0-9-]{4,32}$' then
    raise exception 'invalid_code';
  end if;

  hashed_code := encode(digest(convert_to(normalized_code, 'UTF8'), 'sha256'), 'hex');

  select * into code_row
  from public.credit_grant_codes
  where code_hash = hashed_code
  for update;

  if not found then raise exception 'code_not_found'; end if;
  if code_row.status <> 'active' then raise exception 'code_inactive'; end if;
  if code_row.starts_at is not null and now() < code_row.starts_at then raise exception 'code_not_started'; end if;
  if code_row.expires_at is not null and now() >= code_row.expires_at then raise exception 'code_expired'; end if;

  if exists (
    select 1 from public.credit_code_redemptions
    where code_id = code_row.id and user_id = current_user_id
  ) then
    raise exception 'code_already_redeemed';
  end if;

  if code_row.max_redemptions is not null and code_row.redemption_count >= code_row.max_redemptions then
    raise exception 'code_limit_reached';
  end if;

  insert into public.credit_code_redemptions (code_id, user_id, credits)
  values (code_row.id, current_user_id, code_row.credits)
  returning id into redemption_id;

  update public.credit_grant_codes
  set redemption_count = redemption_count + 1
  where id = code_row.id;

  insert into public.credit_balances (user_id, balance)
  values (current_user_id, code_row.credits)
  on conflict (user_id) do update
  set balance = public.credit_balances.balance + excluded.balance
  returning public.credit_balances.balance into next_balance;

  insert into public.credit_ledger (user_id, amount, type, reason, code_redemption_id)
  values (current_user_id, code_row.credits, 'promotion', 'credit_grant_code', redemption_id);

  return query select code_row.credits, next_balance;
end;
$$;

create or replace function public.redeem_credit_code(p_code text)
returns table (credits_granted integer, balance integer)
language sql
security invoker
set search_path = public, private
as $$
  select * from private.redeem_credit_code_internal(p_code);
$$;

revoke all on function private.redeem_credit_code_internal(text) from public;
revoke all on function public.redeem_credit_code(text) from public;
grant execute on function private.redeem_credit_code_internal(text) to authenticated;
grant execute on function public.redeem_credit_code(text) to authenticated;
