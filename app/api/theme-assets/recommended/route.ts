import { NextRequest, NextResponse } from "next/server";

import { createTtlCache } from "@/lib/shared/ttlCache";
import { createAdminClient } from "@/lib/supabase/server";
import { canonicalAdminAssetToCandidate, mapCanonicalAdminAssetRow, withAdminAssetPlatformVariant, type AdminAssetCandidate, type AdminAssetKind, type AdminAssetTarget } from "@/lib/theme/adminAssets";
import { adminLogicalAssetId } from "@/lib/theme/assetCatalog/logicalAssetId";
import { buildPickerThumbnailUrls } from "@/lib/theme/assetCatalog/pickerThumbnails";
import { getR2PreviewOrigin } from "@/lib/theme/assetCatalog/previewUrl";

const bucketName = "theme-assets";
const allowedPlatforms = new Set(["android", "ios"]);
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
          "enabled",
          "created_at",
          "updated_at",
           "admin_asset_targets(id,asset_id,platform,slot_role,target_kind,priority,enabled)",
           "admin_asset_bubble_specs(asset_id,android_markers,ios_insets,ios_stretch,geometry)",
           "admin_asset_variants(id,asset_id,platform,storage_path,file_name,mime_type,analysis)",
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
    const thumbnailUrls = await readPickerThumbnailUrls(admin, page.map((item) => item.asset.id));

    const items: readonly RecommendedResponseItem[] = page.map((item) => {
      const thumbnailUrl = thumbnailUrls[item.asset.id];
      return {
        ...withAdminAssetPlatformVariant(
          canonicalAdminAssetToCandidate(item.asset, signedUrls.get(item.asset.storagePath), signedUrlRecord),
          platform,
        ),
        target: item.target,
        matchRank: item.matchRank,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
    });
    const last = page.at(-1);
    const payload: RecommendedPagePayload = { items, nextCursor: hasMore && last ? encodeCursor(last) : undefined };

    recommendedPageCache.set(cacheKey, payload);
    return jsonRecommendedPage(payload);
  } catch (error) {
    console.error("Recommended asset listing failed", JSON.stringify(serializeError(error)));
    return NextResponse.json({ error: "Failed to load recommended assets." }, { status: 500 });
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
async function readPickerThumbnailUrls(
  admin: ReturnType<typeof createAdminClient>,
  adminAssetIds: readonly string[],
): Promise<Record<string, string>> {
  if (!adminAssetIds.length || !getR2PreviewOrigin()) return {};
  try {
    const { data, error } = await admin
      .from("theme_asset_objects")
      .select("logical_asset_id,variant_key,r2_previews")
      .eq("status", "active")
      .in("logical_asset_id", adminAssetIds.map(adminLogicalAssetId));
    if (error) throw error;
    return buildPickerThumbnailUrls(data ?? []);
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
