import { afterEach, describe, expect, it, vi } from "vitest";
import { createTtlCache } from "@/lib/shared/ttlCache";

afterEach(() => {
  vi.useRealTimers();
});

describe("createTtlCache", () => {
  it("TTL 안에서는 저장한 값을 돌려준다", () => {
    const cache = createTtlCache<number>({ ttlMs: 1000 });
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("TTL이 지나면 값을 버린다", () => {
    vi.useFakeTimers();
    const cache = createTtlCache<number>({ ttlMs: 1000 });
    cache.set("a", 1);
    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
  });

  it("maxEntries를 넘으면 오래 쓰지 않은 항목부터 버린다", () => {
    const cache = createTtlCache<string>({ ttlMs: 10_000, maxEntries: 2 });
    cache.set("a", "1");
    cache.set("b", "2");
    // a를 다시 읽어 최근 사용으로 올린 뒤 새 항목을 넣으면 b가 밀려난다.
    expect(cache.get("a")).toBe("1");
    cache.set("c", "3");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("1");
    expect(cache.get("c")).toBe("3");
  });

  it("clear는 모든 항목을 지운다", () => {
    const cache = createTtlCache<number>({ ttlMs: 1000 });
    cache.set("a", 1);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
  });

  it("큰 snapshot의 쓰기 시 만료 정리는 아직 신선한 LRU 항목을 보존한다", () => {
    vi.useFakeTimers();vi.setSystemTime(0);
    const cache=createTtlCache<number>({ttlMs:1000,maxEntries:2,pruneExpiredOnSet:true});
    cache.set("a",1);vi.setSystemTime(500);cache.set("b",2);
    vi.setSystemTime(900);expect(cache.get("a")).toBe(1);
    vi.setSystemTime(1000);cache.set("c",3);
    expect(cache.get("a")).toBeUndefined();expect(cache.get("b")).toBe(2);expect(cache.get("c")).toBe(3);
  });
});
