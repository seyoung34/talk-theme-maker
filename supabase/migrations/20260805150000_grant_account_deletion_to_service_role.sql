-- 계정 삭제 경로에 필요한 권한을 마이그레이션으로 옮긴다.
--
-- public.prepare_account_deletion() 은 security invoker 이고 service_role 로 호출된다.
-- 이 함수는 관리자 계정인지 확인하려고 admin_profiles 를 읽고, 서비스 데이터 7개 테이블을
-- 지운다. 그런데 그 권한을 부여하는 마이그레이션이 하나도 없었다.
--
-- 운영 DB에는 권한이 있어 동작하지만(대시보드에서 부여된 것으로 보인다) `supabase db reset`
-- 으로 마이그레이션만 재생한 데이터베이스에서는 42501 로 실패한다. 즉 계정 삭제와 법정 보존
-- 이관을 로컬에서 검증할 수 없었다. 문의 기록 이관(Phase 3)이 이 경로에 붙으므로 먼저 메운다.
--
-- 운영에 이미 존재하는 상태를 코드로 옮기는 것이라 운영 동작은 달라지지 않는다.

-- 관리자 계정은 삭제할 수 없다는 가드가 읽는다.
grant select on public.admin_profiles to service_role;

-- 삭제 대상 7개 테이블. select/insert/update 는 기존 마이그레이션이 이미 부여했고
-- delete 만 빠져 있었다. user_policy_consents 는 어떤 권한도 없었다.
grant delete on public.credit_ledger to service_role;
grant delete on public.credit_code_redemptions to service_role;
grant delete on public.export_jobs to service_role;
grant delete on public.payments to service_role;
grant delete on public.credit_balances to service_role;
grant select, delete on public.user_policy_consents to service_role;
grant delete on public.profiles to service_role;
