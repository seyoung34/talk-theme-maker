create index credit_grant_codes_created_by_idx
on public.credit_grant_codes (created_by)
where created_by is not null;

create index credit_ledger_code_redemption_idx
on public.credit_ledger (code_redemption_id)
where code_redemption_id is not null;

drop policy if exists "Admins read code redemptions" on public.credit_code_redemptions;
drop policy if exists "Users read own code redemptions" on public.credit_code_redemptions;

create policy "Users read permitted code redemptions"
on public.credit_code_redemptions
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.is_admin())
);
