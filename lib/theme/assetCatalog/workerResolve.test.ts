import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCatalogManifestForExport } from "@/lib/theme/assetCatalog/workerResolve";
import { mapThemeAssetObjectRow } from "@/lib/theme/assetCatalog/registry";

const adminAssetId = "11111111-1111-4111-8111-111111111111";
const selection = { kind: "catalog" as const, assetId: `admin:${adminAssetId}`, revision: 2, variantKey: "canonical" };
const templateUploadEntryId = "android-bubble-me-1:upload:1";
const templateSelection = { kind: "catalog" as const, assetId: `tpl:${templateUploadEntryId}`, revision: 2, variantKey: "canonical" };

function record(overrides: Record<string, unknown> = {}) {
  return mapThemeAssetObjectRow({
    id: "object-a",
    logical_asset_id: `admin:${adminAssetId}`,
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
    ...overrides,
  });
}

describe("resolveCatalogManifestForExport", () => {
  beforeEach(() => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_ANDROID", "1");
    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_IOS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
      expect(keys).toEqual([{ logicalAssetId: `admin:${adminAssetId}`, variantKey: "canonical" }]);
      return [record()];
    });
    const findAdminAssetExportAccess = vi.fn(async (ids: readonly string[]) => {
      expect(ids).toEqual([adminAssetId]);
      return [{
        id: adminAssetId,
        enabled: true,
        assetKind: "background" as const,
        platform: "android" as const,
        slotRole: "main_background" as const,
        targets: [{ assetId: adminAssetId, platform: "android" as const, slotRole: "main_background" as const, targetKind: "exact_role" as const, priority: 0, enabled: true }],
      }];
    });

    const result = await resolveCatalogManifestForExport({
      manifest: [
        { path: "src/main/theme/drawable-xxhdpi/main.png", catalogAsset: selection, resourceRole: "main_background" },
        { path: "src/main/theme/drawable-xxhdpi/other.png", field: "file-0" },
      ],
      uploadedInputBytes: 8,
      platform: "android",
      store: { findActiveByKeys, findAdminAssetExportAccess },
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

  it("admin asset 정책이 없으면 catalog ref를 enqueue하지 않는다", async () => {
    await expect(resolveCatalogManifestForExport({
      manifest: [{ path: "src/main/theme/drawable-xxhdpi/main.png", catalogAsset: selection, resourceRole: "main_background" }],
      uploadedInputBytes: 0,
      platform: "android",
      store: {
        findActiveByKeys: async () => [record()],
        findAdminAssetExportAccess: async () => [],
      },
    })).rejects.toMatchObject({ code: "catalog_asset_not_allowed", status: 403 });
  });

  /**
   * 관리자가 추천 에셋을 지우거나 비활성화해도, 그 에셋이 들어 있는 **발행된 템플릿**을 쓰는
   * 사용자의 내보내기는 계속 동작해야 한다. 삭제는 하드 삭제라 Supabase 바이트까지 사라지지만
   * GCS catalog 객체는 연쇄되지 않으므로 결과물은 예전과 같다.
   */
  it("admin 정책이 막아도 발행된 템플릿 안에 있으면 통과시킨다", async () => {
    const result = await resolveCatalogManifestForExport({
      manifest: [{ path: "src/main/theme/drawable-xxhdpi/main.png", catalogAsset: selection, resourceRole: "main_background" }],
      uploadedInputBytes: 0,
      platform: "android",
      store: {
        findActiveByKeys: async () => [record()],
        // 삭제됐거나 비활성이라 정책 행이 없다.
        findAdminAssetExportAccess: async () => [],
        findTemplateAssetExportAccess: async () => [{ logicalAssetId: selection.assetId, platform: "android" as const }],
      },
    });

    expect(result.manifest[0]).toHaveProperty("catalogObject.objectKey");
  });

  // 템플릿 멤버십도 플랫폼 단위다. Android 템플릿에만 있는 자산을 iOS 내보내기가 쓰지 못한다.
  it("템플릿 멤버십이 다른 플랫폼이면 여전히 막는다", async () => {
    await expect(resolveCatalogManifestForExport({
      manifest: [{ path: "Images/main@3x.png", catalogAsset: selection, resourceRole: "main_background" }],
      uploadedInputBytes: 0,
      platform: "ios",
      store: {
        findActiveByKeys: async () => [record()],
        findAdminAssetExportAccess: async () => [],
        findTemplateAssetExportAccess: async () => [{ logicalAssetId: selection.assetId, platform: "android" as const }],
      },
    })).rejects.toMatchObject({ code: "catalog_asset_not_allowed", status: 403 });
  });

  it("catalog ref에 resourceRole이 없으면 잘못된 요청으로 분류한다", async () => {
    await expect(resolveCatalogManifestForExport({
      manifest: [{ path: "src/main/theme/drawable-xxhdpi/main.png", catalogAsset: selection }],
      uploadedInputBytes: 0,
      platform: "android",
      store: {
        findActiveByKeys: async () => [record()],
        findAdminAssetExportAccess: async () => [],
      },
    })).rejects.toMatchObject({ code: "invalid_catalog_asset", status: 400 });
  });

  it("published/public 템플릿 ref를 요청 플랫폼에서만 해석한다", async () => {
    const findActiveByKeys = vi.fn(async () => [record({ logical_asset_id: `tpl:${templateUploadEntryId}` })]);
    const findTemplateAssetExportAccess = vi.fn(async (input: { uploadEntryIds: readonly string[]; catalogAssetIds?: readonly string[]; userId?: string }) => {
      expect(input).toEqual({ uploadEntryIds: [templateUploadEntryId], catalogAssetIds: [], userId: "user-a" });
      return [{ logicalAssetId: `tpl:${templateUploadEntryId}`, platform: "android" as const }];
    });

    const result = await resolveCatalogManifestForExport({
      manifest: [{ path: "src/main/theme/drawable-xxhdpi/bubble.png", catalogAsset: templateSelection, resourceRole: "bubble_me_1" }],
      uploadedInputBytes: 0,
      platform: "android",
      userId: "user-a",
      store: { findActiveByKeys, findTemplateAssetExportAccess },
    });

    expect(result.manifest[0]).toHaveProperty("catalogObject.objectKey");
  });

  it("template ref의 platform 정책이 맞지 않으면 차단한다", async () => {
    await expect(resolveCatalogManifestForExport({
      manifest: [{ path: "Images/bubble@3x.png", catalogAsset: { ...templateSelection, variantKey: "canonical" }, resourceRole: "bubble_me_1" }],
      uploadedInputBytes: 0,
      platform: "ios",
      store: {
        findActiveByKeys: async () => [record({ logical_asset_id: `tpl:${templateUploadEntryId}` })],
        findTemplateAssetExportAccess: async () => [{ logicalAssetId: `tpl:${templateUploadEntryId}`, platform: "android" as const }],
      },
    })).rejects.toMatchObject({ code: "catalog_asset_not_allowed", status: 403 });
  });

  it("server catalog export flag가 꺼져 있으면 catalog ref만 일시 차단한다", async () => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ENABLED_ANDROID", "0");
    const findActiveByKeys = vi.fn();

    await expect(resolveCatalogManifestForExport({
      manifest: [{ path: "src/main/theme/drawable-xxhdpi/main.png", catalogAsset: selection, resourceRole: "main_background" }],
      uploadedInputBytes: 0,
      platform: "android",
      store: { findActiveByKeys },
    })).rejects.toMatchObject({ code: "catalog_export_disabled", status: 503 });
    expect(findActiveByKeys).not.toHaveBeenCalled();
  });

  it("server canary allowlist 밖의 계정·asset ref는 registry 조회 전에 차단한다", async () => {
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_USER_ALLOWLIST", "user-canary");
    vi.stubEnv("ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST", `admin:${adminAssetId}`);
    const findActiveByKeys = vi.fn();

    await expect(resolveCatalogManifestForExport({
      manifest: [{ path: "src/main/theme/drawable-xxhdpi/main.png", catalogAsset: selection, resourceRole: "main_background" }],
      uploadedInputBytes: 0,
      platform: "android",
      userId: "user-other",
      store: { findActiveByKeys },
    })).rejects.toMatchObject({ code: "catalog_export_disabled", status: 503 });
    expect(findActiveByKeys).not.toHaveBeenCalled();
  });
});
