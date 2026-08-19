import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminCatalogUploadRef } from "@/lib/theme/assetCatalog/clientRef";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssetDomain";
import type { ThemeAssetSlot } from "@/lib/theme/templates";

const catalog = {
  selection: { kind: "catalog" as const, assetId: "admin:asset-a", revision: 2, variantKey: "canonical" },
  fileName: "main@3x.png",
  mimeType: "image/png",
  size: 2048,
  sourceScale: 3 as const,
  width: 1125,
  height: 2436,
  pngSignatureVerified: true,
};

const asset: AdminAssetCandidate = {
  id: "asset-a",
  slotRole: "main_background",
  platform: "android",
  title: "테스트 에셋",
  tags: [],
  fileName: catalog.fileName,
  mimeType: catalog.mimeType,
  storagePath: "admin-assets/asset-a/main@3x.png",
  previewUrl: "https://cdn.example.com/main.webp",
  catalog,
  createdAt: 0,
  updatedAt: 0,
  enabled: true,
};

function slot(overrides: Partial<ThemeAssetSlot> = {}) {
  return {
    id: "main-background",
    platform: "android" as const,
    role: "main_background" as const,
    kind: "image" as const,
    path: "src/main/theme/drawable-xxhdpi/main.png",
    ...overrides,
  } as ThemeAssetSlot;
}

describe("createAdminCatalogUploadRef", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_ANDROID", "1");
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_IOS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("변환이 필요 없는 추천 에셋은 metadata를 가진 catalog ref로 바꾼다", () => {
    expect(createAdminCatalogUploadRef(slot(), asset)).toEqual({
      ...catalog,
      legacyStoragePath: "admin-assets/asset-a/main@3x.png",
      previewUrl: "https://cdn.example.com/main.webp",
    });
  });

  it("iOS target 배율이 다르면 기존 File fallback을 선택한다", () => {
    const iosAsset = { ...asset, catalog: { ...catalog, sourceScale: 2 as const } };
    const iosSlot = slot({
      id: "ios-main-background",
      platform: "ios",
      path: "Images/main@3x.png",
    });

    expect(createAdminCatalogUploadRef(iosSlot, iosAsset)).toBeUndefined();
  });

  it("nine-patch 슬롯은 marker 변환을 위해 catalog ref를 만들지 않는다", () => {
    expect(createAdminCatalogUploadRef(slot({ kind: "ninepatch" }), asset)).toBeUndefined();
  });

  it("producer flag가 꺼져 있으면 기존 File fallback을 선택한다", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_ANDROID", "0");
    expect(createAdminCatalogUploadRef(slot(), asset)).toBeUndefined();
  });
});
