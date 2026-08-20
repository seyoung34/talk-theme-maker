import { NextRequest, NextResponse } from "next/server";

import { createTtlCache } from "@/lib/shared/ttlCache";
import { createAdminClient } from "@/lib/supabase/server";
import { canonicalAdminAssetToCandidate, mapCanonicalAdminAssetRow, withAdminAssetPlatformVariant, type AdminAssetCandidate, type AdminAssetKind, type AdminAssetTarget } from "@/lib/theme/adminAssets";
import { adminLogicalAssetId } from "@/lib/theme/assetCatalog/logicalAssetId";
import { buildPickerThumbnailIndex, selectPickerThumbnailUrl, type PickerThumbnailIndex } from "@/lib/theme/assetCatalog/pickerThumbnails";
import { getR2PreviewOrigin } from "@/lib/theme/assetCatalog/previewUrl";
import { findMatchingCatalogRef } from "@/lib/theme/assetCatalog/recommendedCatalog";
import { createRegistryStore } from "@/lib/theme/assetCatalog/registryStore";

const bucketName = "theme-assets";
const allowedAssetKinds = new Set(["background", "icon", "bubble", "profile", "launcher", "passcode", "passcode_indicator"]);
const maxSourceRows = 200;
const recommendedPageCacheTtlSeconds = 30;

type RecommendedResponseItem = AdminAssetCandidate & {
  readonly target: AdminAssetTarget;
  readonly matchRank: 0 | 1 | 2;
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
  readonly matchRank: 0 | 1 | 2;
};

type Cursor = {
  readonly matchRank: 0 | 1 | 2;
  readonly priority: number;
  readonly updatedAt: number;
  readonly id: string;
};

type RecommendedPagePayload = {
  readonly items: readonly RecommendedResponseItem[];
  readonly nextCursor?: string;
};

const recommendedPageCache = createTtlCache<RecommendedPagePayload>({ ttlMs: recommendedPageCacheTtlSeconds * 1000, maxEntries: 128 });

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const platform = request.nextUrl.searchParams.get("platform");
    const assetKind = request.nextUrl.searchParams.get("assetKind");
    const slotRole = request.nextUrl.searchParams.get("slotRole") || undefined;
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 24));
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    const cursor = decodeCursor(cursorParam);

    if (!isAllowedPlatform(platform) || !isAllowedAssetKind(assetKind)) {
      return NextResponse.json({ error: "Valid platform and assetKind are required." }, { status: 400 });
    }

    // 편집기에서 슬롯을 고를 때마다 호출되는 경로다. 응답은 사용자와 무관하게
    // enabled 에셋만 담으므로 짧게 재사용해 슬롯 클릭마다 200행 조인을 다시 읽지 않게 한다.
    const cacheKey = [platform, assetKind, slotRole ?? "", limit, cursor ? cursorParam : ""].join("|");
    // catalog ref가 들어간 응답은 애초에 캐시에 넣지 않는다(아래 `set` 참조). 여기서 다시
    // 거를 필요가 없다 — 조건을 남겨 두면 캐시가 catalog를 담을 수 있는 것처럼 읽힌다.
    const cached = recommendedPageCache.get(cacheKey);
    if (cached) return jsonRecommendedPage(cached);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_assets")
      .select(
        [
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
        ].join(","),
      )
      .eq("enabled", true)
      .eq("asset_kind", assetKind)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(maxSourceRows);

    if (error) throw error;

    const ranked = (data ?? [])
      .map((row: unknown) => mapCanonicalAdminAssetRow(row))
      .flatMap((asset) => matchingTargets(asset, platform, slotRole, assetKind))
      .sort(compareRankedAssets);
    const cursorFiltered = cursor ? ranked.filter((item) => compareRankedAssetToCursor(item, cursor) > 0) : ranked;
    const page = cursorFiltered.slice(0, limit);
    const hasMore = cursorFiltered.length > limit;
    const signedUrls = await createSignedUrlMap(admin, page.map((item) => item.asset.variants.find((variant) => variant.platform === platform)?.storagePath ?? item.asset.storagePath));
    const signedUrlRecord = Object.fromEntries(signedUrls);
    const catalogRecords = await readActiveAdminCatalogRecords(admin, page.map((item) => item.asset.id));
    const thumbnailIndex = await readPickerThumbnailIndex(admin, page.map((item) => item.asset.id));

    const items: readonly RecommendedResponseItem[] = page.map((item) => {
      const candidate = canonicalAdminAssetToCandidate(item.asset, signedUrls.get(item.asset.storagePath), signedUrlRecord);
      const withVariant = withAdminAssetPlatformVariant(candidate, platform);
      /**
       * 플랫폼 원본으로 바뀌었는지 본다.
       *
       * 바뀌었다면 canonical 썸네일은 **다른 그림**이다. 그대로 보여 주면 화면과 선택 결과가
       * 어긋나므로, 대응하는 variant 썸네일이 없을 때는 `thumbnailUrl`을 주지 않고 같은 플랫폼의
       * `previewUrl`로 떨어뜨린다.
       */
      const usesPlatformVariant = withVariant.storagePath !== candidate.storagePath;
      const catalog = findMatchingCatalogRef(catalogRecords, withVariant, platform, usesPlatformVariant);
      const thumbnailUrl = selectPickerThumbnailUrl({
        index: thumbnailIndex,
        adminAssetId: item.asset.id,
        platform,
        usesPlatformVariant,
      });
      return {
        ...withVariant,
        ...(catalog ? { catalog } : {}),
        target: item.target,
        matchRank: item.matchRank,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
    });
    const last = page.at(-1);
    const payload: RecommendedPagePayload = { items, nextCursor: hasMore && last ? encodeCursor(last) : undefined };

    // catalog ref가 든 응답은 캐시하지 않는다. 관리자가 같은 Storage 경로에 새 이미지를 올린
    // 직후 30초 동안 예전 object id를 재사용하면, 피커는 새 그림을 보여 주면서 export에는 옛
    // 바이트를 가리키는 ref를 실어 보낸다.
    //
    // 대가는 성능이다 — 링크된 에셋이 늘수록 이 페이지는 캐시를 거의 못 쓰고 슬롯 클릭마다
    // 200행 조인·서명 배치·registry 조회를 다시 돈다. 캐시를 되살리려면 payload를 registry
    // 링크에 종속되는 키로 잡거나, 변하지 않는 부분만 캐시하고 catalog ref만 매번 붙여야 한다.
    if (!items.some((item) => Boolean(item.catalog))) recommendedPageCache.set(cacheKey, payload);
    return jsonRecommendedPage(payload);
  } catch (error) {
    console.error("Recommended asset listing failed", JSON.stringify(serializeError(error)));
    return NextResponse.json({ error: "Failed to load recommended assets." }, { status: 500 });
  }
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

