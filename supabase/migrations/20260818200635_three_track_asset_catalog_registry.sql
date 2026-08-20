-- 3트랙 에셋 저장소 Phase 1 §6.3 — catalog registry와 export usage 회계.
--
-- 계약 문서: docs/architecture/three-track-asset-storage.md §3.2, §7.2
--
-- 이 migration은 스키마만 만든다. GCS/R2 객체가 없어도 기존 경로는 그대로 동작해야 하므로
-- 기존 테이블에는 nullable 연결만 더하고 어떤 컬럼도 필수로 바꾸지 않는다.

-- ---------------------------------------------------------------------------
-- 1. catalog registry
--
-- export 가능한 이미지 object의 정본이다. 브라우저는 여기에 직접 접근하지 않는다 —
-- assetId/revision/variantKey만 보내고, Worker가 server-side로 이 표를 해석해 GCS 좌표를 만든다.
-- ---------------------------------------------------------------------------
create table if not exists public.theme_asset_objects (
  id uuid primary key default gen_random_uuid(),

  -- admin asset id 또는 system template upload entry id. revision을 넘겨도 안정적으로 유지된다.
  logical_asset_id text not null,
  revision integer not null check (revision >= 1),
  -- canonical | android | ios | original 등. 값 집합은 애플리케이션 계약으로 관리한다.
  variant_key text not null,
  status text not null check (status in ('staged', 'active', 'retired', 'failed')),

  -- GCS 좌표. bucket 이름은 저장하지 않는다. 환경변수로 고정하고 client 입력을 받지 않기 위해서다.
  gcs_object_key text not null,
  gcs_generation text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- catalog object 하나의 상한. Android의 기존 파일당 20MiB와 같은 값이며 iOS에도 새로 적용된다.
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  mime_type text not null,

  -- 아래 네 값은 nullable로 두지 않는다. 바이트를 내려받지 않고 export 적용 가능성을 판정하는 근거다.
  --   file_name   : iOS sourceScale 추론과 Android .9.png 판별이 파일명에 의존한다
  --                 (getIosSourceScale, isAndroidNinePatchSourceName)
  --   source_scale: publish 시 파일명/플랫폼 규칙으로 확정한 값
  --   width/height: 원본 catalog object 기준. iOS 말풍선 cap-inset/geometry 계산에 필요하다
  file_name text not null check (length(file_name) between 1 and 255),
  source_scale smallint not null check (source_scale in (1, 2, 3)),
  width integer not null check (width > 0),
  height integer not null check (height > 0),

  -- Worker는 바이트가 없으므로 PNG signature를 직접 볼 수 없다. publish 시점 검증 결과를 신뢰하고,
  -- Builder가 GCS read 뒤 실제 signature로 다시 확인한다.
  png_signature_verified boolean not null default false,
  png_signature_verified_at timestamptz,

  -- { presetKey: { objectKey, sha256 } }. R2 공개 preview 파생물.
  r2_previews jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,

  unique (logical_asset_id, revision, variant_key),

  -- 검증 시각 없는 검증 완료, 활성 시각 없는 활성 상태를 막는다.
  constraint theme_asset_objects_png_verified_at_check
    check (png_signature_verified = false or png_signature_verified_at is not null),
  constraint theme_asset_objects_activated_at_check
    check (status <> 'active' or activated_at is not null)
);

comment on table public.theme_asset_objects is
  'Server-only registry of export-ready theme asset objects stored in the private GCS catalog.';
comment on column public.theme_asset_objects.width is
  'Raw catalog object width. Export fast path only admits objects needing no normalization, so this equals the post-normalize width.';

-- 같은 logical asset + variant에 active revision은 하나뿐이다.
create unique index if not exists theme_asset_objects_active_revision_idx
on public.theme_asset_objects (logical_asset_id, variant_key)
where status = 'active';

-- orphan/retired 보고서와 GC가 object key로 역조회한다.
create unique index if not exists theme_asset_objects_gcs_object_key_idx
on public.theme_asset_objects (gcs_object_key);

create index if not exists theme_asset_objects_status_idx
on public.theme_asset_objects (status);

drop trigger if exists touch_theme_asset_objects on public.theme_asset_objects;
create trigger touch_theme_asset_objects
before update on public.theme_asset_objects
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. 권한
--
-- Supabase는 public 스키마의 새 테이블에 anon/authenticated 기본 권한을 부여한다. 따라서
-- "grant하지 않는 것"만으로는 비공개가 되지 않는다. 명시적으로 revoke해야 한다.
--
-- RLS는 켜되 정책을 만들지 않는다. 정책 없는 RLS는 전면 거부이고, service_role은 bypassrls로
-- 통과한다. 나중에 grant가 실수로 추가돼도 RLS가 2차 방어선으로 남는다.
-- ---------------------------------------------------------------------------
alter table public.theme_asset_objects enable row level security;

