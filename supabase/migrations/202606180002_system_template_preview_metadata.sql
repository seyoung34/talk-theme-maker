alter table public.system_template_variants
add column if not exists preview_metadata jsonb not null default '{}'::jsonb;
