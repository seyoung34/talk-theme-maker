import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

const databaseName = "kakaotalk-theme-maker";
const databaseVersion = 3;
const userTemplatesStoreName = "user-templates";
const systemTemplatesStoreName = "system-templates";
const storeName = "admin-assets";

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
  blob: Blob;
  createdAt: number;
  updatedAt: number;
  enabled: boolean;
};

export type AdminAssetCandidateInput = Omit<AdminAssetCandidate, "id" | "createdAt" | "updatedAt" | "enabled"> & {
  id?: string;
  enabled?: boolean;
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

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(userTemplatesStoreName)) {
        database.createObjectStore(userTemplatesStoreName, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(systemTemplatesStoreName)) {
        database.createObjectStore(systemTemplatesStoreName, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = callback(transaction.objectStore(storeName));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function listAdminAssetCandidates(): Promise<AdminAssetCandidate[]> {
  const records = await withStore<AdminAssetCandidate[]>("readonly", (store) => store.getAll());
  return records.map(normalizeAdminAssetCandidate).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveAdminAssetCandidate(input: AdminAssetCandidateInput) {
  const now = Date.now();
  const record: AdminAssetCandidate = {
    ...input,
    id: input.id ?? `admin-asset:${now}:${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    enabled: input.enabled ?? true,
  };

  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function deleteAdminAssetCandidate(id: string) {
  await withStore<undefined>("readwrite", (store) => store.delete(id));
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

function normalizeAdminAssetCandidate(asset: AdminAssetCandidate): AdminAssetCandidate {
  return {
    ...asset,
    tags: asset.tags ?? [],
    enabled: asset.enabled ?? true,
    assetKind: asset.assetKind ?? inferLegacyAssetKind(asset.slotRole),
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
