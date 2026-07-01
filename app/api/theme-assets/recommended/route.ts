import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";
import { canonicalAdminAssetToCandidate, mapCanonicalAdminAssetRow, type AdminAssetCandidate, type AdminAssetKind, type AdminAssetTarget } from "@/lib/theme/adminAssets";

const bucketName = "theme-assets";
const allowedPlatforms = new Set(["android", "ios"]);
const allowedAssetKinds = new Set(["background", "icon", "bubble", "profile", "launcher", "passcode"]);
const maxSourceRows = 200;

type RecommendedResponseItem = AdminAssetCandidate & {
  readonly target: AdminAssetTarget;
  readonly matchRank: 0 | 1 | 2;
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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const platform = request.nextUrl.searchParams.get("platform");
    const assetKind = request.nextUrl.searchParams.get("assetKind");
    const slotRole = request.nextUrl.searchParams.get("slotRole") || undefined;
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 24));
    const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));

    if (!isAllowedPlatform(platform) || !isAllowedAssetKind(assetKind)) {
      return NextResponse.json({ error: "Valid platform and assetKind are required." }, { status: 400 });
    }

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
          "admin_asset_bubble_specs(asset_id,android_markers,ios_insets,ios_stretch)",
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
    const signedUrls = await createSignedUrlMap(
      admin,
      page.map((item) => item.asset.storagePath),
    );

    const items: readonly RecommendedResponseItem[] = page.map((item) => ({
      ...canonicalAdminAssetToCandidate(item.asset, signedUrls.get(item.asset.storagePath)),
      target: item.target,
      matchRank: item.matchRank,
    }));
    const last = page.at(-1);

    return NextResponse.json({
      items,
      nextCursor: hasMore && last ? encodeCursor(last) : undefined,
    });
  } catch (error) {
    console.error("Recommended asset listing failed", JSON.stringify(serializeError(error)));
    return NextResponse.json({ error: "Failed to load recommended assets." }, { status: 500 });
  }
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
  return false;
}

function isSharedBackgroundRole(role: string): boolean {
  return role === "main_background" || role === "chat_background" || role === "tab_background_image";
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
