import { describe, expect, it, vi } from "vitest";
import { resolveCatalogManifestForExport } from "@/lib/theme/assetCatalog/workerResolve";
import { mapThemeAssetObjectRow } from "@/lib/theme/assetCatalog/registry";

const selection = { kind: "catalog" as const, assetId: "admin:asset-a", revision: 2, variantKey: "canonical" };

function record() {
  return mapThemeAssetObjectRow({
    id: "object-a",
    logical_asset_id: "admin:asset-a",
    revision: 2,
    variant_key: "canonical",
    status: "active",
    gcs_object_key: "catalog/v1/asset-a/a.png",
    gcs_generation: "9",
    sha256: "a".repeat(64),
    size_bytes: 1024,
    mime_type: "image/png",
    file_name: "main.png",
    source_scale: 3,
    width: 1125,
    height: 2436,
    png_signature_verified: true,
    r2_previews: {},
    created_at: "2026-08-19T00:00:00Z",
    activated_at: "2026-08-19T00:01:00Z",
  });
}

describe("resolveCatalogManifestForExport", () => {
  it("catalog가 없으면 registry 조회 없이 기존 manifest를 통과시킨다", async () => {
    const findActiveByKeys = vi.fn();
    const result = await resolveCatalogManifestForExport({
      manifest: [{ path: "a.png", field: "file-0" }],
      uploadedInputBytes: 12,
      platform: "android",
      store: { findActiveByKeys },
    });

    expect(result.manifest).toEqual([{ path: "a.png", field: "file-0" }]);
    expect(result.referencedAssetBytes).toBe(0);
    expect(findActiveByKeys).not.toHaveBeenCalled();
  });

  it("selection을 batch 조회해 Builder용 catalogObject로 치환한다", async () => {
    const findActiveByKeys = vi.fn(async (keys: readonly { logicalAssetId: string; variantKey: string }[]) => {
      expect(keys).toEqual([{ logicalAssetId: "admin:asset-a", variantKey: "canonical" }]);
      return [record()];
    });

    const result = await resolveCatalogManifestForExport({
      manifest: [
        { path: "src/main/theme/drawable-xxhdpi/main.png", catalogAsset: selection },
        { path: "src/main/theme/drawable-xxhdpi/other.png", field: "file-0" },
      ],
      uploadedInputBytes: 8,
      platform: "android",
      store: { findActiveByKeys },
    });

    expect(result.manifest[0]).toMatchObject({
      path: "src/main/theme/drawable-xxhdpi/main.png",
      catalogObject: { objectKey: "catalog/v1/asset-a/a.png", generation: "9", sha256: "a".repeat(64) },
    });
    expect(result.manifest[1]).toEqual({ path: "src/main/theme/drawable-xxhdpi/other.png", field: "file-0" });
    expect(result.referencedAssetBytes).toBe(1024);
    expect(result.referencedAssetFileCount).toBe(1);
  });

  it("active revision이 달라지면 최신으로 바꾸지 않고 명시적인 오류를 낸다", async () => {
    await expect(resolveCatalogManifestForExport({
      manifest: [{ path: "src/main/theme/drawable-xxhdpi/main.png", catalogAsset: { ...selection, revision: 1 } }],
      uploadedInputBytes: 0,
      platform: "android",
      store: { findActiveByKeys: async () => [record()] },
    })).rejects.toMatchObject({ code: "catalog_asset_revision_mismatch", status: 409 });
  });
});
