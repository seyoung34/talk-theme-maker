import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { canonicalAdminAssetToCandidate, mapCanonicalAdminAssetRow, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { toAdminAssetListItem, type AdminAssetListItem, type AdminAssetListPayload } from "@/lib/theme/adminAssetList";
import { adminLogicalAssetId, canonicalVariantKey } from "@/lib/theme/assetCatalog/logicalAssetId";
import { buildPickerThumbnailIndex, filterPickerThumbnailRowsForCurrentAssets, type PickerThumbnailAssetRef, type PickerThumbnailIndex, type PickerThumbnailRow } from "@/lib/theme/assetCatalog/pickerThumbnails";
import { getR2PreviewOrigin } from "@/lib/theme/assetCatalog/previewUrl";
import { themeAssetsBucketName } from "@/lib/theme/remoteAssets";
import type { AdminAssetPlatform } from "@/lib/theme/adminAssetDomain";
import type { ThemePlatform } from "@/lib/theme/types";

/**
 * `/admin/assets` 목록.
 *
 * 브라우저가 Supabase를 직접 읽던 경로를 서버로 옮긴 이유는 **썸네일 때문이다.**
 * `theme_asset_objects`는 `revoke all from anon, authenticated` + 정책 없는 RLS로 잠겨 있고
 * (`20260818200635_three_track_asset_catalog_registry.sql`), 그건 되돌리지 않는다. R2 축소본을
 * 쓰려면 service role로 읽는 쪽이 목록을 만들어야 한다.
 *
 * 그 김에 두 가지가 함께 해결된다.
 *   - 목록이 Storage path와 원본 signed URL을 브라우저에 주지 않는다.
 *   - 관리 화면이 종류 전체를 한 번에 받아 정렬·검색을 정확히 할 수 있다. 커서 위에서는
 *     "이름순"이 로드된 페이지 안에서만 성립해 목록이 거짓말을 한다.
 */

export const dynamic = "force-dynamic";

const allowedAssetKinds = new Set(["background", "icon", "bubble", "profile", "launcher", "passcode"]);

/** `asset_kind`가 비어 있는 옛 행. backfill 전에도 관리자가 찾을 수 있어야 한다. */
const legacyAssetKind = "legacy";

/** 한 번의 PostgREST 요청 크기. */
const batchSize = 200;

/**
 * 종류 하나가 이 수를 넘으면 전량 로드를 포기한다.
 *
 * 넘겼는데도 성공처럼 응답하면 운영자가 없는 에셋을 없다고 판단한다. `truncated`로 알리고
 * 화면이 총 개수·정렬을 "전체 기준"으로 설명하지 않게 한다.
 */
const maxRows = 500;

/** 목록에 필요한 것만. `storage_path`는 썸네일 없는 에셋의 폴백 서명에만 쓰고 응답에는 넣지 않는다. */
const listSelect = [
  "id",
  "slot_role",
  "platform",
  "asset_kind",
  "analysis",
  "bubble_adjustment",
  "title",
  "file_name",
  "mime_type",
  "storage_path",
  "asset_object_id",
  "enabled",
  "created_at",
  "updated_at",
  "admin_asset_targets(id,asset_id,platform,slot_role,target_kind,priority,enabled)",
  "admin_asset_bubble_specs(asset_id,android_markers,ios_insets,ios_stretch,geometry)",
  "admin_asset_variants(id,asset_id,platform,storage_path,asset_object_id,file_name,mime_type)",
].join(",");

export async function GET(request: NextRequest) {
  const adminAuth = await getCurrentAdmin();
  if (!adminAuth.configured || !adminAuth.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!adminAuth.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const assetKind = request.nextUrl.searchParams.get("assetKind");
  if (!assetKind || (!allowedAssetKinds.has(assetKind) && assetKind !== legacyAssetKind)) {
    return NextResponse.json({ error: "assetKind가 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    const { rows, truncated } = await readListRows(admin, assetKind);
    const candidates = rows.map((row) => canonicalAdminAssetToCandidate(mapCanonicalAdminAssetRow(row)));

    // 썸네일과 등록 여부는 같은 행에서 나온다. 한 번만 읽고 둘로 나눈다 — 따로 읽으면
    // 두 표시가 서로 다른 시점의 registry를 보고 어긋날 수 있다.
    const catalogRows = await readActiveCatalogRows(admin, candidates);
    const thumbnails = catalogRows && getR2PreviewOrigin() ? buildPickerThumbnailIndex(catalogRows) : {};
    const catalogIndex = catalogRows ? toCatalogRowIndex(catalogRows) : undefined;
    const needsFallback = candidates.filter((candidate) => !pickThumbnailUrl(thumbnails, candidate.id));
    const signedUrls = await createSignedUrlMap(admin, needsFallback.map((candidate) => candidate.storagePath));

    const items: AdminAssetListItem[] = candidates.map((candidate) => {
      const thumbnailUrl = pickThumbnailUrl(thumbnails, candidate.id);
      return toAdminAssetListItem(candidate, {
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(thumbnailUrl ? {} : { previewUrl: signedUrls.get(candidate.storagePath) }),
        ...(catalogIndex ? { catalogRegistered: isFullyRegistered(candidate, catalogIndex) } : {}),
      });
    });

    const payload: AdminAssetListPayload = { items, truncated };
    // 관리자 전용 목록이고 폴백 signed URL이 섞여 있다. 어떤 캐시에도 남기지 않는다.
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin asset listing failed", JSON.stringify(serializeError(error)));
    return NextResponse.json({ error: "관리 후보를 불러오지 못했습니다." }, { status: 500 });
  }
}

async function readListRows(
  admin: ReturnType<typeof createAdminClient>,
  assetKind: string,
): Promise<{ rows: unknown[]; truncated: boolean }> {
  const rows: unknown[] = [];
  let offset = 0;

  while (rows.length < maxRows) {
    // 상한 바로 앞에서는 한 행을 더 요청해 501~599개인 종류도 정확히 잘렸다고 표시한다.
    // 매번 200개를 요청하면 마지막 짧은 batch를 정상 종료로 오인할 수 있다.
    const requestSize = Math.min(batchSize, maxRows + 1 - rows.length);
    const base = admin.from("admin_assets").select(listSelect);
    // 필터를 먼저 걸고 `range`는 마지막에 둔다. 범위를 잡은 뒤 조건을 더하면 배치 경계가
    // 필터 이전 집합 기준이 되어 페이지마다 다른 모집단을 자르게 된다.
    const query = assetKind === legacyAssetKind ? base.is("asset_kind", null) : base.eq("asset_kind", assetKind);

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + requestSize - 1);
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (rows.length > maxRows) return { rows: rows.slice(0, maxRows), truncated: true };
    if (batch.length < requestSize) return { rows, truncated: false };
    offset += batch.length;
  }

  return { rows, truncated: true };
}

/**
 * 이 목록에 실린 에셋의 **현재** catalog object 행.
 *
 * `filterPickerThumbnailRowsForCurrentAssets`로 거르는 것이 핵심이다. 논리 ID만 보면 재저장으로
 * 버려진 옛 revision의 active 행까지 잡힌다. 재저장은 `asset_object_id`를 비우므로
 * (`adminAssets.ts`), 그 뒤 게시가 끊기면 **쓸 수 없는 옛 행만 남는데** 그것을 "등록됨"으로 읽으면
 * 복구가 필요한 카드에서 배지와 재게시 버튼이 사라진다.
 *
 * 실패하면 `undefined`를 돌려준다. 목록을 막지 않되 "등록됨"으로도 속이지 않는다.
 */
async function readActiveCatalogRows(
  admin: ReturnType<typeof createAdminClient>,
  assets: readonly PickerThumbnailAssetRef[],
): Promise<PickerThumbnailRow[] | undefined> {
  if (!assets.length) return [];
  try {
    const { data, error } = await admin
      .from("theme_asset_objects")
      .select("id,logical_asset_id,variant_key,r2_previews")
      .eq("status", "active")
      .in("logical_asset_id", assets.map((asset) => adminLogicalAssetId(asset.id)));
    if (error) throw error;
    return filterPickerThumbnailRowsForCurrentAssets(data ?? [], assets);
  } catch (error) {
    console.warn("Admin asset catalog lookup failed; falling back to signed originals.", JSON.stringify(serializeError(error)));
    return undefined;
  }
}

/**
 * 이 에셋이 **모든 대상 플랫폼에서** catalog로 나갈 수 있는가.
 *
 * 논리 ID 하나에 `canonical`/`android`/`ios` 행이 함께 달리므로, 행이 하나라도 있으면 등록으로
 * 치면 **절반만 게시된 에셋이 완료로 보인다.** 그 경우 나머지 플랫폼은 조용히 legacy 경로로
 * 떨어지는데 카드에는 배지가 없어 고칠 방법이 사라진다.
 *
 * 판정 규칙은 export가 실제로 고르는 방식(`findMatchingCatalogRef`)을 그대로 따른다.
 *   - 그 플랫폼 전용본이 있으면 → 그 variant 포인터에 같은 플랫폼 행이 있어야 한다.
 *     canonical로 대체하지 않는다. 두 바이트가 다를 수 있어 export도 대체하지 않는다.
 *   - 없으면 → 부모 포인터에 `canonical` 또는 그 플랫폼 행이 있어야 한다.
 *
 * 부모 canonical이 없는 빌더 후보는 정상 상태다. 그래서 부모를 항상 요구하지 않고, 전용본이
 * 없는 플랫폼에 대해서만 본다.
 */
function isFullyRegistered(asset: AdminAssetCandidate, index: CatalogRowIndex): boolean {
  // 행은 **자기 논리 에셋 안에서만** 센다. 행 id로만 찾으면 다른 에셋의 행이 포인터가 같다는
  // 이유로 잡힐 수 있다.
  const byRowId = index.get(adminLogicalAssetId(asset.id));
  if (!byRowId) return false;

  return requiredPlatforms(asset).every((platform) => {
    const variant = (asset.variants ?? []).find((item) => item.platform === platform);
    if (variant) return Boolean(variant.assetObjectId && byRowId.get(variant.assetObjectId) === platform);
    if (!asset.assetObjectId) return false;
    const variantKey = byRowId.get(asset.assetObjectId);
    return variantKey === canonicalVariantKey || variantKey === platform;
  });
}

/**
 * 이 에셋이 catalog로 나가야 하는 플랫폼.
 *
 * `asset.platform`은 `selectRepresentativeTarget`이 고른 **타깃 하나**의 값이라 실제 적용 범위보다
 * 좁을 수 있다. 타깃이 여럿이면(예: exact_role은 android, kind 타깃은 ios) 대표만 보고 판정할 때
 * 반대 플랫폼의 누락을 놓치고 배지가 사라진다. export는 매칭되는 타깃마다 판정하므로 여기서도
 * 타깃에서 도출한다.
 *
 * `enabled`로 거르지 않는다. export의 판정(`getAdminAssetCandidateMatchRank`)이 그 컬럼을 보지
 * 않기 때문이다 — "과거 운영 토글의 잔여 컬럼"이라 플랫폼/타깃 종류만 근거로 삼는다. 여기서만
 * 걸러 내면 꺼진 타깃의 플랫폼이 등록 판정에서 빠지는데, export는 그 플랫폼을 그대로 골라
 * legacy로 떨어뜨린다. 카드에는 배지가 없어 복구할 길이 사라진다.
 *
 * 타깃이 하나도 없는 legacy 행은 export도 `asset.platform`으로 타깃을 하나 지어내므로
 * (`resolveMatchTargets`) 같은 폴백을 쓴다.
 */
function requiredPlatforms(asset: AdminAssetCandidate): ThemePlatform[] {
  const fromTargets = (asset.targets ?? []).flatMap((target) => expandPlatform(target.platform));
  return Array.from(new Set(fromTargets.length ? fromTargets : expandPlatform(asset.platform)));
}

function expandPlatform(platform: AdminAssetPlatform): ThemePlatform[] {
  return platform === "all" ? ["android", "ios"] : [platform];
}

/** `logical_asset_id` → (행 `id` → `variant_key`). */
type CatalogRowIndex = ReadonlyMap<string, ReadonlyMap<string, string>>;

function toCatalogRowIndex(rows: readonly PickerThumbnailRow[]): CatalogRowIndex {
  const index = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.variant_key !== "string") continue;
    const logicalAssetId = typeof row.logical_asset_id === "string" ? row.logical_asset_id : "";
    if (!logicalAssetId) continue;
    const byRowId = index.get(logicalAssetId) ?? new Map<string, string>();
    byRowId.set(row.id, row.variant_key);
    index.set(logicalAssetId, byRowId);
  }
  return index;
}

/**
 * 관리 목록의 타일은 canonical 축소본을 쓴다.
 *
 * 피커와 달리 플랫폼을 고르는 화면이 아니다. 플랫폼별 차이는 상세에서 본다.
 */
function pickThumbnailUrl(index: PickerThumbnailIndex, adminAssetId: string): string | undefined {
  const byVariant = index[adminAssetId];
  return byVariant?.[canonicalVariantKey] ?? byVariant?.android ?? byVariant?.ios;
}

async function createSignedUrlMap(
  admin: ReturnType<typeof createAdminClient>,
  paths: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (!uniquePaths.length) return new Map();
  const { data, error } = await admin.storage.from(themeAssetsBucketName).createSignedUrls(uniquePaths, 60 * 10);
  if (error) throw error;
  const urls = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return { message: value.message, code: value.code, details: value.details, hint: value.hint, status: value.status };
  }
  return { message: String(error) };
}
