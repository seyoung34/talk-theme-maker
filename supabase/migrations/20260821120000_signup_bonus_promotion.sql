-- 가입 혜택은 GA4 동의와 무관하게 계정 단위로 한 번만 지급한다.
-- 잔액은 기존 credit_balances를 사용하고, 이력과 중복 방지는 별도 claim으로 남긴다.

create table if not exists public.credit_promotion_campaigns (
  campaign_key text primary key check (campaign_key ~ '^[a-z0-9_:-]{1,64}$'),
  name text not null check (char_length(name) between 1 and 120),
  credits integer not null check (credits between 1 and 100),
  status text not null default 'active' check (status in ('active', 'inactive')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_grants integer check (max_grants is null or max_grants > 0),
  grant_count integer not null default 0 check (grant_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (max_grants is null or grant_count <= max_grants)
);

create table if not exists public.credit_promotion_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null references public.credit_promotion_campaigns(campaign_key) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now(),
  unique (campaign_key, user_id)
);

alter table public.credit_ledger
  add column if not exists promotion_claim_id uuid references public.credit_promotion_claims(id) on delete set null;

create index if not exists credit_promotion_claims_user_created_idx
on public.credit_promotion_claims (user_id, created_at desc);

create index if not exists credit_ledger_promotion_claim_idx
on public.credit_ledger (promotion_claim_id);

drop trigger if exists touch_credit_promotion_campaigns on public.credit_promotion_campaigns;
create trigger touch_credit_promotion_campaigns
before update on public.credit_promotion_campaigns
for each row execute function public.touch_updated_at();

alter table public.credit_promotion_campaigns enable row level security;
alter table public.credit_promotion_claims enable row level security;

grant select, insert, update on public.credit_promotion_campaigns to service_role;
grant select, insert on public.credit_promotion_claims to service_role;

insert into public.credit_promotion_campaigns (campaign_key, name, credits, status, starts_at)
values ('signup_bonus_v1', '신규 가입 첫 테마 파일 혜택', 1, 'active', now())
on conflict (campaign_key) do nothing;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.claim_signup_bonus_internal(p_campaign_key text default 'signup_bonus_v1')
returns table (campaign_key text, credits_granted integer, balance integer, already_claimed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  user_row auth.users%rowtype;
  campaign_row public.credit_promotion_campaigns%rowtype;
  existing_claim public.credit_promotion_claims%rowtype;
  next_balance integer;
begin
  if current_user_id is null then
    raise exception 'unauthenticated';
  end if;

  if btrim(coalesce(p_campaign_key, '')) <> 'signup_bonus_v1' then
    raise exception 'invalid_signup_bonus_campaign';
  end if;

  select * into user_row
  from auth.users
  where id = current_user_id;

  if not found then
    raise exception 'user_not_found';
  end if;

  select c.* into campaign_row
  from public.credit_promotion_campaigns as c
  where c.campaign_key = p_campaign_key
  for update;

  if not found then
    raise exception 'promotion_not_found';
  end if;

  select c.* into existing_claim
  from public.credit_promotion_claims as c
  where c.campaign_key = campaign_row.campaign_key
    and c.user_id = current_user_id;

  if found then
    select cb.balance into next_balance
    from public.credit_balances cb
    where cb.user_id = current_user_id;

    return query select campaign_row.campaign_key, 0, coalesce(next_balance, 0), true;
    return;
  end if;

  if campaign_row.status <> 'active' then
    raise exception 'promotion_inactive';
  end if;
  if now() < campaign_row.starts_at then
    raise exception 'promotion_not_started';
  end if;
  if campaign_row.expires_at is not null and now() >= campaign_row.expires_at then
    raise exception 'promotion_expired';
  end if;
  if user_row.created_at < campaign_row.starts_at then
    raise exception 'signup_bonus_not_eligible';
  end if;
  if user_row.email_confirmed_at is null and coalesce(user_row.raw_app_meta_data->>'provider', '') <> 'kakao' then
    raise exception 'signup_bonus_verification_required';
  end if;
  if campaign_row.max_grants is not null and campaign_row.grant_count >= campaign_row.max_grants then
    raise exception 'promotion_limit_reached';
  end if;

  insert into public.credit_promotion_claims (campaign_key, user_id, credits)
  values (campaign_row.campaign_key, current_user_id, campaign_row.credits)
  returning * into existing_claim;

  update public.credit_promotion_campaigns as c
  set grant_count = c.grant_count + 1
  where c.campaign_key = campaign_row.campaign_key;

  insert into public.credit_balances (user_id, balance)
  values (current_user_id, campaign_row.credits)
  on conflict (user_id) do update
  set balance = public.credit_balances.balance + excluded.balance
  returning public.credit_balances.balance into next_balance;

  insert into public.credit_ledger (user_id, amount, type, reason, promotion_claim_id)
  values (current_user_id, campaign_row.credits, 'promotion', campaign_row.campaign_key, existing_claim.id);

  return query select campaign_row.campaign_key, campaign_row.credits, next_balance, false;
end;
$$;

create or replace function public.claim_signup_bonus(p_campaign_key text default 'signup_bonus_v1')
returns table (campaign_key text, credits_granted integer, balance integer, already_claimed boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_signup_bonus_internal(p_campaign_key);
$$;

revoke all on function private.claim_signup_bonus_internal(text) from public;
revoke all on function public.claim_signup_bonus(text) from public;
grant execute on function private.claim_signup_bonus_internal(text) to authenticated;
grant execute on function public.claim_signup_bonus(text) to authenticated;
