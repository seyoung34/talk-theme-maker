import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/lib/theme/project/state";
import type { ThemeTemplateId } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

const databaseName = "kakaotalk-theme-maker";
const databaseVersion = 1;
const storeName = "user-templates";

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
  };

  await withStore("readwrite", (store) => store.put(next));
  return next;
}

export async function getUserTemplate(id: string) {
  const record = await withStore<UserTemplateRecord | undefined>("readonly", (store) => store.get(id));
  return record ?? null;
}

export async function listUserTemplates(): Promise<UserTemplateSummary[]> {
  const records = await withStore<UserTemplateRecord[]>("readonly", (store) => store.getAll());
  return records
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
