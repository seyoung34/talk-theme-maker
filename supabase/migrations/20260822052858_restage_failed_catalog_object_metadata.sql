-- 3트랙 카탈로그 재시도 — GCS 객체를 다시 업로드한 세대와 크기도 registry에 반영한다.
--
-- failed revision을 재시도할 때 content-addressed object key는 같지만, 원본 객체가 GC되었거나
-- 업로드가 새 generation을 만들 수 있다. 예전 함수는 status만 staged로 되돌려 이전 generation을
-- 계속 가리켰고, Builder가 정상 객체를 읽지 못할 수 있었다.

drop function if exists public.restage_failed_theme_asset_object(uuid, text);

create function public.restage_failed_theme_asset_object(
  p_id uuid,
  p_sha256 text,
  p_gcs_generation text,
  p_size_bytes bigint
)
returns table (restaged_id uuid)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  target record;
begin
  if p_gcs_generation is null or btrim(p_gcs_generation) = '' then
    raise exception 'invalid_catalog_generation';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 20971520 then
    raise exception 'invalid_catalog_size';
  end if;

  select id, status, sha256
  into target
  from public.theme_asset_objects
  where id = p_id
  for update;

  if not found then raise exception 'catalog_object_not_found'; end if;
  if target.sha256 <> p_sha256 then raise exception 'catalog_object_hash_mismatch'; end if;
  if target.status <> 'failed' then raise exception 'catalog_object_not_failed'; end if;

  update public.theme_asset_objects
  set
    status = 'staged',
    gcs_generation = p_gcs_generation,
    size_bytes = p_size_bytes
  where id = p_id and status = 'failed';

  return query select p_id;
end;
$$;

revoke all on function public.restage_failed_theme_asset_object(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.restage_failed_theme_asset_object(uuid, text, text, bigint) to service_role;

comment on function public.restage_failed_theme_asset_object(uuid, text, text, bigint) is
  'Restages a failed catalog revision and records the verified current GCS generation and size.';
