import { openThemeDatabase, themeDatabaseStores } from "@/lib/theme/localDatabase";
import { templateStartStorageKey } from "@/lib/theme/templates";

const userEditorSessionStorageKey = "kakaotalk-theme-maker:editor-session:user:v1";
const userEditorLockStorageKey = "kakaotalk-theme-maker:editor-lock:user:v1";
const legacyProjectStorageKey = "kakaotalk-theme-maker:project-state:v1";

export async function deleteLocalUserThemeData() {
  const database = await openThemeDatabase();
  const userStoreNames = [
    themeDatabaseStores.userTemplates,
    themeDatabaseStores.editorRecoveryDrafts,
    themeDatabaseStores.editorAutosaveDrafts,
  ];

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(userStoreNames, "readwrite");
    for (const storeName of userStoreNames) transaction.objectStore(storeName).clear();

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("local_user_theme_data_deletion_aborted"));
    };
  });

  localStorage.removeItem(templateStartStorageKey);
  localStorage.removeItem(userEditorSessionStorageKey);
  localStorage.removeItem(userEditorLockStorageKey);
  localStorage.removeItem(legacyProjectStorageKey);
}
