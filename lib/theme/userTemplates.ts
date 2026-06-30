import type { SlotCandidateSelections, SlotColors, SlotUploadEntry, SlotUploadSource, SlotUploads } from "@/lib/theme/project/state";
import { normalizeThemeTemplateId, type ThemeTemplateId } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

const databaseName = "kakaotalk-theme-maker";
const databaseVersion = 3;
const storeName = "user-templates";
const adminAssetsStoreName = "admin-assets";
const systemTemplatesStoreName = "system-templates";

export type UserTemplateBubbleEdits = {
  markers: Partial<Record<string, Markers>>;
  insets: Partial<Record<string, Insets>>;
  stretch: Partial<Record<string, StretchPoint>>;
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
};

export type UserTemplateSummary = Pick<UserTemplateRecord, "id" | "name" | "templateId" | "platform" | "createdAt" | "updatedAt"> & {
  uploadCount: number;
  colorCount: number;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(adminAssetsStoreName)) {
        database.createObjectStore(adminAssetsStoreName, { keyPath: "id" });
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

export async function saveUserTemplate(record: Omit<UserTemplateRecord, "id" | "createdAt" | "updatedAt"> & Partial<Pick<UserTemplateRecord, "id" | "createdAt">>) {
  const now = Date.now();
  const next: UserTemplateRecord = {
    ...record,
    id: record.id ?? `user-template:${now}`,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
    uploads: normalizeIndexedDbOnlyUploads(record.uploads),
  };

  await withStore("readwrite", (store) => store.put(next));
  return next;
}

export async function getUserTemplate(id: string) {
  const record = await withStore<UserTemplateRecord | undefined>("readonly", (store) => store.get(id));
  return record ? normalizeUserTemplateRecord(record) : null;
}

export async function listUserTemplates(): Promise<UserTemplateSummary[]> {
  const records = await withStore<UserTemplateRecord[]>("readonly", (store) => store.getAll());
  return records
    .map(normalizeUserTemplateRecord)
    .map((record) => ({
      id: record.id,
      name: record.name,
      templateId: record.templateId,
      platform: record.platform,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      uploadCount: Object.values(record.uploads).reduce((count, entries) => count + (entries?.length ?? 0), 0),
      colorCount: Object.values(record.colors).filter(Boolean).length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeUserTemplateRecord(record: UserTemplateRecord): UserTemplateRecord {
  const templateId = normalizeThemeTemplateId(record.templateId);
  return {
    ...(templateId === record.templateId ? record : { ...record, templateId }),
    uploads: normalizeIndexedDbOnlyUploads(record.uploads),
  };
}

export async function deleteUserTemplate(id: string) {
  await withStore<undefined>("readwrite", (store) => store.delete(id));
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
  if (!isFileLike(entry.file)) return null;

  const normalized: SlotUploadEntry = {
    id: entry.id,
    file: entry.file,
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

function isFileLike(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}
