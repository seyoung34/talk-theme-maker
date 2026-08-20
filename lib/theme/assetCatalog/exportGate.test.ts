import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCatalogExportAssetAllowed, isCatalogExportEnabled, warnOnCatalogExportScopeDrift, isCatalogExportProducerEnabled, isCatalogExportScopeAllowed } from "@/lib/theme/assetCatalog/exportGate";

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

  // ref 노출은 서버 flag가 먼저 결정한다. allowlist 동작만 보려면 flag를 켜 둔다.
  beforeEach(() => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_ANDROID", "1");
    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_IOS", "1");
  });

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

/**
 * client/server 플래그 조합 4가지.
 *
 * 가장 위험한 조합은 producer만 켜진 경우다. 추천 API가 ref를 내주면 브라우저는 원본 File 없이
 * reference-only manifest를 만들고, Worker는 서버 flag가 꺼져 있어 503으로 거절한다. 폴백할
 * 바이트가 없으므로 export가 통째로 죽는다. 그래서 ref 노출 여부는 서버 flag가 결정한다.
 */
describe("client/server flag matrix", () => {
  afterEach(() => vi.unstubAllEnvs());

  function setFlags(server: string, client: string) {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_ANDROID", server);
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_ANDROID", client);
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", "");
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", "");
  }

  it.each([
    ["둘 다 꺼짐", "0", "0", false],
    ["서버만 켜짐", "1", "0", true],
    ["producer만 켜짐", "0", "1", false],
    ["둘 다 켜짐", "1", "1", true],
  ])("%s → ref 노출 %s", (_label, server, client, exposed) => {
    setFlags(server, client);
    expect(isCatalogExportAssetAllowed("android", "admin:a")).toBe(exposed);
  });

  it("producer만 켜지면 drift로 기록한다", () => {
    setFlags("0", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOnCatalogExportScopeDrift("ios");
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_IOS", "0");
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_IOS", "1");
    warnOnCatalogExportScopeDrift("android");
    expect(warn).toHaveBeenCalledWith("Catalog export scope drift", expect.stringContaining("producer flag on with server flag off"));
    warn.mockRestore();
  });
});
