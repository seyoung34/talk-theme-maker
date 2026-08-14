import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openThemeDatabase,
  themeDatabaseName,
  themeDatabaseStores,
  themeDatabaseVersion,
  withThemeDatabaseStore,
} from "@/lib/theme/localDatabase";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createIndexedDbHarness<T>(result: T) {
  const request = { result, error: null } as unknown as IDBRequest<T>;
  const store = {} as IDBObjectStore;
  const transaction = {
    error: null,
    objectStore: vi.fn(() => store),
    abort: vi.fn(),
  } as unknown as IDBTransaction;
  const database = {
    // 선언한 store가 이미 다 있는 DB. `openThemeDatabase`가 version을 올리지 않고 그대로 쓴다.
    objectStoreNames: { contains: () => true },
    transaction: vi.fn(() => transaction),
    close: vi.fn(),
  } as unknown as IDBDatabase;
  const openRequest = { result: database, error: null } as unknown as IDBOpenDBRequest;
  const indexedDb = { open: vi.fn(() => openRequest) } as unknown as IDBFactory;

  vi.stubGlobal("indexedDB", indexedDb);

  return { request, store, transaction, database, openRequest };
}

describe("withThemeDatabaseStore", () => {
  it("선언한 모든 store를 최소 database version에서 연다", async () => {
    vi.unstubAllGlobals();

    const database = await openThemeDatabase();
    const storeNames = Array.from(database.objectStoreNames);

    expect(database.version).toBe(themeDatabaseVersion);
    expect(storeNames).toEqual(expect.arrayContaining(Object.values(themeDatabaseStores)));
    database.close();
  });

  /**
   * 새 store를 추가한 배포를 되돌리면, 이미 높은 version으로 DB를 연 브라우저가 남는다. version을 고정해
   * 열면 `VersionError`로 로컬 데이터 전체를 읽지 못한다. 서버 백업이 없으므로 곧 작업물 소실이다.
   */
  it("브라우저에 더 높은 version이 남아 있어도 그대로 열고 데이터를 유지한다", async () => {
    vi.unstubAllGlobals();
    const futureVersion = themeDatabaseVersion + 3;

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(themeDatabaseName, futureVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const storeName of Object.values(themeDatabaseStores)) {
          if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("dropped-store")) database.createObjectStore("dropped-store", { keyPath: "id" });
      };
      request.onsuccess = () => {
        const transaction = request.result.transaction(themeDatabaseStores.userTemplates, "readwrite");
        transaction.objectStore(themeDatabaseStores.userTemplates).put({ id: "kept", name: "이전 작업" });
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
        transaction.onabort = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });

    const database = await openThemeDatabase();
    expect(database.version).toBe(futureVersion);
    database.close();

    const kept = await withThemeDatabaseStore<{ id: string; name: string } | undefined>(
      themeDatabaseStores.userTemplates,
      "readonly",
      (store) => store.get("kept"),
    );
    expect(kept?.name).toBe("이전 작업");
  });

  it("request 성공 뒤에도 transaction commit 전에는 완료되지 않는다", async () => {
    const harness = createIndexedDbHarness("saved");
    let callbackReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      callbackReady = resolve;
    });
    let settled = false;

    const resultPromise = withThemeDatabaseStore("records", "readwrite", (store) => {
      expect(store).toBe(harness.store);
      callbackReady();
      return harness.request;
    });
    resultPromise.finally(() => {
      settled = true;
    });

    harness.openRequest.onsuccess?.({ target: harness.openRequest } as unknown as Event);
    await ready;
    harness.request.onsuccess?.({ target: harness.request } as unknown as Event);
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(harness.database.close).not.toHaveBeenCalled();

    harness.transaction.oncomplete?.({ target: harness.transaction } as unknown as Event);

    await expect(resultPromise).resolves.toBe("saved");
    expect(harness.database.close).toHaveBeenCalledTimes(1);
  });

  it("callback 오류 시 transaction을 중단하고 database를 닫는다", async () => {
    const harness = createIndexedDbHarness("unused");
    const callbackError = new Error("callback_failed");

    const resultPromise = withThemeDatabaseStore("records", "readwrite", () => {
      throw callbackError;
    });
    harness.openRequest.onsuccess?.({ target: harness.openRequest } as unknown as Event);

    await expect(resultPromise).rejects.toBe(callbackError);
    expect(harness.transaction.abort).toHaveBeenCalledTimes(1);
    expect(harness.database.close).toHaveBeenCalledTimes(1);
  });
});
