import { createClient } from "@/lib/supabase/client";
import { readJsonResponse } from "@/lib/shared/api/http";
import {
  getThemeAssetSignedUrls,
  sanitizeStoragePathPart,
  storagePathToFile,
  storagePathToPreviewUrl,
  themeAssetsBucketName,
} from "@/lib/theme/remoteAssets";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";
import {
  assertValidAdminAssetCandidateInput,
  canonicalAdminAssetToCandidate,
  createAdminAssetPersistencePayload,
  inferAdminAssetKind,
  isValidBubbleAdjustment,
  mapCanonicalAdminAssetRow,
  type AdminAssetCandidate,
  type AdminAssetCandidateInput,
  type AdminAssetCandidateUpdate,
  type AdminAssetKind,
  type AdminAssetListOptions,
  type AdminAssetPage,
  type AdminBubbleSpec,
  type AdminAssetAnalysis,
} from "@/lib/theme/adminAssetDomain";

export {
  assertValidAdminAssetCandidateInput,
  bubbleAdjustmentToSpec,
  bubbleSpecToAdjustment,
  canonicalAdminAssetToCandidate,
  inferAdminAssetKind,
  mapCanonicalAdminAssetRow,
  type AdminAssetCandidate,
  type AdminAssetCandidateInput,
  type AdminAssetCandidateUpdate,
  type AdminAssetKind,
  type AdminAssetListOptions,
  type AdminAssetPage,
  type AdminAssetPlatform,
  type AdminAssetRecommendationItem,
  type AdminAssetShape,
  type AdminAssetAnalysis,
  type AdminAssetTarget,
  type AdminAssetTargetInput,
  type AdminAssetTargetKind,
  type AdminBubbleAdjustment,
  type AdminBubbleSpec,
  type CanonicalAdminAsset,
} from "@/lib/theme/adminAssetDomain";

const adminAssetSelect = [
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
].join(",");

export async function listAdminAssetCandidates(): Promise<AdminAssetCandidate[]> {
  return (await listAdminAssetCandidatePage({ limit: 30 })).items;
}

export async function listAdminAssetCandidatePage(options: AdminAssetListOptions = {}): Promise<AdminAssetPage> {
  const supabase = createClient();
  const limit = Math.min(50, Math.max(1, options.limit ?? 24));
  const cursor = decodeCursor(options.cursor);
  let query = supabase
    .from("admin_assets")
    .select(adminAssetSelect)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (options.assetKind) query = query.eq("asset_kind", options.assetKind);
  if (options.enabledOnly) query = query.eq("enabled", true);
  if (cursor) query = query.or(`updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`);

  const { data, error } = await query;
  if (error) throw error;

  const allRows = Array.isArray(data) ? data : [];
  const platform = options.platform;
  const platformRows = platform ? allRows.filter((row) => rowMatchesPlatform(row, platform)) : allRows;
  const hasMore = platformRows.length > limit;
  const pageRows = hasMore ? platformRows.slice(0, limit) : platformRows;
  const canonicalAssets = pageRows.map(mapCanonicalAdminAssetRow);
  const previewUrls = await getThemeAssetSignedUrls(canonicalAssets.map((asset) => asset.storagePath));
  const items = canonicalAssets.map((asset) => canonicalAdminAssetToCandidate(asset, previewUrls[asset.storagePath]));
  const last = canonicalAssets.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor(new Date(last.updatedAt).toISOString(), last.id) : undefined };
}

export async function listRecommendedAssetCandidatePage(options: Required<Pick<AdminAssetListOptions, "platform" | "assetKind">> & AdminAssetListOptions): Promise<AdminAssetPage> {
  const params = new URLSearchParams({
    platform: options.platform,
    assetKind: options.assetKind,
    limit: String(Math.min(50, Math.max(1, options.limit ?? 24))),
  });
  if (options.slotRole) params.set("slotRole", options.slotRole);
  if (options.cursor) params.set("cursor", options.cursor);
  const response = await fetch(`/api/theme-assets/recommended?${params.toString()}`, { cache: "no-store" });
  const payload = await readJsonResponse<AdminAssetPage & { readonly error?: string }>(response);
  if (!response.ok) throw new Error(payload.error ?? "추천 에셋을 불러오지 못했습니다.");
  return { items: payload.items ?? [], nextCursor: payload.nextCursor };
}

