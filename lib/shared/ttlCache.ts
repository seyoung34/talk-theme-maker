// 사용자와 무관한 읽기 응답을 짧게 재사용하기 위한 프로세스 내 캐시.
// 인스턴스(아이솔레이트)마다 따로 존재하는 best-effort 캐시이므로, 정확성이 캐시 적중에
// 의존하는 값에는 쓰지 않는다. 만료 시각을 함께 저장해 오래된 값이 남지 않게 한다.
export type TtlCache<T> = {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  clear: () => void;
};

export function createTtlCache<T>({ ttlMs, maxEntries = 64 }: { ttlMs: number; maxEntries?: number }): TtlCache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      // Map은 삽입 순서를 유지하므로, 다시 넣어 최근 사용 항목을 뒤로 보낸다.
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
    clear() {
      entries.clear();
    },
  };
}
