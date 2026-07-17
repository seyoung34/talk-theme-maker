alter table public.user_policy_consents
  drop constraint if exists user_policy_consents_policy_type_check;

alter table public.user_policy_consents
  add constraint user_policy_consents_policy_type_check
  check (policy_type in ('terms', 'privacy', 'age_14'));

comment on table public.user_policy_consents is
  'Immutable user acceptance and minimum-age confirmation history.';
