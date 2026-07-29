-- Keep legal retention records separate from ordinary account data.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.account_deletion_jobs (
  user_id uuid primary key,
  retention_subject_id uuid not null unique default gen_random_uuid(),
  status text not null default 'requested' check (status in ('requested', 'prepared', 'completed')),
  archived_payment_count integer not null default 0 check (archived_payment_count >= 0),
  archived_credit_record_count integer not null default 0 check (archived_credit_record_count >= 0),
  requested_at timestamptz not null default now(),
  prepared_at timestamptz,
  completed_at timestamptz,
  retention_expires_at timestamptz not null default (now() + interval '5 years')
);

comment on table private.account_deletion_jobs is
  'Pseudonymous, server-only account deletion audit and retry state. Never use for marketing or personalization.';

create table private.legal_payment_records (
  source_payment_id uuid primary key,
  retention_subject_id uuid not null,
  order_id text not null,
  provider text not null,
  provider_payment_id text,
  payment_key text,
  amount integer not null check (amount > 0),
  credits integer not null check (credits > 0),
  status text not null check (status in ('paid', 'canceled')),
  purchased_at timestamptz not null,
  last_status_at timestamptz not null,
  archived_at timestamptz not null default now(),
  retention_expires_at timestamptz not null
);

comment on table private.legal_payment_records is
  'Minimum contract and payment evidence retained separately after account deletion.';

create index legal_payment_records_subject_idx
on private.legal_payment_records (retention_subject_id);

create index legal_payment_records_expiry_idx
on private.legal_payment_records (retention_expires_at);

create table private.legal_credit_records (
  source_ledger_id uuid primary key,
  retention_subject_id uuid not null,
  source_payment_id uuid,
  amount integer not null,
  type text not null check (type in ('purchase', 'export')),
  reason text not null,
  occurred_at timestamptz not null,
  archived_at timestamptz not null default now(),
  retention_expires_at timestamptz not null
);

comment on table private.legal_credit_records is
  'Minimum credit grant and service-supply evidence associated with a retained transaction.';

create index legal_credit_records_subject_idx
on private.legal_credit_records (retention_subject_id);

create index legal_credit_records_expiry_idx
on private.legal_credit_records (retention_expires_at);

alter table private.account_deletion_jobs enable row level security;
alter table private.legal_payment_records enable row level security;
alter table private.legal_credit_records enable row level security;

revoke all on private.account_deletion_jobs from public, anon, authenticated;
revoke all on private.legal_payment_records from public, anon, authenticated;
revoke all on private.legal_credit_records from public, anon, authenticated;

grant select, insert, update, delete on private.account_deletion_jobs to service_role;
grant select, insert, delete on private.legal_payment_records to service_role;
grant select, insert, delete on private.legal_credit_records to service_role;

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns table (
  retention_subject_id uuid,
  archived_payment_count integer,
  archived_credit_record_count integer
)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  deletion_job private.account_deletion_jobs%rowtype;
  payment_count integer := 0;
  credit_record_count integer := 0;
begin
  if p_user_id is null then raise exception 'invalid_user_id'; end if;

  if exists (select 1 from public.admin_profiles where user_id = p_user_id) then
    raise exception 'admin_account';
  end if;

  if exists (
    select 1 from public.export_jobs
    where user_id = p_user_id and status = 'pending'
  ) then
    raise exception 'pending_export';
  end if;

  if exists (
    select 1 from public.payments
    where user_id = p_user_id and status = 'pending'
  ) then
    raise exception 'pending_payment';
  end if;

  insert into private.account_deletion_jobs (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into deletion_job
  from private.account_deletion_jobs
  where user_id = p_user_id
  for update;

  if deletion_job.status in ('prepared', 'completed') then
    return query select
      deletion_job.retention_subject_id,
      deletion_job.archived_payment_count,
      deletion_job.archived_credit_record_count;
    return;
  end if;

  insert into private.legal_payment_records (
    source_payment_id,
    retention_subject_id,
    order_id,
    provider,
    provider_payment_id,
    payment_key,
    amount,
    credits,
    status,
    purchased_at,
    last_status_at,
    retention_expires_at
  )
  select
    p.id,
    deletion_job.retention_subject_id,
    p.order_id,
    p.provider,
    p.provider_payment_id,
    p.payment_key,
    p.amount,
    p.credits,
    p.status,
    p.created_at,
    p.updated_at,
    greatest(p.created_at, p.updated_at) + interval '5 years'
  from public.payments p
  where p.user_id = p_user_id
    and p.status in ('paid', 'canceled')
  on conflict (source_payment_id) do nothing;

  get diagnostics payment_count = row_count;

  if payment_count > 0 then
    insert into private.legal_credit_records (
      source_ledger_id,
      retention_subject_id,
      source_payment_id,
      amount,
      type,
      reason,
      occurred_at,
      retention_expires_at
    )
    select
      ledger.id,
      deletion_job.retention_subject_id,
      ledger.payment_id,
      ledger.amount,
      ledger.type,
      ledger.reason,
      ledger.created_at,
      ledger.created_at + interval '5 years'
    from public.credit_ledger ledger
    where ledger.user_id = p_user_id
      and ledger.type in ('purchase', 'export')
    on conflict (source_ledger_id) do nothing;

    get diagnostics credit_record_count = row_count;
  end if;

  delete from public.credit_ledger where user_id = p_user_id;
  delete from public.credit_code_redemptions where user_id = p_user_id;
  delete from public.export_jobs where user_id = p_user_id;
  delete from public.payments where user_id = p_user_id;
  delete from public.credit_balances where user_id = p_user_id;
  delete from public.user_policy_consents where user_id = p_user_id;
  delete from public.profiles where user_id = p_user_id;

  update private.account_deletion_jobs
  set
    status = 'prepared',
    archived_payment_count = payment_count,
    archived_credit_record_count = credit_record_count,
    prepared_at = now()
  where user_id = p_user_id
  returning * into deletion_job;

  return query select
    deletion_job.retention_subject_id,
    deletion_job.archived_payment_count,
    deletion_job.archived_credit_record_count;
end;
$$;

create or replace function public.complete_account_deletion(p_user_id uuid)
returns void
language sql
security invoker
set search_path = private
as $$
  update private.account_deletion_jobs
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where user_id = p_user_id and status = 'prepared';
$$;

create or replace function public.purge_expired_legal_records()
returns table (
  deleted_payment_records integer,
  deleted_credit_records integer,
  deleted_deletion_jobs integer
)
language plpgsql
security invoker
set search_path = private
as $$
declare
  payment_count integer;
  credit_count integer;
  job_count integer;
begin
  delete from private.legal_credit_records where retention_expires_at <= now();
  get diagnostics credit_count = row_count;

  delete from private.legal_payment_records where retention_expires_at <= now();
  get diagnostics payment_count = row_count;

  delete from private.account_deletion_jobs where retention_expires_at <= now();
  get diagnostics job_count = row_count;

  return query select payment_count, credit_count, job_count;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.complete_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.purge_expired_legal_records() from public, anon, authenticated;

grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.complete_account_deletion(uuid) to service_role;
grant execute on function public.purge_expired_legal_records() to service_role;
