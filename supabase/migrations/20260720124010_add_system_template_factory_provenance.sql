alter table public.system_template_variants
  add column if not exists factory_manifest jsonb;

alter table public.system_template_variants
  drop constraint if exists system_template_variants_factory_manifest_object;

alter table public.system_template_variants
  add constraint system_template_variants_factory_manifest_object
  check (factory_manifest is null or jsonb_typeof(factory_manifest) = 'object');

comment on column public.system_template_variants.factory_manifest is
  'Template Factory candidate manifest retained for admin provenance, QA, and safety review. Asset bytes are not stored here.';
