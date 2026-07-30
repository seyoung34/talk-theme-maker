-- public.is_admin() and public.redeem_credit_code() are security-invoker
-- wrappers around narrowly granted private functions. Authenticated callers
-- need schema USAGE to resolve those functions, but receive no table access.
grant usage on schema private to authenticated;

grant execute on function private.is_admin_internal() to authenticated;
grant execute on function private.redeem_credit_code_internal(text) to authenticated;

revoke all on private.account_deletion_jobs from authenticated;
revoke all on private.legal_payment_records from authenticated;
revoke all on private.legal_credit_records from authenticated;
