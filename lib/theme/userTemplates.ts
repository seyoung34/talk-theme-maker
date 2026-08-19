import type { CatalogUploadRef, SlotCandidateSelections, SlotColors, SlotUploadEntry, SlotUploadSource, SlotUploads } from "@/lib/theme/project/state";
import { parseCatalogAssetSelection } from "@/lib/theme/assetCatalog/registry";
import { normalizeThemeTemplateId, type ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import { parseBubbleGeometryMap } from "@/lib/theme/bubbleGeometry";
import { themeDatabaseStores, withThemeDatabaseStore } from "@/lib/theme/localDatabase";
import type { BubbleDecorationSources, BubbleDesigns } from "@/lib/theme/bubbleBuilder";
import { assertValidTemplateName } from "@/lib/theme/templateName";

const storeName = themeDatabaseStores.userTemplates;

export type UserTemplateBubbleEdits = {
  geometry: Partial<Record<string, BubbleGeometry>>;
  markers: Partial<Record<string, Markers>>;
  insets: Partial<Record<string, Insets>>;
  stretch: Partial<Record<string, StretchPoint>>;
  // 나중에 추가된 필드다. 이전에 저장된 레코드에는 없으므로 normalizer가 `{}`로 승격한다.
  flipX?: Partial<Record<string, boolean>>;
};

export type UserTemplateRecord = {
  id: string;
  name: string;
  templateId: ThemeTemplateId;
  platform: ThemePlatform;
  createdAt: number;
  updatedAt: number;
  colors: SlotColors;
  uploads: SlotUploads;
  candidateSelections: SlotCandidateSelections;
  bubbleEdits: UserTemplateBubbleEdits;
  bubbleDesigns?: BubbleDesigns;
  bubbleDecorationSources?: BubbleDecorationSources;
};

export type UserTemplateSummary = Pick<UserTemplateRecord, "id" | "name" | "templateId" | "platform" | "createdAt" | "updatedAt"> & {
  uploadCount: number;
  colorCount: number;
};

export async function saveUserTemplate(record: Omit<UserTemplateRecord, "id" | "createdAt" | "updatedAt"> & Partial<Pick<UserTemplateRecord, "id" | "createdAt">>) {
  const existingId = record.id;
  const existing = existingId
    ? await withThemeDatabaseStore<UserTemplateRecord | undefined>(storeName, "readonly", (store) => store.get(existingId))
    : undefined;
  const name = assertValidTemplateName(record.name, existing?.name);
  const now = Date.now();
  const next: UserTemplateRecord = {
    ...record,
    name,
    id: record.id ?? `user-template:${now}`,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
    uploads: normalizeIndexedDbOnlyUploads(record.uploads),
    bubbleDesigns: record.bubbleDesigns ?? {},
    bubbleDecorationSources: normalizeDecorationSources(record.bubbleDecorationSources),
  };

  await withThemeDatabaseStore(storeName, "readwrite", (store) => store.put(next));
  return next;
}

export async function getUserTemplate(id: string) {
  const record = await withThemeDatabaseStore<UserTemplateRecord | undefined>(storeName, "readonly", (store) => store.get(id));
  return record ? normalizeUserTemplateRecord(record) : null;
}

/**
 * 목록과 카드 렌더에 같은 레코드가 필요한 화면(`/template`)을 위한 단일 읽기 경로.
 * `getAll()`이 이미 전체 레코드를 돌려주므로, 여기서 받은 레코드를 재사용하면 같은 진입에서
 * `getUserTemplate()`으로 하나씩 다시 읽을 이유가 없다.
 */
export async function listUserTemplateRecords(): Promise<UserTemplateRecord[]> {
  const records = await withThemeDatabaseStore<UserTemplateRecord[]>(storeName, "readonly", (store) => store.getAll());
  return records.map(normalizeUserTemplateRecord).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function toUserTemplateSummary(record: UserTemplateRecord): UserTemplateSummary {
  return {
    id: record.id,
    name: record.name,
    templateId: record.templateId,
    platform: record.platform,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    uploadCount: Object.values(record.uploads).reduce((count, entries) => count + (entries?.length ?? 0), 0),
    colorCount: Object.values(record.colors).filter(Boolean).length,
  };
}

function normalizeUserTemplateRecord(record: UserTemplateRecord): UserTemplateRecord {
  const templateId = normalizeThemeTemplateId(record.templateId);
  return {
    ...(templateId === record.templateId ? record : { ...record, templateId }),
    uploads: normalizeIndexedDbOnlyUploads(record.uploads),
    bubbleEdits: {
      geometry: parseBubbleGeometryMap(record.bubbleEdits?.geometry),
      markers: record.bubbleEdits?.markers ?? {},
      insets: record.bubbleEdits?.insets ?? {},
      stretch: record.bubbleEdits?.stretch ?? {},
      flipX: record.bubbleEdits?.flipX ?? {},
    },
    bubbleDesigns: record.bubbleDesigns ?? {},
    bubbleDecorationSources: normalizeDecorationSources(record.bubbleDecorationSources),
  };
}

export async function deleteUserTemplate(id: string) {
  await withThemeDatabaseStore<undefined>(storeName, "readwrite", (store) => store.delete(id));
}

function normalizeIndexedDbOnlyUploads(uploads: SlotUploads): SlotUploads {
  const next: SlotUploads = {};

  for (const [slotId, entries] of Object.entries(uploads)) {
    if (!entries?.length) continue;
    const normalizedEntries = entries
      .map((entry) => normalizeIndexedDbOnlyUploadEntry(entry))
      .filter((entry): entry is SlotUploadEntry => Boolean(entry));
    if (normalizedEntries.length) next[slotId] = normalizedEntries;
  }

  return next;
}

function normalizeIndexedDbOnlyUploadEntry(entry: SlotUploadEntry): SlotUploadEntry | null {
  const file = isFileLike(entry.file) ? entry.file : undefined;
  const catalog = normalizeCatalogUploadRef(entry.catalog);
  // File도 catalog 참조도 없으면 그릴 것도 내보낼 것도 없다. 그때만 버린다.
  // 예전에는 File만 봤기 때문에, catalog 참조뿐인 항목이 저장 한 번에 조용히 사라졌다.
  if (!file && !catalog) return null;

  const normalized: SlotUploadEntry = {
    id: entry.id,
    ...(file ? { file } : {}),
    ...(catalog ? { catalog } : {}),
    ...(isSlotUploadSource(entry.source) ? { source: entry.source } : {}),
  };

  if (entry.imageEdit) {
    normalized.imageEdit = {
      originalName: entry.imageEdit.originalName,
      originalSize: entry.imageEdit.originalSize,
      ...(isFileLike(entry.imageEdit.originalFile) ? { originalFile: entry.imageEdit.originalFile } : {}),
      editedAt: entry.imageEdit.editedAt,
      state: entry.imageEdit.state,
      ...(entry.imageEdit.target ? { target: entry.imageEdit.target } : {}),
    };
  }

  return normalized;
}

function isSlotUploadSource(value: unknown): value is SlotUploadSource {
  return value === "user" || value === "template" || value === "admin";
}

/**
 * IndexedDB에서 돌아온 catalog 참조를 검증한다.
 *
 * 저장된 값은 우리가 쓴 것이지만 스키마가 바뀐 뒤의 옛 레코드일 수 있다. 깨진 참조를 그대로
 * 살려 두면 나중에 export가 해석하지 못하는 항목이 되므로, 여기서 걸러 `null`을 준다 —
 * 그러면 File이 있는 항목은 File만으로 계속 동작한다.
 */
function normalizeCatalogUploadRef(value: SlotUploadEntry["catalog"]): CatalogUploadRef | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.fileName !== "string" || !value.fileName) return undefined;
  if (typeof value.mimeType !== "string" || !value.mimeType) return undefined;
  if (typeof value.size !== "number" || !Number.isFinite(value.size) || value.size < 0) return undefined;
  if (value.sourceScale !== 1 && value.sourceScale !== 2 && value.sourceScale !== 3) return undefined;
  if (typeof value.width !== "number" || !Number.isSafeInteger(value.width) || value.width <= 0) return undefined;
  if (typeof value.height !== "number" || !Number.isSafeInteger(value.height) || value.height <= 0) return undefined;
  if (value.pngSignatureVerified !== true) return undefined;
  let selection;
  try {
    selection = parseCatalogAssetSelection(value.selection);
  } catch {
    return undefined;
  }
  return {
    selection,
    fileName: value.fileName,
    mimeType: value.mimeType,
    size: value.size,
    sourceScale: value.sourceScale,
    width: value.width,
    height: value.height,
    pngSignatureVerified: true,
    ...(typeof value.legacyStoragePath === "string" && value.legacyStoragePath ? { legacyStoragePath: value.legacyStoragePath } : {}),
    ...(typeof value.previewUrl === "string" && value.previewUrl ? { previewUrl: value.previewUrl } : {}),
  };
}

function isFileLike(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function normalizeDecorationSources(sources: BubbleDecorationSources | undefined): BubbleDecorationSources {
  return Object.fromEntries(Object.entries(sources ?? {}).filter((entry): entry is [string, File] => isFileLike(entry[1])));
}
