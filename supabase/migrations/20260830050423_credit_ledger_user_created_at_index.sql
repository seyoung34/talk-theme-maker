create index if not exists credit_ledger_user_created_at_idx
on public.credit_ledger (user_id, created_at desc);
