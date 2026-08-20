import { afterEach, describe, expect, it, vi } from "vitest";
import { createEdgeRegistryStore, EdgeRegistryStoreError } from "@/lib/theme/assetCatalog/edgeRegistryStore";

const supabaseUrl = "https://example.supabase.co";
const secretKey = "service-role-test-secret";
const adminAssetId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function registryRow() {
  return {
    id: "object-a",
    logical_asset_id: `admin:${adminAssetId}`,
    revision: 2,
    variant_key: "canonical",
    status: "active",
    gcs_object_key: "catalog/v1/asset-a/main.png",
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
  };
}

describe("edge registry store", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("active registry를 Supabase REST로 batch 조회한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    vi.stubEnv("SUPABASE_SECRET_KEY", secretKey);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([registryRow()]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEdgeRegistryStore().findActiveByKeys([
      { logicalAssetId: `admin:${adminAssetId}`, variantKey: "canonical" },
    ]);

    expect(result[0]).toMatchObject({ logicalAssetId: `admin:${adminAssetId}`, status: "active", sizeBytes: 1024 });
    const [request, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(request.pathname).toBe("/rest/v1/theme_asset_objects");
    expect(request.searchParams.get("status")).toBe("eq.active");
    expect(request.searchParams.get("or")).toContain(`logical_asset_id.eq."admin:${adminAssetId}"`);
    expect(init.headers).toMatchObject({ apikey: secretKey, "User-Agent": "talktheme-maker-worker" });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("admin asset 정책을 중첩 relation과 함께 조회한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    vi.stubEnv("SUPABASE_SECRET_KEY", secretKey);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{
      id: adminAssetId,
      slot_role: "main_background",
      platform: "android",
      asset_kind: "background",
      enabled: true,
      admin_asset_targets: [{
        id: "target-1",
        asset_id: adminAssetId,
        platform: "android",
        slot_role: "main_background",
        target_kind: "exact_role",
        priority: 0,
        enabled: true,
      }],
    }]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEdgeRegistryStore().findAdminAssetExportAccess([adminAssetId]);

    expect(result[0]).toMatchObject({ id: adminAssetId, platform: "android", enabled: true });
    const request = fetchMock.mock.calls[0][0] as URL;
    expect(request.pathname).toBe("/rest/v1/admin_assets");
    expect(request.searchParams.get("id")).toBe(`in.(${adminAssetId})`);
    expect(request.searchParams.get("select")).toContain("admin_asset_targets");
  });

  it("public와 소유자 template variant 정책을 각각 조회한다", async () => {
    const uploadEntryId = "ios-bubble-me-1:upload:1";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    vi.stubEnv("SUPABASE_SECRET_KEY", secretKey);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{
        platform: "android",
        upload_refs: { "android-bubble-me-1": [{ id: uploadEntryId }] },
        system_template_bundles: { status: "published", visibility: "public", created_by: "33333333-3333-4333-8333-333333333333" },
      }]))
      .mockResolvedValueOnce(jsonResponse([{
        platform: "ios",
        upload_refs: { "ios-bubble-me-1": [{ id: uploadEntryId }] },
        system_template_bundles: { status: "draft", visibility: "private", created_by: ownerId },
      }]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEdgeRegistryStore().findTemplateAssetExportAccess({
      uploadEntryIds: [uploadEntryId],
      userId: ownerId,
    });

    expect(result).toEqual([
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "android", resourceRoles: ["bubble_me_1"] },
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "ios", resourceRoles: ["bubble_me_1"] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][0] as URL).searchParams.get("system_template_bundles.status")).toBe("eq.published");
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get("system_template_bundles.created_by")).toBe(`eq.${ownerId}`);
  });

  it("REST 오류는 secret을 노출하지 않고 상태만 전달한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    vi.stubEnv("SUPABASE_SECRET_KEY", secretKey);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("internal details", { status: 503 })));

    const error = await createEdgeRegistryStore().findActiveByKeys([
      { logicalAssetId: `admin:${adminAssetId}`, variantKey: "canonical" },
    ]).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(EdgeRegistryStoreError);
    expect(error).toMatchObject({ code: "registry_lookup_failed", status: 503 });
    expect((error as Error).message).not.toContain(secretKey);
  });
});
