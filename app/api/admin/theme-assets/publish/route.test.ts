import { createHash } from "node:crypto";

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
  let registryStore: { findLatestRevision: ReturnType<typeof vi.fn>; findActive: ReturnType<typeof vi.fn> };
  let activeRecord: { revision: number; sha256: string } | null;
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
    vi.doMock("@/lib/theme/assetCatalog/publish", () => ({
      CatalogPublishError: MockCatalogPublishError,
      // 실제 구현과 같은 값이어야 "같은 바이트" 판정을 검증할 수 있다.
      sha256Hex: vi.fn(async (bytes: Uint8Array) => createHash("sha256").update(Buffer.from(bytes)).digest("hex")),
    }));
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
    activeRecord = null;
    registryStore = { findLatestRevision: vi.fn(async () => 0), findActive: vi.fn(async () => activeRecord) };
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

  /**
   * 템플릿 업로드는 저장되기 전에 게시하므로 "원본 행이 이미 있는가"를 확인할 수 없다.
   * 관리자 인증과 식별자 모양만 보고 통과시킨다. 템플릿이 참조하지 않는 행은 export 판정에서
   * 아무 권한도 주지 못한다.
   */
  it("시스템 템플릿 source는 DB 조회 없이 게시한다", async () => {
    const POST = await load();

    const response = await POST(request({
      kind: "template",
      sourceId: "android-common-splash:upload:1789237594950",
      variantKey: "canonical",
      canonical: new File(["bytes"], "splash.png", { type: "image/png" }),
    }));

    expect(response.status).toBe(200);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(publishThemeAsset).toHaveBeenCalledWith(
      expect.objectContaining({ logicalAssetId: "tpl:android-common-splash:upload:1789237594950" }),
      expect.anything(),
    );
  });

  /**
   * revision은 "내용의 이름"이다. 같은 내용에 번호를 새로 붙이면 직전 것이 retire되고, 그 참조를
   * 들고 있는 upload_refs가 export에서 `catalog_asset_revision_mismatch`로 실패한다. 같은 템플릿을
   * 동시에 두 번 저장할 때 실제로 그 상황이 만들어진다.
   */
  it("같은 바이트가 이미 active면 새 revision을 만들지 않고 재사용한다", async () => {
    const canonical = new File(["png-bytes"], "background.png", { type: "image/png" });
    const sha256 = createHash("sha256").update("png-bytes").digest("hex");
    activeRecord = { revision: 7, sha256 };
    const POST = await load();

    const response = await POST(request({ kind: "admin", sourceId: adminAssetId, variantKey: "canonical", canonical }));

    expect(response.status).toBe(200);
    expect(registryStore.findLatestRevision).not.toHaveBeenCalled();
    expect(publishThemeAsset).toHaveBeenCalledWith(expect.objectContaining({ revision: 7 }), expect.anything());
  });

  /**
   * 같은 바이트를 동시에 저장하면 둘 다 active를 못 보고 revision 1을 집는다. 진 쪽이 재시도에서
   * **상태를 다시 읽지 않으면** revision 2를 만들어 1을 retire시키고, 1을 참조로 저장한 템플릿은
   * 나중에 `catalog_asset_revision_mismatch`로 깨진다. 재시도는 번호를 올리는 게 아니라 판단을
   * 다시 내리는 것이어야 한다.
   */
  it("경합으로 재시도하면 상태를 다시 읽어 같은 revision으로 수렴한다", async () => {
    const canonical = new File(["png-bytes"], "background.png", { type: "image/png" });
    const sha256 = createHash("sha256").update("png-bytes").digest("hex");
    // 첫 시도: active 없음 → revision 1. 그 사이 다른 요청이 같은 내용으로 1을 활성화한다.
    activeRecord = null;
    const conflict = Object.assign(new Error("duplicate key"), { code: "23505" });
    publishThemeAsset
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async () => ({
        status: "already-active",
        record: { id: "registry-1", logicalAssetId: `admin:${adminAssetId}`, revision: 1, variantKey: "canonical", gcsObjectKey: "catalog/v1/aa/object.png", fileName: "background.png", mimeType: "image/png", sizeBytes: 9, sourceScale: 1, width: 10, height: 10, pngSignatureVerified: true },
        previewsSkipped: false,
        orphanCandidates: [],
      }));
    registryStore.findActive.mockImplementationOnce(async () => null).mockImplementation(async () => ({ revision: 1, sha256 }));
    const POST = await load();

    const response = await POST(request({ kind: "admin", sourceId: adminAssetId, variantKey: "canonical", canonical }));

    expect(response.status).toBe(200);
    // 두 번째 시도는 2가 아니라 1이어야 한다.
    expect(publishThemeAsset.mock.calls.map((call) => (call[0] as { revision: number }).revision)).toEqual([1, 1]);
    expect(await response.json()).toMatchObject({ status: "already-active", revision: 1 });
  });

  it("내용이 다르면 종전대로 다음 revision을 집는다", async () => {
    const canonical = new File(["png-bytes"], "background.png", { type: "image/png" });
    activeRecord = { revision: 7, sha256: "0".repeat(64) };
    const POST = await load();

    await POST(request({ kind: "admin", sourceId: adminAssetId, variantKey: "canonical", canonical }));

    expect(registryStore.findLatestRevision).toHaveBeenCalled();
    expect(publishThemeAsset).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }), expect.anything());
  });

  it("템플릿 업로드 식별자 모양이 아니면 게시하지 않는다", async () => {
    const POST = await load();

    const response = await POST(request({ kind: "template", sourceId: "bad id/with slash", variantKey: "canonical" }));

    expect(response.status).toBe(400);
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