revoke all on public.theme_asset_objects from anon, authenticated;
grant select, insert, update on public.theme_asset_objects to service_role;

-- ---------------------------------------------------------------------------
-- 3. 기존 record의 nullable 연결
--
-- system template의 upload_refs는 jsonb라 항목 안에 assetObjectId를 담는다. 별도 컬럼을 두지 않는다.
-- ---------------------------------------------------------------------------
alter table public.admin_assets
  add column if not exists asset_object_id uuid
    references public.theme_asset_objects(id) on delete set null;

create index if not exists admin_assets_asset_object_id_idx
on public.admin_assets (asset_object_id)
where asset_object_id is not null;

-- ---------------------------------------------------------------------------
-- 4. export usage 회계
--
-- input_bytes의 의미는 바꾸지 않는다. "Worker가 실제로 읽은 입력 바이트"이고 50MiB CHECK도 그대로다.
-- catalog 참조분은 새 컬럼으로 분리해, 바이트가 줄었는지 Worker 밖으로 옮겨갔는지 구분할 수 있게 한다.
--
-- 기준선 해석 주의 — v2 이전 행에서 input_file_count의 의미가 플랫폼마다 다르다.
--   Android: readAndroidBundleUpload()가 serverAsset 항목을 files에 넣지 않아 업로드 파일만 센다.
--   iOS    : readIosEntries()의 requestedEntries.length라 Worker가 수화한 serverAsset도 포함한다.
-- 같은 이유로 pre-v2 iOS의 input_bytes에는 serverAsset 바이트가 섞여 있다.
-- ---------------------------------------------------------------------------
alter table public.export_jobs
  add column if not exists referenced_asset_bytes bigint not null default 0,
  add column if not exists referenced_asset_file_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'export_jobs_referenced_asset_bytes_check'
  ) then
    -- logical_input_bytes CHECK에 포함되는 값이지만 남겨 둔다. 두 컬럼 중 하나만 잘못 쓰이는
    -- 경로가 생겨도 각각의 상한이 독립적으로 걸린다.
    alter table public.export_jobs
      add constraint export_jobs_referenced_asset_bytes_check
      check (referenced_asset_bytes between 0 and 209715200);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'export_jobs_referenced_asset_file_count_check'
  ) then
    alter table public.export_jobs
      add constraint export_jobs_referenced_asset_file_count_check
      check (referenced_asset_file_count between 0 and 300);
  end if;
end $$;

alter table public.export_jobs
  add column if not exists logical_input_bytes bigint
    generated always as (input_bytes + referenced_asset_bytes) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'export_jobs_logical_input_bytes_check'
  ) then
    alter table public.export_jobs
      add constraint export_jobs_logical_input_bytes_check
      check (logical_input_bytes between 0 and 209715200);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. reserve_export_credit — 단일 7인자 함수로 교체
--
-- 인자를 추가하면 create or replace가 교체가 아니라 **overload**를 만든다. PostgREST는 요청 본문의
-- 키 집합으로 함수를 고르므로 동명 함수가 둘이면 후보를 정하지 못하고 PGRST203으로 실패한다.
-- 그래서 기존 5인자 signature를 명시적으로 drop한 뒤 하나만 다시 만든다.
--
-- 배포 순서: 이 migration을 Worker보다 먼저 배포한다. 후행 두 인자에 DEFAULT가 있으므로 구버전
-- Worker의 5-key 본문도 같은 단일 함수를 호출하고, 신버전은 7-key를 보낸다.
--
-- drop은 grant도 함께 지운다. 아래에서 revoke/grant를 새 signature 기준으로 다시 적용한다.
-- ---------------------------------------------------------------------------
drop function if exists public.reserve_export_credit(uuid, text, text, integer, bigint);

create function public.reserve_export_credit(
  p_user_id uuid,
  p_platform text,
  p_export_mode text,
  p_input_file_count integer,
  p_input_bytes bigint,
  p_referenced_asset_bytes bigint default 0,
  p_referenced_asset_file_count integer default 0
)
returns table (export_job_id uuid, balance integer)
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  current_balance integer;
  next_balance integer;
  new_job_id uuid;
  next_export_number bigint;
  opaque_user_key text;
  generated_application_id text;
  generated_theme_identifier text;
  stale_refund integer := 0;
