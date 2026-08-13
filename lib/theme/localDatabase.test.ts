import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openThemeDatabase,
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
    transaction: vi.fn(() => transaction),
    close: vi.fn(),
  } as unknown as IDBDatabase;
  const openRequest = { result: database, error: null } as unknown as IDBOpenDBRequest;
  const indexedDb = { open: vi.fn(() => openRequest) } as unknown as IDBFactory;

  vi.stubGlobal("indexedDB", indexedDb);

  return { request, store, transaction, database, openRequest };
}

describe("withThemeDatabaseStore", () => {
  it("선언한 모든 store를 현재 database version에서 연다", async () => {
    vi.unstubAllGlobals();

    const database = await openThemeDatabase();
    const storeNames = Array.from(database.objectStoreNames);

    expect(database.version).toBe(themeDatabaseVersion);
    expect(storeNames).toEqual(expect.arrayContaining(Object.values(themeDatabaseStores)));
    database.close();
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
