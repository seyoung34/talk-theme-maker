import { NextRequest, NextResponse } from "next/server";

import { createTtlCache } from "@/lib/shared/ttlCache";
import { createAdminClient } from "@/lib/supabase/server";
import { canonicalAdminAssetToCandidate, mapCanonicalAdminAssetRow, withAdminAssetPlatformVariant, type AdminAssetCandidate, type AdminAssetKind, type AdminAssetTarget } from "@/lib/theme/adminAssets";
import {
  getAdminAssetRecommendationPool,
  selectAdminAssetRecommendationPoolTargetMatch,
  selectAdminAssetTargetMatch,
  type AdminAssetRecommendationPool,
} from "@/lib/theme/adminAssetWorkspace";
import type { ThemeResourceRole } from "@/lib/theme/types";
import { adminLogicalAssetId } from "@/lib/theme/assetCatalog/logicalAssetId";
import { buildPickerThumbnailIndex, filterPickerThumbnailRowsForCurrentAssets, selectPickerThumbnailUrl, type PickerThumbnailAssetRef, type PickerThumbnailIndex } from "@/lib/theme/assetCatalog/pickerThumbnails";
import { getR2PreviewOrigin } from "@/lib/theme/assetCatalog/previewUrl";
import { isCatalogExportAssetAllowed, warnOnCatalogExportScopeDrift } from "@/lib/theme/assetCatalog/exportGate";
import { findMatchingCatalogRef } from "@/lib/theme/assetCatalog/recommendedCatalog";
import { createRegistryStore } from "@/lib/theme/assetCatalog/registryStore";

const bucketName = "theme-assets";
const allowedAssetKinds = new Set(["background", "icon", "bubble", "profile", "launcher", "passcode"]);
/** 한 번의 PostgREST 요청 크기. 추천 결과를 정확히 정렬하려면 모든 source를 읽어야 한다. */
const sourceBatchSize = 200;
const recommendedPageCacheTtlSeconds = 30;
/**
 * cursor 형식 버전.
 *
 * cursor는 `matchRank` 위에서 자르므로, 랭킹 규칙이 바뀌면 예전 cursor의 rank 숫자는 새 정렬에서
 * 다른 지점을 가리킨다. rank만 검사하면 예전 rank 0/1 cursor가 "유효한 값"으로 통과해 조용히
 * 후보를 건너뛴다. 버전 토큰을 앞에 붙여 규칙이 바뀔 때마다 올리고, 토큰이 맞지 않는 cursor는
 * 전부 첫 페이지로 되돌린다.
 */
const recommendedCursorVersion = "v2";

const recommendedAssetSelect = [
  "id",
  "slot_role",
  "platform",
  "asset_kind",
  "analysis",
  "bubble_adjustment",
  "title",
  "note",
  "tags",
  "file_name",
  "mime_type",
  "storage_path",
  "asset_object_id",
  "enabled",
  "created_at",
  "updated_at",
  "admin_asset_targets(id,asset_id,platform,slot_role,target_kind,priority,enabled)",
  "admin_asset_bubble_specs(asset_id,android_markers,ios_insets,ios_stretch,geometry)",
  "admin_asset_variants(id,asset_id,platform,storage_path,asset_object_id,file_name,mime_type,analysis)",
].join(",");

type RecommendedResponseItem = AdminAssetCandidate & {
  readonly target: AdminAssetTarget;
  readonly matchRank: 0 | 1;
  /**
   * 피커 타일 전용 축소본(R2).
   *
   * `previewUrl`을 대체하지 않는다 — 그 필드는 이미지 편집기의 원본 소스이기도 해서, 축소본을
   * 넣으면 추천 에셋을 골라 편집할 때 축소본을 편집하게 된다. 목록은 이 값만 내려받고 원본은
   * 편집기를 열 때 그 한 장만 받는다.
   *
   * R2 origin이 없거나 아직 굽지 않은 에셋에는 없다. 그때 화면은 기존 `previewUrl`로 그린다.
   */
  readonly thumbnailUrl?: string;
};

type RankedAsset = {
  readonly asset: ReturnType<typeof mapCanonicalAdminAssetRow>;
  readonly target: AdminAssetTarget;
  readonly matchRank: 0 | 1;
};

type Cursor = {
  readonly matchRank: 0 | 1;
  readonly priority: number;
  readonly updatedAt: number;
  readonly id: string;
};

