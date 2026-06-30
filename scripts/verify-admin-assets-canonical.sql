begin;

do $$
declare
  policy_count integer;
begin
  if to_regclass('public.admin_asset_targets') is null then
    raise exception 'missing public.admin_asset_targets';
  end if;

  if to_regclass('public.admin_asset_bubble_specs') is null then
    raise exception 'missing public.admin_asset_bubble_specs';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.admin_asset_targets'::regclass
      and relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.admin_asset_targets';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.admin_asset_bubble_specs'::regclass
      and relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.admin_asset_bubble_specs';
  end if;

  select count(*) into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'admin_asset_targets'
    and policyname = 'Admins manage admin asset targets'
    and roles = '{authenticated}'
    and cmd = 'ALL'
    and qual = 'is_admin()'
    and with_check = 'is_admin()';
  if policy_count <> 1 then
    raise exception 'missing admin all-operations policy on public.admin_asset_targets';
  end if;

  select count(*) into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'admin_asset_bubble_specs'
    and policyname = 'Admins manage admin asset bubble specs'
    and roles = '{authenticated}'
    and cmd = 'ALL'
    and qual = 'is_admin()'
    and with_check = 'is_admin()';
  if policy_count <> 1 then
    raise exception 'missing admin all-operations policy on public.admin_asset_bubble_specs';
  end if;

  if not has_table_privilege('service_role', 'public.admin_asset_targets', 'select') then
    raise exception 'service_role lacks select on public.admin_asset_targets';
  end if;

  if not has_table_privilege('service_role', 'public.admin_asset_bubble_specs', 'select') then
    raise exception 'service_role lacks select on public.admin_asset_bubble_specs';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'admin_assets'
      and indexname = 'admin_assets_canonical_listing_idx'
      and indexdef ilike '%(enabled, asset_kind, updated_at DESC, id DESC)%'
  ) then
    raise exception 'missing canonical admin_assets listing index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'admin_asset_targets'
      and indexname = 'admin_asset_targets_lookup_idx'
      and indexdef ilike '%(platform, slot_role, enabled, priority DESC)%'
  ) then
    raise exception 'missing admin_asset_targets lookup index';
  end if;

  if exists (
    select 1
    from public.admin_assets assets
    where assets.enabled
      and not exists (
        select 1
        from public.admin_asset_targets targets
        where targets.asset_id = assets.id
          and targets.enabled = assets.enabled
      )
  ) then
    raise exception 'enabled admin asset missing backfilled target';
  end if;

  if exists (
    select 1
    from public.admin_assets assets
    where assets.asset_kind = 'bubble'
      and jsonb_typeof(assets.bubble_adjustment) = 'object'
      and jsonb_typeof(assets.bubble_adjustment -> 'markers') = 'object'
      and (assets.bubble_adjustment -> 'markers') ? 'top'
      and (assets.bubble_adjustment -> 'markers') ? 'left'
      and (assets.bubble_adjustment -> 'markers') ? 'right'
      and (assets.bubble_adjustment -> 'markers') ? 'bottom'
      and jsonb_typeof(assets.bubble_adjustment -> 'insets') = 'object'
      and (assets.bubble_adjustment -> 'insets') ? 'top'
      and (assets.bubble_adjustment -> 'insets') ? 'right'
      and (assets.bubble_adjustment -> 'insets') ? 'bottom'
      and (assets.bubble_adjustment -> 'insets') ? 'left'
      and jsonb_typeof(assets.bubble_adjustment -> 'stretch') = 'object'
      and (assets.bubble_adjustment -> 'stretch') ? 'x'
      and (assets.bubble_adjustment -> 'stretch') ? 'y'
      and not exists (
        select 1
        from public.admin_asset_bubble_specs specs
        where specs.asset_id = assets.id
      )
  ) then
    raise exception 'complete legacy bubble adjustment missing backfilled spec';
  end if;
end $$;

do $$
declare
  test_asset_id uuid := gen_random_uuid();
begin
  insert into public.admin_assets (
    id,
    slot_role,
    platform,
    asset_kind,
    bubble_adjustment,
    title,
    tags,
    file_name,
    mime_type,
    storage_path,
    enabled
  )
  values (
    test_asset_id,
    'bubble_me_1',
    'android',
    'bubble',
    '{"markers":{"top":{"start":1,"end":2},"left":{"start":1,"end":2},"right":{"start":1,"end":2},"bottom":{"start":1,"end":2}},"insets":{"top":1,"right":1,"bottom":1,"left":1},"stretch":{"x":1,"y":1}}'::jsonb,
    'canonical verification asset',
    '{}',
    'canonical-verification.png',
    'image/png',
    'admin-assets/canonical-verification/canonical-verification.png',
    true
  );

  begin
    insert into public.admin_asset_targets (asset_id, platform, target_kind, slot_role)
    values (test_asset_id, 'android', 'exact_role', null);
    raise exception 'target_kind exact_role accepted a null slot_role';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.admin_asset_targets (asset_id, platform, target_kind, slot_role)
    values (test_asset_id, 'android', 'asset_kind', 'bubble_me_1');
    raise exception 'target_kind asset_kind accepted a non-null slot_role';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.admin_asset_targets (asset_id, platform, target_kind, slot_role)
    values (test_asset_id, 'windows', 'asset_kind', null);
    raise exception 'invalid platform accepted for admin_asset_targets';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.admin_asset_bubble_specs (asset_id, android_markers, ios_insets, ios_stretch)
    values (
      test_asset_id,
      null,
      '{"top":1,"right":1,"bottom":1,"left":1}'::jsonb,
      '{"x":1,"y":1}'::jsonb
    );
    raise exception 'admin_asset_bubble_specs accepted null android_markers';
  exception
    when not_null_violation then null;
  end;

  begin
    insert into public.admin_asset_bubble_specs (asset_id, android_markers, ios_insets, ios_stretch)
    values (
      test_asset_id,
      '{"top":{"start":1,"end":2}}'::jsonb,
      '{"top":1,"right":1,"bottom":1,"left":1}'::jsonb,
      '{"x":1,"y":1}'::jsonb
    );
    raise exception 'admin_asset_bubble_specs accepted incomplete android_markers';
  exception
    when check_violation then null;
  end;
end $$;

rollback;
