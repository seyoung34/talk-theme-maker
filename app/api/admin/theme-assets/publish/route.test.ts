import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adminAssetId = "11111111-2222-4333-8444-555555555555";
const objectId = "99999999-8888-4777-8666-555555555555";

class MockCatalogPublishFailure extends Error {
  readonly orphanCandidates: string[] = [];
}

class MockCatalogPublishError extends Error {
  readonly code = "invalid_input";
}

describe("POST /api/admin/theme-assets/publish", () => {
  let createAdminClient: ReturnType<typeof vi.fn>;
  let getCurrentAdmin: ReturnType<typeof vi.fn>;
  let publishThemeAsset: ReturnType<typeof vi.fn>;
  let readCatalogStorageConfig: ReturnType<typeof vi.fn>;
  let getCatalogPublisherAccessToken: ReturnType<typeof vi.fn>;
  let createRegistryStore: ReturnType<typeof vi.fn>;
  let registryStore: { findLatestRevision: ReturnType<typeof vi.fn> };
  let sourceExists = true;
  let linkExists = true;
  let sourceFilters: { table: string; column: string; value: unknown }[];
  let updatePayloads: { table: string; payload: Record<string, unknown> }[];
  let updateFilters: { table: string; column: string; value: unknown }[];

  function createAdminClientStub() {
    return {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => {
          const query = {
            eq: vi.fn((column: string, value: unknown) => {
              sourceFilters.push({ table, column, value });
              return query;
            }),
            maybeSingle: vi.fn(async () => ({
              data: sourceExists ? { id: adminAssetId } : null,
              error: null,
            })),
          };
          return query;
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push({ table, payload });
          const query = {
            eq: vi.fn((column: string, value: unknown) => {
              updateFilters.push({ table, column, value });
              return query;
            }),
            select: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({
              data: linkExists ? { id: adminAssetId } : null,
              error: null,
            })),
          };
          return query;
        }),
      })),
    };
  }

  async function load() {
    vi.resetModules();
    vi.doMock("@/lib/supabase/auth", () => ({ getCurrentAdmin }));
    vi.doMock("@/lib/supabase/server", () => ({ createAdminClient }));
    vi.doMock("@/lib/theme/assetCatalog/publishService", () => ({
      CatalogPublishFailure: MockCatalogPublishFailure,
      publishThemeAsset,
    }));
    vi.doMock("@/lib/theme/assetCatalog/publish", () => ({ CatalogPublishError: MockCatalogPublishError }));
    vi.doMock("@/lib/theme/assetCatalog/registryStore", () => ({ createRegistryStore }));
    vi.doMock("@/lib/theme/assetCatalog/gcsCatalog", () => ({
      getCatalogPublisherAccessToken,
      putCatalogObject: vi.fn(),
      readCatalogStorageConfig,
    }));
    vi.doMock("@/lib/theme/assetCatalog/r2Preview", () => ({ getPreviewBucket: vi.fn(() => null) }));
    return (await import("@/app/api/admin/theme-assets/publish/route")).POST;
  }

  function request(fields: Record<string, string | File>) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return new Request("http://localhost/api/admin/theme-assets/publish", { method: "POST", body: form });
  }

  beforeEach(() => {
    sourceExists = true;
    linkExists = true;
    sourceFilters = [];
    updatePayloads = [];
    updateFilters = [];
    vi.stubEnv("ASSET_CATALOG_WRITE_ENABLED", "1");
    getCurrentAdmin = vi.fn(async () => ({ configured: true, user: { id: "admin-1" }, profile: { user_id: "admin-1" } }));
    registryStore = { findLatestRevision: vi.fn(async () => 0) };
    createRegistryStore = vi.fn(() => registryStore);
    createAdminClient = vi.fn(() => createAdminClientStub());
    publishThemeAsset = vi.fn(async () => ({
      status: "published",
      record: {
        id: objectId,
        logicalAssetId: `admin:${adminAssetId}`,
        revision: 1,
        gcsObjectKey: "catalog/v1/aa/object.png",
      },
      previewsSkipped: false,
    }));
    readCatalogStorageConfig = vi.fn(() => ({ bucket: "theme-assets", publisherServiceAccount: "publisher@example.com" }));
    getCatalogPublisherAccessToken = vi.fn(async () => "access-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const moduleName of [
      "@/lib/supabase/auth",
      "@/lib/supabase/server",
      "@/lib/theme/assetCatalog/publishService",
      "@/lib/theme/assetCatalog/publish",
      "@/lib/theme/assetCatalog/registryStore",
      "@/lib/theme/assetCatalog/gcsCatalog",
      "@/lib/theme/assetCatalog/r2Preview",
    ]) vi.doUnmock(moduleName);
  });

  it("시스템 템플릿 source는 관리자 에셋 publish 경로에서 명시적으로 막는다", async () => {
    const POST = await load();

    const response = await POST(request({ kind: "template", sourceId: "template-1", variantKey: "canonical" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "시스템 템플릿 에셋 게시 경로는 아직 지원하지 않습니다." });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(publishThemeAsset).not.toHaveBeenCalled();
  });

  it("관리자 에셋 source id가 UUID가 아니면 DB 조회 전에 거부한다", async () => {
    const POST = await load();

    const response = await POST(request({ kind: "admin", sourceId: "not-a-uuid", variantKey: "canonical" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "관리자 에셋 식별자가 올바르지 않습니다." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("플랫폼 variant가 실제로 없으면 catalog publish를 시작하지 않는다", async () => {
    sourceExists = false;
    const POST = await load();

    const response = await POST(request({ kind: "admin", sourceId: adminAssetId, variantKey: "ios" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "관리자 에셋 또는 플랫폼 variant를 찾을 수 없습니다." });
    expect(sourceFilters).toEqual([
      { table: "admin_asset_variants", column: "asset_id", value: adminAssetId },
      { table: "admin_asset_variants", column: "platform", value: "ios" },
    ]);
    expect(publishThemeAsset).not.toHaveBeenCalled();
  });

  it("canonical publish 성공 후 admin_assets에 현재 catalog object를 연결한다", async () => {
    const POST = await load();
    const canonical = new File(["png-bytes"], "background.png", { type: "image/png" });

    const response = await POST(request({
      kind: "admin",
      sourceId: adminAssetId,
      variantKey: "canonical",
      revision: "1",
      canonical,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "published",
      logicalAssetId: `admin:${adminAssetId}`,
      revision: 1,
      objectKey: "catalog/v1/aa/object.png",
    });
    expect(publishThemeAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        logicalAssetId: `admin:${adminAssetId}`,
        revision: 1,
        variantKey: "canonical",
        canonical: expect.objectContaining({ fileName: "background.png", mimeType: "image/png" }),
      }),
      expect.any(Object),
    );
    expect(updatePayloads).toEqual([{ table: "admin_assets", payload: { asset_object_id: objectId } }]);
    expect(updateFilters).toEqual([{ table: "admin_assets", column: "id", value: adminAssetId }]);
  });

  it("플랫폼 variant publish는 source와 catalog pointer를 variant 행으로 제한한다", async () => {
    const POST = await load();
    const canonical = new File(["ios-png"], "common.png", { type: "image/png" });

    const response = await POST(request({
      kind: "admin",
      sourceId: adminAssetId,
      variantKey: "ios",
      canonical,
    }));

    expect(response.status).toBe(200);
    expect(sourceFilters).toEqual([
      { table: "admin_asset_variants", column: "asset_id", value: adminAssetId },
      { table: "admin_asset_variants", column: "platform", value: "ios" },
    ]);
    expect(updatePayloads).toEqual([{ table: "admin_asset_variants", payload: { asset_object_id: objectId } }]);
    expect(updateFilters).toEqual([
      { table: "admin_asset_variants", column: "asset_id", value: adminAssetId },
      { table: "admin_asset_variants", column: "platform", value: "ios" },
    ]);
  });
});