export async function saveAdminAssetCandidate(input: AdminAssetCandidateInput): Promise<AdminAssetCandidate> {
  assertValidAdminAssetCandidateInput(input);
  const supabase = createClient();
  const id = input.id ?? crypto.randomUUID();
  const storagePath = `admin-assets/${id}/${sanitizeStoragePathPart(input.fileName)}`;
  const mimeType = input.mimeType || "application/octet-stream";

  const { error: uploadError } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, input.blob, {
    contentType: mimeType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  try {
    const { data: userData } = await supabase.auth.getUser();
    const payload = createAdminAssetPersistencePayload(input, id, storagePath, userData.user?.id ?? null);
    const { data, error } = await supabase.from("admin_assets").upsert(payload.asset).select(adminAssetSelect).single();
    if (error) throw error;

    await replaceAdminAssetTargets(id, payload.targets);
    await replaceAdminAssetBubbleSpec(id, payload.bubbleSpec);

    const canonical = mapCanonicalAdminAssetRow({
      ...requireObject(data),
      admin_asset_targets: payload.targets,
      admin_asset_bubble_specs: payload.bubbleSpec,
    });
    return canonicalAdminAssetToCandidate(canonical, await storagePathToPreviewUrl(canonical.storagePath));
  } catch (error) {
    if (!input.id) {
      await supabase.from("admin_assets").delete().eq("id", id);
    }
    await supabase.storage.from(themeAssetsBucketName).remove([storagePath]);
    throw error;
  }
}

export async function updateAdminAssetCandidate(id: string, input: AdminAssetCandidateUpdate): Promise<AdminAssetCandidate> {
  const title = input.title.trim();
  if (!title || title.length > 100) throw new Error("INVALID_ASSET_TITLE");
  if (input.bubbleAdjustment && !isValidBubbleAdjustment(input.bubbleAdjustment)) throw new Error("INVALID_BUBBLE_ADJUSTMENT");

  const supabase = createClient();
  const bubbleSpec = input.bubbleSpec;
  const { data, error } = await supabase
    .from("admin_assets")
    .update({
      title,
      ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
      ...(input.bubbleAdjustment ? { bubble_adjustment: input.bubbleAdjustment } : {}),
    })
    .eq("id", id)
    .select(adminAssetSelect)
    .single();
  if (error) throw error;

  const targetRows = input.targets?.map((target) => ({ asset_id: id, platform: target.platform, slot_role: target.slotRole ?? null, target_kind: target.targetKind, priority: target.priority, enabled: target.enabled }));
  if (targetRows) await replaceAdminAssetTargets(id, targetRows);
  if (bubbleSpec) {
    await replaceAdminAssetBubbleSpec(id, {
      asset_id: id,
      android_markers: bubbleSpec.androidMarkers,
      ios_insets: bubbleSpec.iosInsets,
      ios_stretch: bubbleSpec.iosStretch,
    });
  }

  const canonical = mapCanonicalAdminAssetRow(targetRows ? { ...requireObject(data), admin_asset_targets: targetRows } : data);
  return canonicalAdminAssetToCandidate(canonical, await storagePathToPreviewUrl(canonical.storagePath));
}

export async function deleteAdminAssetCandidate(id: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.from("admin_assets").select("storage_path").eq("id", id).maybeSingle();
  const storagePath = readStoragePath(data);
  const { error } = await supabase.from("admin_assets").delete().eq("id", id);
  if (error) throw error;
  if (storagePath) await supabase.storage.from(themeAssetsBucketName).remove([storagePath]);
}

export async function adminAssetToFile(asset: AdminAssetCandidate): Promise<File> {
  if (asset.file) return asset.file;
  if (asset.blob) return new File([asset.blob], asset.fileName, { type: asset.mimeType });
  if (asset.previewUrl) {
    const response = await fetch(asset.previewUrl);
    if (response.ok) return new File([await response.blob()], asset.fileName, { type: asset.mimeType });
  }
  return storagePathToFile(asset.storagePath, asset.fileName, asset.mimeType);
}

export function getAdminAssetKindLabel(kind: AdminAssetKind): string {
  const labels: Record<AdminAssetKind, string> = {
    background: "배경 이미지",
    icon: "아이콘",
    bubble: "말풍선",
    profile: "프로필",
    launcher: "런처 아이콘",
    passcode: "잠금화면",
  };
  return labels[kind];
}

export function isAdminAssetRecommendedForSlot(slot: ThemeAssetSlot, asset: AdminAssetCandidate): boolean {
  if (!asset.enabled) return false;
  if (asset.platform !== "all" && asset.platform !== slot.platform) return false;
  if (asset.slotRole === slot.role) return true;

  const assetKind = asset.assetKind ?? inferAdminAssetKind({ role: asset.slotRole, group: "icons", section: "common", kind: slot.kind });
  const shapes = new Set(asset.analysis?.shapes ?? []);

  if (slot.role.startsWith("tab_icon_")) return assetKind === "icon" && (shapes.size === 0 || shapes.has("square") || shapes.has("transparent"));
  if (slot.role === "theme_icon") return assetKind === "icon" || assetKind === "launcher";
  if (slot.role.startsWith("launcher_")) return assetKind === "launcher" || assetKind === "icon";
  if (slot.role === "profile_image" || slot.role.startsWith("profile_image_")) return assetKind === "profile" || (assetKind === "icon" && shapes.has("square"));
  if (slot.role === "main_background" || slot.role === "chat_background" || slot.role === "passcode_background") return assetKind === "background" || assetKind === "passcode";
  if (slot.role === "tab_background_image") return assetKind === "background" || shapes.has("ninepatch");
  if (slot.role.startsWith("bubble_")) return assetKind === "bubble";

  return false;
}

export function describeAdminAssetAnalysis(analysis?: AdminAssetAnalysis): string {
  if (!analysis) return "분석 정보 없음";
  const size = analysis.width && analysis.height ? `${analysis.width}x${analysis.height}` : "크기 미확인";
  const shape = analysis.shapes.filter((item) => item !== "unknown").join(", ") || "unknown";
  const transparency = typeof analysis.transparentPixelRatio === "number" ? ` · 투명 ${Math.round(analysis.transparentPixelRatio * 100)}%` : "";
  return `${size} · ${shape}${transparency}`;
}

async function replaceAdminAssetTargets(
  assetId: string,
  targets: readonly {
    readonly platform: ThemePlatform | "all";
    readonly slot_role: string | null;
    readonly target_kind: string;
    readonly priority: number;
    readonly enabled: boolean;
  }[],
): Promise<void> {
  const supabase = createClient();
  const { error: deleteError } = await supabase.from("admin_asset_targets").delete().eq("asset_id", assetId);
  if (deleteError) throw deleteError;
  if (targets.length < 1) return;
  const { error: insertError } = await supabase.from("admin_asset_targets").insert(targets);
  if (insertError) throw insertError;
}

async function replaceAdminAssetBubbleSpec(assetId: string, bubbleSpec?: AdminBubbleSpecRow): Promise<void> {
  const supabase = createClient();
  const { error: deleteError } = await supabase.from("admin_asset_bubble_specs").delete().eq("asset_id", assetId);
  if (deleteError) throw deleteError;
  if (!bubbleSpec) return;
  const { error: insertError } = await supabase.from("admin_asset_bubble_specs").insert(bubbleSpec);
  if (insertError) throw insertError;
}

type AdminBubbleSpecRow = {
  readonly asset_id: string;
  readonly android_markers: AdminBubbleSpec["androidMarkers"];
  readonly ios_insets: AdminBubbleSpec["iosInsets"];
  readonly ios_stretch: AdminBubbleSpec["iosStretch"];
};

function rowMatchesPlatform(row: unknown, platform: ThemePlatform): boolean {
  const record = requireObject(row);
  const targets = record.admin_asset_targets;
  if (Array.isArray(targets)) {
    return targets.some((target) => {
      const targetRecord = requireObject(target);
      return targetRecord.platform === platform || targetRecord.platform === "all";
    });
  }
  return record.platform === platform || record.platform === "all";
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_CANONICAL_ASSET_ROW");
  return value as Record<string, unknown>;
}

function readStoragePath(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.storage_path === "string" ? record.storage_path : undefined;
}

function encodeCursor(updatedAt: string, id: string): string {
  return `${updatedAt}|${id}`;
}

function decodeCursor(value?: string): { readonly updatedAt: string; readonly id: string } | null {
  if (!value) return null;
  const separator = value.lastIndexOf("|");
  if (separator < 1) return null;
  const updatedAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return /^[0-9a-f-]{36}$/i.test(id) && Number.isFinite(new Date(updatedAt).getTime()) ? { updatedAt, id } : null;
}
