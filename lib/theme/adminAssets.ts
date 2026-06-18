import { createClient } from "@/lib/supabase/client";
import { sanitizeStoragePathPart, storagePathToFile, storagePathToPreviewUrl, themeAssetsBucketName } from "@/lib/theme/remoteAssets";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

export type AdminAssetCandidate = {
  id: string;
  slotRole: ThemeResourceRole;
  platform: ThemePlatform | "all";
  assetKind?: AdminAssetKind;
  analysis?: AdminAssetAnalysis;
  bubbleAdjustment?: AdminBubbleAdjustment;
  title: string;
  note?: string;
  tags: string[];
  fileName: string;
  mimeType: string;
  storagePath: string;
  blob?: Blob;
  file?: File;
  previewUrl?: string;
  createdAt: number;
  updatedAt: number;
  enabled: boolean;
};

export type AdminAssetCandidateInput = Omit<AdminAssetCandidate, "id" | "createdAt" | "updatedAt" | "enabled" | "storagePath" | "blob" | "previewUrl" | "file"> & {
  id?: string;
  enabled?: boolean;
  blob: Blob;
};

export type AdminAssetKind = "background" | "icon" | "bubble" | "profile" | "launcher" | "passcode";

export type AdminAssetShape = "square" | "portrait" | "wide" | "transparent" | "ninepatch" | "unknown";

export type AdminAssetAnalysis = {
  width?: number;
  height?: number;
  aspectRatio?: number;
  shapes: AdminAssetShape[];
};

export type AdminBubbleAdjustment = {
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
};

type AdminAssetRow = {
  id: string;
  slot_role: ThemeResourceRole;
  platform: ThemePlatform | "all";
  asset_kind?: AdminAssetKind | null;
  analysis?: AdminAssetAnalysis | null;
  bubble_adjustment?: AdminBubbleAdjustment | null;
  title: string;
  note?: string | null;
  tags: string[] | null;
  file_name: string;
  mime_type: string;
  storage_path: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export async function listAdminAssetCandidates(): Promise<AdminAssetCandidate[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("admin_assets").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map((row) => rowToAdminAsset(row as AdminAssetRow)));
}

export async function saveAdminAssetCandidate(input: AdminAssetCandidateInput) {
  const supabase = createClient();
  const id = input.id ?? crypto.randomUUID();
  const storagePath = `admin-assets/${id}/${sanitizeStoragePathPart(input.fileName)}`;

  const { error: uploadError } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, input.blob, {
    contentType: input.mimeType || "application/octet-stream",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("admin_assets")
    .upsert({
      id,
      slot_role: input.slotRole,
      platform: input.platform,
      asset_kind: input.assetKind ?? null,
      analysis: input.analysis ?? null,
      bubble_adjustment: input.bubbleAdjustment ?? null,
      title: input.title,
      note: input.note ?? null,
      tags: input.tags,
      file_name: input.fileName,
      mime_type: input.mimeType || "application/octet-stream",
      storage_path: storagePath,
      enabled: input.enabled ?? true,
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  return rowToAdminAsset(data as AdminAssetRow);
}

export async function deleteAdminAssetCandidate(id: string) {
  const supabase = createClient();
  const { data } = await supabase.from("admin_assets").select("storage_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("admin_assets").delete().eq("id", id);
  if (error) throw error;
  if (data?.storage_path) {
    await supabase.storage.from(themeAssetsBucketName).remove([data.storage_path]);
  }
}

export async function adminAssetToFile(asset: AdminAssetCandidate) {
  if (asset.file) return asset.file;
  if (asset.blob) return new File([asset.blob], asset.fileName, { type: asset.mimeType });
  return storagePathToFile(asset.storagePath, asset.fileName, asset.mimeType);
}

export function inferAdminAssetKind(slot: Pick<ThemeAssetSlot, "role" | "group" | "section" | "kind">): AdminAssetKind {
  if (slot.role.startsWith("launcher_")) return "launcher";
  if (slot.role === "theme_icon" || slot.role.startsWith("tab_icon_")) return "icon";
  if (slot.role === "profile_image" || slot.role.startsWith("profile_image_")) return "profile";
  if (slot.role.startsWith("bubble_")) return "bubble";
  if (slot.role.startsWith("passcode_")) return "passcode";
  if (slot.group === "background" || slot.role === "tab_background_image") return "background";
  return "icon";
}

export function getAdminAssetKindLabel(kind: AdminAssetKind) {
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

export function isAdminAssetRecommendedForSlot(slot: ThemeAssetSlot, asset: AdminAssetCandidate) {
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

export function describeAdminAssetAnalysis(analysis?: AdminAssetAnalysis) {
  if (!analysis) return "분석 정보 없음";
  const size = analysis.width && analysis.height ? `${analysis.width}x${analysis.height}` : "크기 미확인";
  const shape = analysis.shapes.filter((item) => item !== "unknown").join(", ") || "unknown";
  return `${size} · ${shape}`;
}

async function rowToAdminAsset(row: AdminAssetRow): Promise<AdminAssetCandidate> {
  const previewUrl = await storagePathToPreviewUrl(row.storage_path);
  return {
    id: row.id,
    slotRole: row.slot_role,
    platform: row.platform,
    assetKind: row.asset_kind ?? inferLegacyAssetKind(row.slot_role),
    analysis: row.analysis ?? undefined,
    bubbleAdjustment: row.bubble_adjustment ?? undefined,
    title: row.title,
    note: row.note ?? undefined,
    tags: row.tags ?? [],
    fileName: row.file_name,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    previewUrl,
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
    enabled: row.enabled,
  };
}

function inferLegacyAssetKind(role: ThemeResourceRole): AdminAssetKind {
  if (role.startsWith("launcher_")) return "launcher";
  if (role === "theme_icon" || role.startsWith("tab_icon_")) return "icon";
  if (role === "profile_image" || role.startsWith("profile_image_")) return "profile";
  if (role.startsWith("bubble_")) return "bubble";
  if (role.startsWith("passcode_")) return "passcode";
  return "background";
}

function dateToMs(value?: string | null) {
  return value ? new Date(value).getTime() : Date.now();
}