begin
  if p_user_id is null then raise exception 'invalid_user'; end if;
  if p_platform not in ('android', 'ios') then raise exception 'invalid_export_platform'; end if;
  if p_platform = 'android' and p_export_mode not in ('project', 'apk', 'apk-zip') then raise exception 'invalid_export_mode'; end if;
  if p_platform = 'ios' and p_export_mode not in ('theme-zip', 'ktheme') then raise exception 'invalid_export_mode'; end if;
  if p_input_file_count < 0 or p_input_file_count > 500 then raise exception 'invalid_export_file_count'; end if;
  if p_input_bytes < 0 or p_input_bytes > 52428800 then raise exception 'invalid_export_input_size'; end if;
  -- 새 인자도 기존 guard와 같은 방식으로 막는다. CHECK 제약에 맡기면 잔액을 잡은 뒤 23514로 실패해
  -- 관측에서 다른 실패와 구분되지 않는다.
  if p_referenced_asset_bytes < 0 or p_referenced_asset_bytes > 209715200 then raise exception 'invalid_export_referenced_size'; end if;
  if p_referenced_asset_file_count < 0 or p_referenced_asset_file_count > 300 then raise exception 'invalid_export_referenced_file_count'; end if;
  if p_input_bytes + p_referenced_asset_bytes > 209715200 then raise exception 'invalid_export_logical_size'; end if;

  insert into public.credit_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select cb.balance into current_balance
  from public.credit_balances cb
  where cb.user_id = p_user_id
  for update;

  with stale_jobs as (
    update public.export_jobs
    set
      status = 'failed',
      stage = 'failed',
      error_code = 'export_reservation_expired',
      error = '중단된 내보내기 작업의 크레딧이 자동 복구되었습니다.',
      completed_at = now(),
      duration_ms = least(2147483647, greatest(0, floor(extract(epoch from (now() - created_at)) * 1000)))::integer
    where user_id = p_user_id
      and status = 'pending'
      and created_at < now() - interval '10 minutes'
    returning id, credit_cost
  ), refunded as (
    insert into public.credit_ledger (user_id, amount, type, reason, export_job_id)
    select p_user_id, credit_cost, 'export', 'export_reservation_expired_refund', id
    from stale_jobs
    returning amount
  )
  select coalesce(sum(amount), 0)::integer into stale_refund
  from refunded;

  if stale_refund > 0 then
    update public.credit_balances as cb
    set balance = cb.balance + stale_refund
    where cb.user_id = p_user_id
    returning cb.balance into current_balance;
  end if;

  if exists (
    select 1
    from public.export_jobs ej
    where ej.user_id = p_user_id
      and ej.status = 'pending'
  ) then
    raise exception 'export_already_in_progress';
  end if;

  if current_balance < 1 then raise exception 'insufficient_credits'; end if;

  select coalesce(max(ej.export_number), 0) + 1
  into next_export_number
  from public.export_jobs ej
  where ej.user_id = p_user_id
    and ej.platform = p_platform;

  opaque_user_key := substring(encode(digest(convert_to(p_user_id::text, 'UTF8'), 'sha256'), 'hex') from 1 for 16);

  if p_platform = 'android' then
    generated_application_id := 'com.kakao.talk.theme.u'
      || opaque_user_key
      || '.e'
      || lpad(next_export_number::text, 6, '0');
  else
    generated_theme_identifier := 'com.kakao.talk.theme.u'
      || opaque_user_key
      || '.i'
      || lpad(next_export_number::text, 6, '0');
  end if;

  insert into public.export_jobs (
    user_id,
    platform,
    export_mode,
    export_number,
    application_id,
    theme_identifier,
    status,
    stage,
    credit_cost,
    input_file_count,
    input_bytes,
    referenced_asset_bytes,
    referenced_asset_file_count,
    started_at
  )
  values (
    p_user_id,
    p_platform,
    p_export_mode,
    next_export_number,
    generated_application_id,
    generated_theme_identifier,
    'pending',
    'queued',
    1,
    p_input_file_count,
    p_input_bytes,
    p_referenced_asset_bytes,
    p_referenced_asset_file_count,
    now()
  )
  returning id into new_job_id;

  update public.credit_balances as cb
  set balance = cb.balance - 1
  where cb.user_id = p_user_id
  returning cb.balance into next_balance;

  insert into public.credit_ledger (user_id, amount, type, reason, export_job_id)
  values (p_user_id, -1, 'export', 'export_credit_reserved', new_job_id);

  return query select new_job_id, next_balance;
end;
$$;

revoke all on function public.reserve_export_credit(uuid, text, text, integer, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.reserve_export_credit(uuid, text, text, integer, bigint, bigint, integer) to service_role;
