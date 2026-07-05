import type { SystemTemplateRepository } from "@/lib/theme/systemTemplates/repository";
import type { RemoteSlotUploads, SystemTemplateMetadataRecord, SystemTemplateRecord, SystemTemplateSaveInput, SystemTemplateSummary } from "@/lib/theme/systemTemplates/types";

const databaseName = "kakaotalk-theme-maker";
const databaseVersion = 3;
const userTemplatesStoreName = "user-templates";
const adminAssetsStoreName = "admin-assets";
const storeName = "system-templates";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(userTemplatesStoreName)) {
        database.createObjectStore(userTemplatesStoreName, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(adminAssetsStoreName)) {
        database.createObjectStore(adminAssetsStoreName, { keyPath: "id" });
      }
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

export const localSystemTemplateRepository: SystemTemplateRepository = {
  async list() {
    const records = await withStore<SystemTemplateRecord[]>("readonly", (store) => store.getAll());
    return records.map(toSummary).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async listPage(options = {}) {
    const records = (await withStore<SystemTemplateRecord[]>("readonly", (store) => store.getAll()))
      .filter((record) => !options.publicOnly || (record.status === "published" && record.visibility === "public"))
      .map(toSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const start = Math.max(0, Number(options.cursor) || 0);
    const limit = Math.min(30, Math.max(1, options.limit ?? 12));
    const items = records.slice(start, start + limit);
    return { items, nextCursor: start + limit < records.length ? String(start + limit) : undefined };
  },

  async getMetadata(id: string) {
    const record = await withStore<SystemTemplateRecord | undefined>("readonly", (store) => store.get(id));
    return record ? toMetadataRecord(record) : null;
  },

  async get(id: string) {
    const record = await withStore<SystemTemplateRecord | undefined>("readonly", (store) => store.get(id));
    return record ?? null;
  },

  async hydrateUploads(uploadRefs: RemoteSlotUploads) {
    void uploadRefs;
    return {};
  },

  async save(input: SystemTemplateSaveInput) {
    const now = Date.now();
    const record: SystemTemplateRecord = {
      ...input,
      id: input.id ?? `system-template:${now}:${Math.random().toString(36).slice(2, 8)}`,
      bundleId: input.bundleId ?? input.id ?? `system-template-bundle:${now}:${Math.random().toString(36).slice(2, 8)}`,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    await withStore("readwrite", (store) => store.put(record));
    return record;
  },

  async regeneratePreviewMetadata() {
    // 로컬(dev) 저장소는 previewMetadata를 별도 보관하지 않으므로 재계산이 필요 없다.
  },

  async delete(id: string) {
    await withStore<undefined>("readwrite", (store) => store.delete(id));
  },
};

function toSummary(record: SystemTemplateRecord): SystemTemplateSummary {
  return {
    id: record.id,
    bundleId: record.bundleId ?? record.id,
    title: record.title,
    description: record.description,
    baseTemplateId: record.baseTemplateId,
    platform: record.platform,
    status: record.status,
    visibility: record.visibility,
    pricingType: record.pricingType,
    priceAmount: record.priceAmount,
    creditCost: record.creditCost,
    tags: record.tags,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    uploadCount: Object.values(record.overrides.uploads).reduce((count, entries) => count + (entries?.length ?? 0), 0),
    colorCount: Object.values(record.overrides.colors).filter(Boolean).length,
    colors: record.overrides.colors,
    candidateSelections: record.overrides.candidateSelections,
    uploadRefs: {},
    previewMetadata: { colors: {}, refs: {} },
  };
}

function toMetadataRecord(record: SystemTemplateRecord): SystemTemplateMetadataRecord {
  return {
    ...record,
    overrides: {
      ...record.overrides,
      uploadRefs: {},
    },
  };
}