type RecommendedPagePayload = {
  readonly items: readonly RecommendedResponseItem[];
  readonly nextCursor?: string;
};

/**
 * 캐시에 담는 것은 **catalog ref를 뺀** 페이지다.
 *
 * 비싼 부분(원본 배치 조회·랭킹·서명 URL 배치·썸네일 색인)은 30초 재사용해도 안전하다. 서명 URL은
 * TTL이 10분이라 이 창보다 훨씬 길고, 썸네일은 화면에만 쓰인다.
 *
 * 서버까지 도달한 요청은 catalog ref만 다시 읽는다. 브라우저와 클라이언트 풀 캐시가 응답을
 * 보유하는 동안에는 함께 재사용되므로, 그 신선도 상한은 각 캐시의 hard expiry가 정한다.
 */
type RecommendedPageBase = {
  readonly entries: readonly {
    readonly assetId: string;
    readonly candidate: AdminAssetCandidate;
    readonly usesPlatformVariant: boolean;
    readonly target: AdminAssetTarget;
    readonly matchRank: 0 | 1;
    readonly thumbnailUrl?: string;
  }[];
  readonly nextCursor?: string;
};

const recommendedPageCache = createTtlCache<RecommendedPageBase>({ ttlMs: recommendedPageCacheTtlSeconds * 1000, maxEntries: 128 });

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const platform = request.nextUrl.searchParams.get("platform");
    const assetKind = request.nextUrl.searchParams.get("assetKind");
    // 모르는 role은 그대로 흘려보낸다. 어떤 `exact_role` target과도 맞지 않아 kind 전체 후보만
    // 남을 뿐이고, 여기서 400을 내면 슬롯 목록이 늘어날 때마다 이 라우트가 같이 막힌다.
    const slotRole = (request.nextUrl.searchParams.get("slotRole") || undefined) as ThemeResourceRole | undefined;
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 24));
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    const cursor = decodeCursor(cursorParam);

    if (!isAllowedPlatform(platform) || !isAllowedAssetKind(assetKind)) {
      return NextResponse.json({ error: "Valid platform and assetKind are required." }, { status: 400 });
    }

    // 편집기에서 슬롯을 고를 때마다 호출되는 경로다. 등록 후보 집합을 짧게 재사용해
    // 슬롯 클릭마다 원본 전체를 다시 읽지 않게 한다.
    const recommendationPool = slotRole ? getAdminAssetRecommendationPool({ role: slotRole, kind: assetKind }, platform) : undefined;
    const cacheKey = [recommendationPool?.key ?? `${platform}|${assetKind}|all`, limit, cursor ? cursorParam : ""].join("|");
    const admin = createAdminClient();
    const cached = recommendedPageCache.get(cacheKey);
    if (cached) return jsonRecommendedPage(await attachCatalogRefs(admin, cached, platform));

    const data = await readRecommendedSourceRows(admin, assetKind);

    const ranked = (data)
      .map((row: unknown) => mapCanonicalAdminAssetRow(row))
      .flatMap((asset) => rankAsset(asset, platform, assetKind, recommendationPool))
      .sort(compareRankedAssets);
    const cursorFiltered = cursor ? ranked.filter((item) => compareRankedAssetToCursor(item, cursor) > 0) : ranked;
    const page = cursorFiltered.slice(0, limit);
    const hasMore = cursorFiltered.length > limit;
    const signedUrls = await createSignedUrlMap(admin, page.map((item) => item.asset.variants.find((variant) => variant.platform === platform)?.storagePath ?? item.asset.storagePath));
    const signedUrlRecord = Object.fromEntries(signedUrls);
    const prepared = page.map((item) => {
      const candidate = canonicalAdminAssetToCandidate(item.asset, signedUrls.get(item.asset.storagePath), signedUrlRecord);
      const withVariant = withAdminAssetPlatformVariant(candidate, platform);
      return { item, candidate, withVariant };
    });
    const thumbnailIndex = await readPickerThumbnailIndex(admin, prepared.map(({ withVariant }) => withVariant));

    const entries = prepared.map(({ item, candidate, withVariant }) => {
      /**
       * 플랫폼 원본으로 바뀌었는지 본다.
       *
       * 바뀌었다면 canonical 썸네일은 **다른 그림**이다. 그대로 보여 주면 화면과 선택 결과가
       * 어긋나므로, 대응하는 variant 썸네일이 없을 때는 `thumbnailUrl`을 주지 않고 같은 플랫폼의
       * `previewUrl`로 떨어뜨린다.
       */
      const usesPlatformVariant = withVariant.storagePath !== candidate.storagePath;
      const thumbnailUrl = selectPickerThumbnailUrl({
        index: thumbnailIndex,
        adminAssetId: item.asset.id,
        platform,
        usesPlatformVariant,
      });
      return {
        assetId: item.asset.id,
        candidate: withVariant,
        usesPlatformVariant,
        target: item.target,
        matchRank: item.matchRank,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
    });
    const last = page.at(-1);
    const base: RecommendedPageBase = { entries, nextCursor: hasMore && last ? encodeCursor(last) : undefined };

    recommendedPageCache.set(cacheKey, base);
    return jsonRecommendedPage(await attachCatalogRefs(admin, base, platform));
  } catch (error) {
    console.error("Recommended asset listing failed", JSON.stringify(serializeError(error)));
    return NextResponse.json({ error: "Failed to load recommended assets." }, { status: 500 });
  }
}

