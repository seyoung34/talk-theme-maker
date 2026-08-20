import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCatalogExportEnabled, isCatalogExportProducerEnabled, isCatalogExportScopeAllowed } from "@/lib/theme/assetCatalog/exportGate";

describe("catalog export rollout scope", () => {
  beforeEach(() => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_ANDROID", "1");
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_ANDROID", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allowlist가 없으면 기존 platform flag-only 동작을 유지한다", () => {
    expect(isCatalogExportEnabled("android", { userId: "user-a", assetIds: ["admin:asset-a"] })).toBe(true);
    expect(isCatalogExportProducerEnabled("android", { userId: "user-a", assetIds: ["admin:asset-a"] })).toBe(true);
  });

  it("server와 client allowlist는 각각 자기 환경 변수만 읽는다", () => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_USER_ALLOWLIST", "user-a");
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", "admin:asset-a");
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ANDROID_USER_ALLOWLIST", "user-a");
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", "admin:asset-a");

    const allowed = { userId: "user-a", assetIds: ["admin:asset-a"] };
    expect(isCatalogExportEnabled("android", allowed)).toBe(true);
    expect(isCatalogExportProducerEnabled("android", allowed)).toBe(true);
    expect(isCatalogExportEnabled("android", { ...allowed, userId: "user-b" })).toBe(false);
    expect(isCatalogExportProducerEnabled("android", { ...allowed, assetIds: ["admin:asset-b"] })).toBe(false);
  });

  it("manifest에 allowlist 밖의 ref가 하나라도 있으면 전체 catalog 요청을 차단한다", () => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", "admin:asset-a admin:asset-b");

    expect(isCatalogExportScopeAllowed("android", {
      userId: "user-a",
      assetIds: ["admin:asset-a", "admin:asset-b"],
    }, "server")).toBe(true);
    expect(isCatalogExportScopeAllowed("android", {
      userId: "user-a",
      assetIds: ["admin:asset-a", "tpl:asset-c"],
    }, "server")).toBe(false);
  });

  it("platform별 allowlist는 서로 섞이지 않는다", () => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_USER_ALLOWLIST", "user-a");
    vi.stubEnv("ASSET_CATALOG_EXPORT_IOS_USER_ALLOWLIST", "user-ios");
    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_IOS", "1");

    expect(isCatalogExportEnabled("android", { userId: "user-a", assetIds: ["admin:asset-a"] })).toBe(true);
    expect(isCatalogExportEnabled("ios", { userId: "user-a", assetIds: ["admin:asset-a"] })).toBe(false);
    expect(isCatalogExportEnabled("ios", { userId: "user-ios", assetIds: ["admin:asset-a"] })).toBe(true);
  });
});
