alter table public.admin_asset_bubble_specs
  add column if not exists geometry jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_asset_bubble_specs'::regclass
      and conname = 'admin_asset_bubble_specs_geometry_object_check'
  ) then
    alter table public.admin_asset_bubble_specs
      add constraint admin_asset_bubble_specs_geometry_object_check
      check (geometry is null or jsonb_typeof(geometry) = 'object');
  end if;
end $$;

create or replace function public.upsert_admin_asset_bundle(
  p_asset jsonb,
  p_targets jsonb,
  p_variants jsonb default '[]'::jsonb,
  p_bubble_spec jsonb default null,
  p_bubble_design jsonb default null,
  p_decorations jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_asset_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  v_asset_id := (p_asset ->> 'id')::uuid;
  if v_asset_id is null then
    raise exception 'INVALID_ASSET_ID';
  end if;

  insert into public.admin_assets (
    id, slot_role, platform, asset_kind, analysis, bubble_adjustment,
    title, note, tags, file_name, mime_type, storage_path, enabled, created_by
  )
  values (
    v_asset_id,
    p_asset ->> 'slot_role',
    p_asset ->> 'platform',
    nullif(p_asset ->> 'asset_kind', ''),
    p_asset -> 'analysis',
    p_asset -> 'bubble_adjustment',
    p_asset ->> 'title',
    nullif(p_asset ->> 'note', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_asset -> 'tags', '[]'::jsonb))), '{}'),
    p_asset ->> 'file_name',
    p_asset ->> 'mime_type',
    p_asset ->> 'storage_path',
    coalesce((p_asset ->> 'enabled')::boolean, true),
    auth.uid()
  )
  on conflict (id) do update set
    slot_role = excluded.slot_role,
    platform = excluded.platform,
    asset_kind = excluded.asset_kind,
    analysis = excluded.analysis,
    bubble_adjustment = excluded.bubble_adjustment,
    title = excluded.title,
    note = excluded.note,
    tags = excluded.tags,
    file_name = excluded.file_name,
    mime_type = excluded.mime_type,
    storage_path = excluded.storage_path,
    enabled = excluded.enabled;

  delete from public.admin_asset_targets where asset_id = v_asset_id;
  insert into public.admin_asset_targets (asset_id, platform, slot_role, target_kind, priority, enabled)
  select
    v_asset_id,
    target.platform,
    target.slot_role,
    target.target_kind,
    coalesce(target.priority, 0),
    coalesce(target.enabled, true)
  from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb)) as target(
    platform text,
    slot_role text,
    target_kind text,
    priority integer,
    enabled boolean
  );

  delete from public.admin_asset_variants where asset_id = v_asset_id;
  insert into public.admin_asset_variants (asset_id, platform, storage_path, file_name, mime_type, analysis)
  select
    v_asset_id,
    variant.platform,
    variant.storage_path,
    variant.file_name,
    variant.mime_type,
    variant.analysis
  from jsonb_to_recordset(coalesce(p_variants, '[]'::jsonb)) as variant(
    platform text,
    storage_path text,
    file_name text,
    mime_type text,
    analysis jsonb
  );

  delete from public.admin_asset_bubble_specs where asset_id = v_asset_id;
  if p_bubble_spec is not null then
    insert into public.admin_asset_bubble_specs (asset_id, android_markers, ios_insets, ios_stretch, geometry)
    values (
      v_asset_id,
      p_bubble_spec -> 'android_markers',
      p_bubble_spec -> 'ios_insets',
      p_bubble_spec -> 'ios_stretch',
      -- 클라이언트는 geometry가 없을 때 JSON null을 담아 보낸다. `->`는 그것을 SQL NULL이
      -- 아니라 jsonb 'null'로 돌려주므로, 그대로 넣으면 아래 object 체크에 걸려 RPC 전체가
      -- 롤백된다(업로드된 스토리지 객체까지). 여기서 SQL NULL로 낮춘다.
      nullif(p_bubble_spec -> 'geometry', 'null'::jsonb)
    );
  end if;

  delete from public.admin_asset_bubble_decorations where asset_id = v_asset_id;
  delete from public.admin_asset_bubble_designs where asset_id = v_asset_id;
  if p_bubble_design is not null then
    insert into public.admin_asset_bubble_designs (asset_id, recipe, geometry_mode)
    values (v_asset_id, p_bubble_design -> 'recipe', p_bubble_design ->> 'geometry_mode');

    insert into public.admin_asset_bubble_decorations (asset_id, layer_id, storage_path, file_name, mime_type)
    select
      v_asset_id,
      decoration.layer_id,
      decoration.storage_path,
      decoration.file_name,
      decoration.mime_type
    from jsonb_to_recordset(coalesce(p_decorations, '[]'::jsonb)) as decoration(
      layer_id text,
      storage_path text,
      file_name text,
      mime_type text
    );
  end if;

  return v_asset_id;
end;
$$;

grant execute on function public.upsert_admin_asset_bundle(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
