create table if not exists public.user_policy_consents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  policy_type text not null check (policy_type in ('terms', 'privacy')),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  source text not null check (source in ('email_signup', 'kakao_signup', 'account_reconsent')),
  accepted_at timestamptz not null default now(),
  primary key (user_id, policy_type, policy_version)
);

comment on table public.user_policy_consents is
  'Immutable user acceptance history for versioned required policies.';
comment on column public.user_policy_consents.source is
  'User-facing flow where the acceptance action occurred; not an authorization signal.';

alter table public.user_policy_consents enable row level security;

revoke all on public.user_policy_consents from anon, authenticated;
grant select on public.user_policy_consents to authenticated;
grant insert (policy_type, policy_version, source) on public.user_policy_consents to authenticated;

drop policy if exists "Users read own policy consents" on public.user_policy_consents;
create policy "Users read own policy consents"
on public.user_policy_consents
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users record own policy consents" on public.user_policy_consents;
create policy "Users record own policy consents"
on public.user_policy_consents
for insert
to authenticated
with check (user_id = (select auth.uid()));