// 서명 URL TTL(10분)보다 훨씬 짧게 잡아, 캐시된 응답의 URL이 만료된 채 나가지 않게 한다.
function jsonRecommendedPage(payload: RecommendedPagePayload) {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": `private, max-age=${recommendedPageCacheTtlSeconds}` },
  });
}

function matchingTargets(asset: ReturnType<typeof mapCanonicalAdminAssetRow>, platform: "android" | "ios", slotRole: string | undefined, assetKind: AdminAssetKind): readonly RankedAsset[] {
  const matches: RankedAsset[] = [];
  for (const target of asset.targets) {
    if (!target.enabled || (target.platform !== platform && target.platform !== "all")) continue;
    if (target.targetKind === "exact_role" && slotRole && target.slotRole === slotRole) {
      matches.push({ asset, target, matchRank: 0 });
    } else if (target.targetKind === "exact_role" && slotRole && target.slotRole && isCompatibleExactRole(assetKind, target.slotRole, slotRole)) {
      matches.push({ asset, target, matchRank: 1 });
    } else if (target.targetKind === "asset_kind" && !target.slotRole) {
      matches.push({ asset, target, matchRank: 1 });
    } else if (target.targetKind === "shape_rule" && !target.slotRole) {
      matches.push({ asset, target, matchRank: 2 });
    }
  }
  return matches;
}

function isCompatibleExactRole(assetKind: AdminAssetKind, targetRole: string, requestedRole: string): boolean {
  if (assetKind === "bubble") return targetRole.startsWith("bubble_") && requestedRole.startsWith("bubble_");
  if (assetKind === "background") return isSharedBackgroundRole(targetRole) && isSharedBackgroundRole(requestedRole);
  if (assetKind === "icon") return targetRole.startsWith("tab_icon_") && requestedRole.startsWith("tab_icon_");
  if (assetKind === "passcode_indicator") return targetRole.startsWith("passcode_indicator") && requestedRole.startsWith("passcode_indicator");
  return false;
}

function isSharedBackgroundRole(role: string): boolean {
  return role === "main_background" || role === "chat_background" || role === "tab_background_image";
}

/**
 * 이 페이지에 실린 추천 에셋의 피커 썸네일 URL.
 *
 * registry 조회가 실패해도 목록 자체는 실패시키지 않는다. 썸네일이 없으면 화면이 기존
 * `previewUrl`로 그리므로, 전환 중 registry 문제로 피커가 통째로 안 뜨는 일이 없어야 한다.
 */
async function readPickerThumbnailIndex(
  admin: ReturnType<typeof createAdminClient>,
  adminAssetIds: readonly string[],
): Promise<PickerThumbnailIndex> {
  if (!adminAssetIds.length || !getR2PreviewOrigin()) return {};
  try {
    const { data, error } = await admin
      .from("theme_asset_objects")
      .select("logical_asset_id,variant_key,r2_previews")
      .eq("status", "active")
      .in("logical_asset_id", adminAssetIds.map(adminLogicalAssetId));
    if (error) throw error;
    return buildPickerThumbnailIndex(data ?? []);
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
    right.asset.id.localeCompare(left.asset.id)
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
  return [item.matchRank, item.target.priority, item.asset.updatedAt, item.asset.id].join("|");
}

function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  const [matchRankValue, priorityValue, updatedAtValue, id] = value.split("|");
  const matchRank = Number(matchRankValue);
  const priority = Number(priorityValue);
  const updatedAt = Number(updatedAtValue);
  if ((matchRank !== 0 && matchRank !== 1 && matchRank !== 2) || !Number.isInteger(priority) || !Number.isFinite(updatedAt) || !id || !/^[0-9a-f-]{36}$/i.test(id)) {
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
