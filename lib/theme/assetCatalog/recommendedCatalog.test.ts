import { describe, expect, it } from "vitest";
import { findMatchingCatalogRef } from "@/lib/theme/assetCatalog/recommendedCatalog";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssetDomain";
import type { ThemeAssetObjectRecord } from "@/lib/theme/assetCatalog/registry";

const candidate = (assetObjectId?: string) => ({
  id: "asset-1",
  assetObjectId,
} as AdminAssetCandidate);

const record = (overrides: Partial<ThemeAssetObjectRecord> = {}) => ({
  id: "object-current",
  logicalAssetId: "admin:asset-1",
  revision: 2,
  variantKey: "canonical",
  status: "active",
  gcsObjectKey: "catalog/v1/current.png",
  gcsGeneration: "10",
  sha256: "a".repeat(64),
  sizeBytes: 10,
  mimeType: "image/png",
  fileName: "same-name.png",
  sourceScale: 3,
  width: 110,
  height: 93,
  pngSignatureVerified: true,
  r2Previews: {},
  createdAt: "2026-08-20T00:00:00.000Z",
  ...overrides,
} satisfies ThemeAssetObjectRecord);

describe("recommended catalog linkage", () => {
  it("filename·MIME이 같아도 현재 object link가 다르면 catalog ref를 만들지 않는다", () => {
    expect(findMatchingCatalogRef([record()], candidate("object-old"), "android", false)).toBeUndefined();
  });

  it("현재 object link가 일치할 때만 revision metadata를 내려준다", () => {
    expect(findMatchingCatalogRef([record()], candidate("object-current"), "android", false)).toMatchObject({
      selection: { assetId: "admin:asset-1", revision: 2, variantKey: "canonical" },
      fileName: "same-name.png",
    });
  });

  it("platform variant link는 canonical object로 대체하지 않는다", () => {
    expect(findMatchingCatalogRef([record({ id: "object-ios", variantKey: "ios" })], candidate("object-ios"), "ios", true)).toMatchObject({
      selection: { variantKey: "ios" },
    });
    expect(findMatchingCatalogRef([record()], candidate("object-current"), "ios", true)).toBeUndefined();
  });
});
