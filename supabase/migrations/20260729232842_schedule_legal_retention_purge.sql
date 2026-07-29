create extension if not exists pg_cron with schema pg_catalog;

revoke all on schema cron from public, anon, authenticated;
revoke all on all tables in schema cron from public, anon, authenticated;
revoke all on all functions in schema cron from public, anon, authenticated;

select cron.schedule(
  'purge-expired-legal-records-daily',
  '15 18 * * *',
  $$select * from public.purge_expired_legal_records();$$
);
