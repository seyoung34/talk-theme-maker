import { beforeEach, describe, expect, it, vi } from "vitest";

const caches = vi.hoisted(() => ({
  static: { name: "cf-static-assets-incremental-cache", get: vi.fn() },
  dummy: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock("@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache", () => ({ default: caches.static }));
vi.mock("@opennextjs/aws/overrides/incrementalCache/dummy.js", () => ({ default: caches.dummy }));
import cache from "./privacyIncrementalCache";

describe("privacy SSG opt-in", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves only the exact privacy page cache through static assets", async () => {
    const entry = { value: { type: "app", html: "policy", rsc: "flight" } };
    caches.static.get.mockResolvedValue(entry);
    expect(await cache.get("/privacy")).toBe(entry);
    expect(caches.static.get).toHaveBeenCalledWith("/privacy", undefined);
    expect(cache.name).toBe(caches.static.name);
    expect(caches.dummy.get).not.toHaveBeenCalled();
  });

  it.each([
    ["/", undefined], ["/terms", "cache"], ["/admin", undefined],
    ["/api/me", undefined], ["/privacy/child", undefined],
    ["/privacy", "fetch"], ["/privacy", "composable"],
  ] as const)("retains dummy behavior for %s %s", async (key, type) => {
    caches.dummy.get.mockResolvedValue(null);
    expect(await cache.get(key, type)).toBeNull();
    expect(caches.dummy.get).toHaveBeenCalledWith(key, type);
    expect(caches.static.get).not.toHaveBeenCalled();
  });

  it("lets a missing asset fall back to Next instead of caching an error", async () => {
    caches.static.get.mockResolvedValue(null);
    expect(await cache.get("/privacy", "cache")).toBeNull();
  });

  it("retains existing write and delete behavior", async () => {
    await cache.delete("/privacy");
    expect(caches.dummy.delete).toHaveBeenCalledWith("/privacy");
  });
});
