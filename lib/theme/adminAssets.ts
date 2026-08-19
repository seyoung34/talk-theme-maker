import { createClient } from "@/lib/supabase/client";
import { readJsonResponse } from "@/lib/shared/api/http";
import { shadowPublishThemeAsset } from "@/lib/theme/assetCatalog/shadowPublishClient";
import {
  getThemeAssetSignedUrls,
  sanitizeStoragePathPart,
  storagePathToFile,
  themeAssetsBucketName,
} from "@/lib/theme/remoteAssets";
import { themeAssetCacheControl } from "@/lib/theme/themeAssetSigning";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";
import type { BubbleFamilyDesignSpec } from "@/lib/theme/bubbleBuilder";
import {
  assertValidAdminAssetCandidateInput,
  canonicalAdminAssetToCandidate,
  createAdminAssetPersistencePayload,
  inferAdminAssetKind,
  isValidBubbleAdjustment,
  isValidBubbleBuilderTargets,
  mapCanonicalAdminAssetRow,
  type AdminAssetCandidate,
  type AdminAssetCandidateInput,
  type AdminAssetCandidateUpdate,
  type AdminAssetKind,
  type AdminAssetListOptions,
  type AdminAssetPage,
  type AdminAssetTargetInput,
  type AdminAssetBubbleDecoration,
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
  type AdminAssetPlatformVariant,
  type AdminAssetBubbleDecoration,
  type AdminAssetBubbleDesign,
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
  "admin_asset_bubble_specs(asset_id,android_markers,ios_insets,ios_stretch,geometry)",
  "admin_asset_variants(id,asset_id,platform,storage_path,file_name,mime_type,analysis)",
  "admin_asset_bubble_designs!admin_asset_bubble_designs_asset_id_fkey(asset_id,recipe,geometry_mode,admin_asset_bubble_decorations(layer_id,storage_path,file_name,mime_type))",
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
  const previewUrls = await getThemeAssetSignedUrls(canonicalAssets.flatMap((asset) => [asset.storagePath, ...asset.variants.map((variant) => variant.storagePath)]));
  const items = canonicalAssets.map((asset) => canonicalAdminAssetToCandidate(asset, previewUrls[asset.storagePath], previewUrls));
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
    cacheControl: themeAssetCacheControl,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  try {
    const { data: userData } = await supabase.auth.getUser();
    const payload = createAdminAssetPersistencePayload(input, id, storagePath, userData.user?.id ?? null);
    const { error } = await supabase.from("admin_assets").upsert(payload.asset).select(adminAssetSelect).single();
    if (error) throw error;

    await replaceAdminAssetTargets(id, payload.targets);
    await replaceAdminAssetBubbleSpec(id, payload.bubbleSpec);

    /**
     * catalog 병행 기록 (계획 §15 rollout 1단계 write shadow).
     *
     * 저장이 끝난 **뒤에** 부르고 실패는 삼킨다. 기존 Supabase 저장이 진짜이고 이건 그림자다.
     * 이게 없으면 앞으로 추가되는 추천 에셋이 registry에 들어가지 않아 피커 썸네일 없이 남는다.
     */
    void shadowPublishThemeAsset({
      kind: "admin",
      sourceId: id,
      canonical: new File([input.blob], input.fileName, { type: mimeType }),
    });

    return getAdminAssetCandidate(id);
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
  const { error } = await supabase
    .from("admin_assets")
    .update({
      title,
      ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
      ...(input.bubbleAdjustment ? { bubble_adjustment: input.bubbleAdjustment } : {}),
    })
    .eq("id", id);
  if (error) throw error;

  const targetRows = input.targets?.map((target) => ({ asset_id: id, platform: target.platform, slot_role: target.slotRole ?? null, target_kind: target.targetKind, priority: target.priority, enabled: target.enabled }));
  if (targetRows) await replaceAdminAssetTargets(id, targetRows);
  if (bubbleSpec) {
    await replaceAdminAssetBubbleSpec(id, {
      asset_id: id,
      android_markers: bubbleSpec.androidMarkers,
      ios_insets: bubbleSpec.iosInsets,
      ios_stretch: bubbleSpec.iosStretch,
      geometry: bubbleSpec.geometry ?? null,
    });
    const { error: geometryModeError } = await supabase
      .from("admin_asset_bubble_designs")
      .update({ geometry_mode: "manual" })
      .eq("asset_id", id);
    if (geometryModeError) throw geometryModeError;
  }

  return getAdminAssetCandidate(id);
}

export async function getAdminAssetCandidate(id: string): Promise<AdminAssetCandidate> {
  const supabase = createClient();
  const { data, error } = await supabase.from("admin_assets").select(adminAssetSelect).eq("id", id).single();
  if (error) throw error;
  const canonical = mapCanonicalAdminAssetRow(data);
  const previewUrls = await getThemeAssetSignedUrls([canonical.storagePath, ...canonical.variants.map((variant) => variant.storagePath)]);
  return canonicalAdminAssetToCandidate(canonical, previewUrls[canonical.storagePath], previewUrls);
}

export type AdminAssetPlatformVariantInput = {
  readonly platform: ThemePlatform;
  readonly file: File;
  readonly analysis?: AdminAssetAnalysis;
};

export type AdminBubbleBuilderCandidateInput = {
  readonly id?: string;
  readonly title: string;
  readonly slotRole: ThemeResourceRole;
  readonly targets: readonly AdminAssetTargetInput[];
  readonly variants: readonly AdminAssetPlatformVariantInput[];
  readonly bubbleSpec: AdminBubbleSpec;
  readonly recipe: BubbleFamilyDesignSpec;
  readonly decorations: Partial<Record<string, File>>;
  readonly geometryMode?: "generated" | "manual";
  readonly enabled?: boolean;
};

export async function saveAdminBubbleBuilderCandidate(input: AdminBubbleBuilderCandidateInput): Promise<AdminAssetCandidate> {
  const title = input.title.trim();
  if (!title || title.length > 100) throw new Error("INVALID_ASSET_TITLE");
  const androidVariant = input.variants.find((variant) => variant.platform === "android");
  const iosVariant = input.variants.find((variant) => variant.platform === "ios");
  if (!androidVariant || !iosVariant || input.variants.length !== 2) throw new Error("INVALID_PLATFORM_VARIANTS");
  if (!isValidBubbleBuilderTargets(input.targets, input.slotRole)) {
    throw new Error("INVALID_BUBBLE_TARGETS");
  }
  const layers = input.recipe.design.decorations ?? [];
  if (layers.some((layer) => !input.decorations[layer.id])) throw new Error("MISSING_BUBBLE_DECORATION");

  const supabase = createClient();
  const id = input.id ?? crypto.randomUUID();
  const previous = input.id ? await getAdminAssetCandidate(input.id) : undefined;
  const revision = crypto.randomUUID();
  const uploadedPaths: string[] = [];
  const variantRows = input.variants.map((variant) => ({
    platform: variant.platform,
    storage_path: `admin-assets/${id}/revisions/${revision}/${variant.platform}/${sanitizeStoragePathPart(variant.file.name)}`,
    file_name: variant.file.name,
    mime_type: variant.file.type || "image/png",
    analysis: variant.analysis ?? null,
  }));
  const decorationRows = layers.map((layer) => {
    const file = input.decorations[layer.id];
    if (!file) throw new Error("MISSING_BUBBLE_DECORATION");
    return {
      layer_id: layer.id,
      storage_path: `admin-assets/${id}/revisions/${revision}/decorations/${sanitizeStoragePathPart(layer.id)}/${sanitizeStoragePathPart(file.name)}`,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file,
    };
  });

  try {
    for (const [index, variant] of input.variants.entries()) {
      const row = variantRows[index];
      if (!row) throw new Error("INVALID_PLATFORM_VARIANTS");
      const { error } = await supabase.storage.from(themeAssetsBucketName).upload(row.storage_path, variant.file, { contentType: row.mime_type, cacheControl: themeAssetCacheControl, upsert: false });
      if (error) throw error;
      uploadedPaths.push(row.storage_path);
    }
    for (const decoration of decorationRows) {
      const { error } = await supabase.storage.from(themeAssetsBucketName).upload(decoration.storage_path, decoration.file, { contentType: decoration.mime_type, cacheControl: themeAssetCacheControl, upsert: false });
      if (error) throw error;
      uploadedPaths.push(decoration.storage_path);
    }

    const primary = variantRows.find((variant) => variant.platform === "android");
    if (!primary) throw new Error("INVALID_PLATFORM_VARIANTS");
    const { error } = await supabase.rpc("upsert_admin_asset_bundle", {
      p_asset: {
        id,
        slot_role: input.slotRole,
        platform: "all",
        asset_kind: "bubble",
        analysis: primary.analysis,
        bubble_adjustment: {
          markers: input.bubbleSpec.androidMarkers,
          insets: input.bubbleSpec.iosInsets,
          stretch: input.bubbleSpec.iosStretch,
        },
        title,
        tags: [],
        file_name: primary.file_name,
        mime_type: primary.mime_type,
        storage_path: primary.storage_path,
        enabled: input.enabled ?? true,
      },
      p_targets: input.targets.map((target) => ({
        platform: target.platform,
        slot_role: target.slotRole ?? null,
        target_kind: target.targetKind,
        priority: target.priority,
        enabled: target.enabled,
      })),
      p_variants: variantRows,
      p_bubble_spec: {
        android_markers: input.bubbleSpec.androidMarkers,
        ios_insets: input.bubbleSpec.iosInsets,
        ios_stretch: input.bubbleSpec.iosStretch,
        geometry: input.bubbleSpec.geometry ?? null,
      },
      p_bubble_design: { recipe: input.recipe, geometry_mode: input.geometryMode ?? "generated" },
      p_decorations: decorationRows.map((decoration) => ({
        layer_id: decoration.layer_id,
        storage_path: decoration.storage_path,
        file_name: decoration.file_name,
        mime_type: decoration.mime_type,
      })),
    });
    if (error) throw error;

    const saved = await getAdminAssetCandidate(id);
    const stalePaths = previous
      ? [
          ...previous.variants?.map((variant) => variant.storagePath) ?? [],
          ...previous.bubbleDesign?.decorations.map((decoration) => decoration.storagePath) ?? [],
        ].filter((path) => !uploadedPaths.includes(path))
      : [];
    if (stalePaths.length) await supabase.storage.from(themeAssetsBucketName).remove(stalePaths);
    return saved;
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from(themeAssetsBucketName).remove(uploadedPaths);
    throw error;
  }
}

export function withAdminAssetPlatformVariant(asset: AdminAssetCandidate, platform: ThemePlatform): AdminAssetCandidate {
  const variant = asset.variants?.find((item) => item.platform === platform);
  if (!variant) return asset;
  return {
    ...asset,
    analysis: variant.analysis ?? asset.analysis,
    fileName: variant.fileName,
    mimeType: variant.mimeType,
    storagePath: variant.storagePath,
    previewUrl: variant.previewUrl ?? asset.previewUrl,
  };
}

export async function deleteAdminAssetCandidate(id: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase
    .from("admin_assets")
    .select("storage_path,admin_asset_variants(storage_path),admin_asset_bubble_designs!admin_asset_bubble_designs_asset_id_fkey(admin_asset_bubble_decorations(storage_path))")
    .eq("id", id)
    .maybeSingle();
  const storagePaths = readAdminAssetStoragePaths(data);
  const { error } = await supabase.from("admin_assets").delete().eq("id", id);
  if (error) throw error;
  if (storagePaths.length) await supabase.storage.from(themeAssetsBucketName).remove(storagePaths);
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

export async function adminAssetBubbleDecorationToFile(decoration: AdminAssetBubbleDecoration): Promise<File> {
  return storagePathToFile(decoration.storagePath, decoration.fileName, decoration.mimeType);
}

export function getAdminAssetKindLabel(kind: AdminAssetKind): string {
  const labels: Record<AdminAssetKind, string> = {
    background: "배경 이미지",
    icon: "아이콘",
    bubble: "말풍선",
    profile: "프로필",
    launcher: "런처 아이콘",
    passcode: "잠금화면 배경",
    passcode_indicator: "암호 표시",
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
  if (slot.role.startsWith("passcode_indicator")) return assetKind === "passcode_indicator" && (shapes.size === 0 || shapes.has("square") || shapes.has("transparent"));
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
  readonly geometry: AdminBubbleSpec["geometry"] | null;
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

function readAdminAssetStoragePaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const paths = new Set<string>();
  if (typeof record.storage_path === "string") paths.add(record.storage_path);
  if (Array.isArray(record.admin_asset_variants)) {
    for (const variant of record.admin_asset_variants) {
      if (variant && typeof variant === "object" && !Array.isArray(variant) && typeof (variant as Record<string, unknown>).storage_path === "string") paths.add((variant as Record<string, string>).storage_path);
    }
  }
  if (Array.isArray(record.admin_asset_bubble_designs)) {
    for (const design of record.admin_asset_bubble_designs) {
      if (!design || typeof design !== "object" || Array.isArray(design)) continue;
      const decorations = (design as Record<string, unknown>).admin_asset_bubble_decorations;
      if (!Array.isArray(decorations)) continue;
      for (const decoration of decorations) {
        if (decoration && typeof decoration === "object" && !Array.isArray(decoration) && typeof (decoration as Record<string, unknown>).storage_path === "string") paths.add((decoration as Record<string, string>).storage_path);
      }
    }
  }
  return [...paths];
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