/**
 * 추천 API는 target match rank를 메모리에서 계산한다. 첫 200개 source만 읽으면 뒤쪽의 exact target이
 * 누락되어 `nextCursor`가 없는데도 더 좋은 후보가 존재하는 상황이 생긴다. source만 배치로 모두 읽고,
 * 그 뒤에 전역 정렬·페이지 절단을 적용한다.
 */
async function readRecommendedSourceRows(
  admin: ReturnType<typeof createAdminClient>,
  assetKind: AdminAssetKind,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin
      .from("admin_assets")
      .select(recommendedAssetSelect)
      .eq("asset_kind", assetKind)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + sourceBatchSize - 1);

    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < sourceBatchSize) break;
    offset += batch.length;
  }

  return rows;
}

async function readActiveAdminCatalogRecords(admin: ReturnType<typeof createAdminClient>, adminAssetIds: readonly string[]) {
  if (!adminAssetIds.length) return [];
  try {
    const variantKeys = ["canonical", "android", "ios"];
    return await createRegistryStore(admin).findActiveByKeys(
      Array.from(new Set(adminAssetIds)).flatMap((id) =>
        variantKeys.map((variantKey) => ({ logicalAssetId: adminLogicalAssetId(id), variantKey })),
      ),
    );
  } catch (error) {
    // registry는 export 최적화 metadata다. 조회가 잠시 실패해도 추천 목록을 막지 않고 기존
    // signed URL/field 경로로 돌아간다. 실패는 thumbnail 조회와 같은 운영 로그에서 확인한다.
    console.warn("Recommended catalog lookup failed; falling back to field uploads.", JSON.stringify(serializeError(error)));
    return [];
  }
}

/**
 * 서버 메모리 캐시의 페이지에 요청 시점의 catalog ref를 붙인다.
 *
 * 라우트에 도달한 요청에서는 registry만 다시 조회한다. 단, `private, max-age=30` 응답과
 * 클라이언트 풀 캐시는 그 시점의 ref도 함께 보유한다.
 */
async function attachCatalogRefs(
  admin: ReturnType<typeof createAdminClient>,
  base: RecommendedPageBase,
  platform: "android" | "ios",
): Promise<RecommendedPagePayload> {
  warnOnCatalogExportScopeDrift(platform);
  const catalogRecords = await readActiveAdminCatalogRecords(admin, base.entries.map((entry) => entry.assetId));
  const items: readonly RecommendedResponseItem[] = base.entries.map((entry) => {
    // 범위 판정은 ref를 나눠 주는 서버가 한다. 브라우저는 서버 allowlist를 볼 수 없어, 두
    // 목록이 어긋나면 범위 밖 ref를 만들고 export 전체가 503이 된다. 여기서 빼면 그 자산은
    // 기존 File 업로드 경로로 조용히 동작한다.
    const catalog = isCatalogExportAssetAllowed(platform, adminLogicalAssetId(entry.assetId))
      ? findMatchingCatalogRef(catalogRecords, entry.candidate, platform, entry.usesPlatformVariant)
      : undefined;
    return {
      ...entry.candidate,
      ...(catalog ? { catalog } : {}),
      target: entry.target,
      matchRank: entry.matchRank,
      ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
    };
  });
  return { items, ...(base.nextCursor ? { nextCursor: base.nextCursor } : {}) };
}

