export const themeDatabaseName = "kakaotalk-theme-maker";
export const themeDatabaseVersion = 4;

export const themeDatabaseStores = {
  userTemplates: "user-templates",
  adminAssets: "admin-assets",
  systemTemplates: "system-templates",
  editorRecoveryDrafts: "editor-recovery-drafts",
} as const;

export function openThemeDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(themeDatabaseName, themeDatabaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of Object.values(themeDatabaseStores)) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function withThemeDatabaseStore<T>(storeName: string, mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openThemeDatabase();
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
