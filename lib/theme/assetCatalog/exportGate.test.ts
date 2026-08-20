import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCatalogExportAssetAllowed, isCatalogExportEnabled, isCatalogExportProducerEnabled, isCatalogExportScopeAllowed } from "@/lib/theme/assetCatalog/exportGate";

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

/**
 * 브라우저는 `NEXT_PUBLIC_*` 값만 볼 수 있어 서버 allowlist를 알 수 없다. 두 목록이 어긋나
 * 범위 밖 자산에 ref를 만들면 Worker가 manifest 전체를 503으로 거절하고, 바이트는 업로드된
 * 적이 없어 폴백도 없다. 그래서 ref를 나눠 주는 서버가 범위를 판정한다.
 */
describe("isCatalogExportAssetAllowed", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allowlist가 비어 있으면 제한하지 않는다", () => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", "");
    expect(isCatalogExportAssetAllowed("android", "admin:a")).toBe(true);
  });

  it("목록에 있으면 허용하고 없으면 막는다", () => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", "admin:a, admin:b");
    expect(isCatalogExportAssetAllowed("android", "admin:a")).toBe(true);
    expect(isCatalogExportAssetAllowed("android", "admin:c")).toBe(false);
  });

  it("플랫폼별 목록을 따로 본다", () => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", "admin:a");
    vi.stubEnv("ASSET_CATALOG_EXPORT_IOS_ASSET_ALLOWLIST", "admin:b");
    expect(isCatalogExportAssetAllowed("ios", "admin:a")).toBe(false);
    expect(isCatalogExportAssetAllowed("ios", "admin:b")).toBe(true);
  });
});