// 서명 URL TTL(10분)보다 훨씬 짧게 잡아, 캐시된 응답의 URL이 만료된 채 나가지 않게 한다.
function jsonRecommendedPage(payload: RecommendedPagePayload) {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": `private, max-age=${recommendedPageCacheTtlSeconds}` },
  });
}

/**
 * 이 에셋을 요청 슬롯에 추천할 수 있으면 근거 target 하나와 순위를 붙여 돌려준다.
 *
 * role이 있는 요청은 호환 family의 모든 exact target을 같은 rank로 평탄화한다. 허용 범위는
 * export 게이트가 사용하는 `selectAdminAssetTargetMatch(..., allowCompatibleExactRole: true)`와
 * 동일하고, 여기서는 어느 family 멤버에서 요청해도 정렬과 cursor가 같게 만드는 일만 더 한다.
 */
function rankAsset(
  asset: ReturnType<typeof mapCanonicalAdminAssetRow>,
  platform: "android" | "ios",
  assetKind: AdminAssetKind,
  recommendationPool: AdminAssetRecommendationPool | undefined,
): readonly RankedAsset[] {
  const match = recommendationPool
    ? selectAdminAssetRecommendationPoolTargetMatch(recommendationPool, asset)
    : selectAdminAssetTargetMatch({ kind: assetKind }, asset, platform);
  return match ? [{ asset, target: match.target, matchRank: match.rank }] : [];
}

/**
 * 이 페이지에 실린 추천 에셋의 피커 썸네일 URL.
 *
 * registry 조회가 실패해도 목록 자체는 실패시키지 않는다. 썸네일이 없으면 화면이 기존
 * `previewUrl`로 그리므로, 전환 중 registry 문제로 피커가 통째로 안 뜨는 일이 없어야 한다.
 */
async function readPickerThumbnailIndex(
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
    console.warn("Picker thumbnail lookup failed; falling back to original preview URLs.", JSON.stringify(serializeError(error)));
    return {};
  }
}

async function createSignedUrlMap(admin: ReturnType<typeof createAdminClient>, paths: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const uniquePaths = Array.from(new Set(paths));
  if (uniquePaths.length < 1) return new Map();
  const { data, error } = await admin.storage.from(bucketName).createSignedUrls(uniquePaths, 60 * 10);
  if (error) throw error;
  const urls = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

function compareRankedAssets(left: RankedAsset, right: RankedAsset): number {
  return (
    left.matchRank - right.matchRank ||
    right.target.priority - left.target.priority ||
    right.asset.updatedAt - left.asset.updatedAt ||
    right.asset.id.localeCompare(left.asset.id) ||
    (right.target.id ?? "").localeCompare(left.target.id ?? "")
  );
}

function compareRankedAssetToCursor(item: RankedAsset, cursor: Cursor): number {
  return (
    item.matchRank - cursor.matchRank ||
    cursor.priority - item.target.priority ||
    cursor.updatedAt - item.asset.updatedAt ||
    cursor.id.localeCompare(item.asset.id)
  );
}

function encodeCursor(item: RankedAsset): string {
  return [recommendedCursorVersion, item.matchRank, item.target.priority, item.asset.updatedAt, item.asset.id].join("|");
}

/**
 * 버전이 다르거나 형식이 깨진 cursor는 첫 페이지로 되돌린다.
 *
 * 랭킹 변경 전에 발급된 cursor는 버전 토큰이 없어 rank 값과 무관하게 전부 거부된다. 그 탭은
 * 새로고침 없이도 1페이지부터 다시 시작하며, 클라이언트의 ID 중복 제거가 재노출을 흡수한다.
 */
function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  const [version, matchRankValue, priorityValue, updatedAtValue, id] = value.split("|");
  if (version !== recommendedCursorVersion) return null;
  const matchRank = Number(matchRankValue);
  const priority = Number(priorityValue);
  const updatedAt = Number(updatedAtValue);
  if ((matchRank !== 0 && matchRank !== 1) || !Number.isInteger(priority) || !Number.isFinite(updatedAt) || !id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return null;
  }
  return { matchRank, priority, updatedAt, id };
}

function isAllowedPlatform(value: string | null): value is "android" | "ios" {
  return value === "android" || value === "ios";
}

function isAllowedAssetKind(value: string | null): value is AdminAssetKind {
  return Boolean(value && allowedAssetKinds.has(value));
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return { message: value.message, code: value.code, details: value.details, hint: value.hint, status: value.status };
  }
  return { message: String(error) };
}
