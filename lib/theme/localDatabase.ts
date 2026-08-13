export const themeDatabaseName = "kakaotalk-theme-maker";
export const themeDatabaseVersion = 5;

export const themeDatabaseStores = {
  userTemplates: "user-templates",
  adminAssets: "admin-assets",
  systemTemplates: "system-templates",
  // 로그인·충전 왕복 전용 복구 레코드. 일반 자동 저장과 수명주기가 달라 store를 나눈다.
  editorRecoveryDrafts: "editor-recovery-drafts",
  editorAutosaveDrafts: "editor-autosave-drafts",
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
    // 다른 탭이 이전 버전으로 DB를 붙잡고 있으면 업그레이드가 멈춘다. 조용히 매달려 있으면
    // 호출부가 영원히 기다리므로 명시적으로 실패시킨다.
    request.onblocked = () => reject(new Error("theme_database_upgrade_blocked"));
  });
}

/**
 * 한 트랜잭션 안에서 요청을 이어 붙여야 할 때 쓴다(읽고 나서 조건부로 쓰는 경우 등).
 *
 * IDB 트랜잭션은 진행 중인 요청이 없으면 그 자리에서 비활성화되므로 콜백 안에서 `await`를 쓸 수 없다.
 * 다음 요청은 반드시 이전 요청의 `onsuccess` 안에서 시작하고, 결과는 `setResult`로 넘긴다.
 */
export async function withThemeDatabaseTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, setResult: (value: T) => void) => void,
): Promise<T | undefined> {
  const database = await openThemeDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    let result: T | undefined;
    const transaction = database.transaction(storeName, mode);

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("theme_database_transaction_aborted"));
    };

    try {
      run(transaction.objectStore(storeName), (value) => {
        result = value;
      });
    } catch (error) {
      database.close();
      reject(error);
    }
  });
}

export async function withThemeDatabaseStore<T>(storeName: string, mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openThemeDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let requestResult: T;
    let requestSucceeded = false;
    let settled = false;

    const closeDatabase = () => {
      database.close();
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      closeDatabase();
      reject(error);
    };

    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      closeDatabase();
      if (!requestSucceeded) {
        reject(new Error("theme_database_request_incomplete"));
        return;
      }
      resolve(requestResult);
    };
    transaction.onerror = () => {
      rejectOnce(transaction.error ?? new Error("theme_database_transaction_failed"));
    };
    transaction.onabort = () => {
      rejectOnce(transaction.error ?? new Error("theme_database_transaction_aborted"));
    };

    let request: IDBRequest<T>;
    try {
      request = callback(transaction.objectStore(storeName));
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // 이미 비활성화된 transaction이면 원래 callback 오류를 그대로 반환한다.
      }
      rejectOnce(error);
      return;
    }

    request.onsuccess = () => {
      requestResult = request.result;
      requestSucceeded = true;
    };
    request.onerror = () => rejectOnce(request.error ?? new Error("theme_database_request_failed"));
  });
}
