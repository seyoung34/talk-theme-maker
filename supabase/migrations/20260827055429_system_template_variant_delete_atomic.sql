-- 마지막 variant 삭제와 빈 bundle 정리를 하나의 트랜잭션으로 묶는다.
-- SECURITY INVOKER를 유지해 호출자의 RLS 정책(관리자 정책)을 그대로 적용한다.
create or replace function public.delete_system_template_variant(p_variant_id uuid)
returns table (
  id uuid,
  bundle_id uuid,
  upload_refs jsonb,
  preview_metadata jsonb,
  bundle_deleted boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_variant public.system_template_variants%rowtype;
  removed_bundle boolean := false;
begin
  delete from public.system_template_variants as variants
  where variants.id = p_variant_id
  returning variants.* into deleted_variant;

  if not found then
    return;
  end if;

  if not exists (
    select 1
    from public.system_template_variants as remaining
    where remaining.bundle_id = deleted_variant.bundle_id
  ) then
    delete from public.system_template_bundles as bundles
    where bundles.id = deleted_variant.bundle_id;
    removed_bundle := found;
  end if;

  return query
  select deleted_variant.id,
    deleted_variant.bundle_id,
    deleted_variant.upload_refs,
    deleted_variant.preview_metadata,
    removed_bundle;
end;
$$;

revoke execute on function public.delete_system_template_variant(uuid) from public;
grant execute on function public.delete_system_template_variant(uuid) to authenticated;
