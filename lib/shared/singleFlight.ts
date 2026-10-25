// Coalesce public, immutable lookup work within one isolate. Never cache failures.
// At capacity, execute independently instead of retaining unbounded pending keys.
export function createSingleFlight<T>(maxEntries = 128) {
  const pending = new Map<string, Promise<T>>();
  return {
    run(key: string, load: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing;
      if (pending.size >= maxEntries) return load();
      const promise = Promise.resolve().then(load).finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      });
      pending.set(key, promise);
      return promise;
    },
  };
}
