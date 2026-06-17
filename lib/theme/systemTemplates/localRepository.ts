import type { SystemTemplateRepository } from "@/lib/theme/systemTemplates/repository";
import type { SystemTemplateRecord, SystemTemplateSaveInput, SystemTemplateSummary } from "@/lib/theme/systemTemplates/types";

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

  async get(id: string) {
    const record = await withStore<SystemTemplateRecord | undefined>("readonly", (store) => store.get(id));
    return record ?? null;
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
  };
}
