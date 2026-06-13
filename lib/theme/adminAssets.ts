import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

const databaseName = "kakaotalk-theme-maker";
const databaseVersion = 2;
const userTemplatesStoreName = "user-templates";
const storeName = "admin-assets";

export type AdminAssetCandidate = {
  id: string;
  slotRole: ThemeResourceRole;
  platform: ThemePlatform | "all";
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
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
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
