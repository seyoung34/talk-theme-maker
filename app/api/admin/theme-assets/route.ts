import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { canonicalAdminAssetToCandidate, mapCanonicalAdminAssetRow } from "@/lib/theme/adminAssets";
import { toAdminAssetListItem, type AdminAssetListItem, type AdminAssetListPayload } from "@/lib/theme/adminAssetList";
import { adminLogicalAssetId, canonicalVariantKey } from "@/lib/theme/assetCatalog/logicalAssetId";
import { buildPickerThumbnailIndex, filterPickerThumbnailRowsForCurrentAssets, type PickerThumbnailAssetRef, type PickerThumbnailIndex } from "@/lib/theme/assetCatalog/pickerThumbnails";
import { getR2PreviewOrigin } from "@/lib/theme/assetCatalog/previewUrl";
import { themeAssetsBucketName } from "@/lib/theme/remoteAssets";

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

const allowedAssetKinds = new Set(["background", "icon", "bubble", "profile", "launcher", "passcode", "passcode_indicator"]);

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

    const thumbnails = await readThumbnailIndex(admin, candidates);
    const needsFallback = candidates.filter((candidate) => !pickThumbnailUrl(thumbnails, candidate.id));
    const signedUrls = await createSignedUrlMap(admin, needsFallback.map((candidate) => candidate.storagePath));

    const items: AdminAssetListItem[] = candidates.map((candidate) => {
      const thumbnailUrl = pickThumbnailUrl(thumbnails, candidate.id);
      return toAdminAssetListItem(candidate, {
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(thumbnailUrl ? {} : { previewUrl: signedUrls.get(candidate.storagePath) }),
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
 * 이 목록에 실린 에셋의 R2 축소본 색인.
 *
 * 실패해도 목록을 막지 않는다 — 썸네일이 없으면 아래에서 원본 signed URL로 떨어지므로
 * registry 장애가 관리 화면 전체를 세우지 않는다.
 */
async function readThumbnailIndex(
  admin: ReturnType<typeof createAdminClient>,
  assets: readonly PickerThumbnailAssetRef[],
): Promise<PickerThumbnailIndex> {
  if (!assets.length || !getR2PreviewOrigin()) return {};
  try {
    const { data, error } = await admin
      .from("theme_asset_objects")
      .select("id,logical_asset_id,variant_key,r2_previews")
      .eq("status", "active")
      .in("logical_asset_id", assets.map((asset) => adminLogicalAssetId(asset.id)));
    if (error) throw error;
    return buildPickerThumbnailIndex(filterPickerThumbnailRowsForCurrentAssets(data ?? [], assets));
  } catch (error) {
    console.warn("Admin asset thumbnail lookup failed; falling back to signed originals.", JSON.stringify(serializeError(error)));
    return {};
  }
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
