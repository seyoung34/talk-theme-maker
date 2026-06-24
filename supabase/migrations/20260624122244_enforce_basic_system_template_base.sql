update public.system_template_variants
set base_template_id = 'basic'
where base_template_id is distinct from 'basic';

alter table public.system_template_variants
  drop constraint if exists system_template_variants_base_template_id_check;

alter table public.system_template_variants
  add constraint system_template_variants_base_template_id_check
  check (base_template_id = 'basic') not valid;

alter table public.system_template_variants
  validate constraint system_template_variants_base_template_id_check;
