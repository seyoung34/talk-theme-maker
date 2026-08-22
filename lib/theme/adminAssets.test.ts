import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAssetCandidateInput } from "@/lib/theme/adminAssets";

const assetId = "11111111-2222-4333-8444-555555555555";

describe("admin asset storage persistence", () => {
  let createClient: ReturnType<typeof vi.fn>;
  let shadowPublishThemeAsset: ReturnType<typeof vi.fn>;
  let uploadCalls: { path: string; options: Record<string, unknown> }[];
  let removeCalls: string[][];
  let updatePayloads: Record<string, unknown>[];
  let upsertPayloads: Record<string, unknown>[];
  let upsertError: { message: string } | null;
  let client: ReturnType<typeof createClientStub>;

  function createClientStub() {
    const row: Record<string, unknown> = {
      id: assetId,
      slot_role: "main_background",
      platform: "android",
      asset_kind: "background",
      analysis: null,
      bubble_adjustment: null,
      title: "기존 배경",
      note: null,
      tags: [],
      file_name: "old.png",
      mime_type: "image/png",
      storage_path: `admin-assets/${assetId}/old.png`,
      asset_object_id: "stale-catalog-object",
      enabled: true,
      created_at: "2026-08-22T00:00:00.000Z",
      updated_at: "2026-08-22T00:00:00.000Z",
      admin_asset_targets: [{
        asset_id: assetId,
        platform: "android",
        slot_role: "main_background",
        target_kind: "exact_role",
        priority: 0,
        enabled: true,
      }],
      admin_asset_bubble_specs: [],
      admin_asset_variants: [],
    };

    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "admin-1" } }, error: null })) },
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async (path: string, _file: Blob, options: Record<string, unknown>) => {
            uploadCalls.push({ path, options });
            return { error: null };
          }),
          remove: vi.fn(async (paths: string[]) => {
            removeCalls.push(paths);
            return { error: null };
          }),
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "admin_assets") {
          return {
            upsert: vi.fn((payload: Record<string, unknown>) => {
              upsertPayloads.push(payload);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: upsertError ? null : row, error: upsertError })),
                })),
              };
            }),
            update: vi.fn((payload: Record<string, unknown>) => {
              updatePayloads.push(payload);
              if ("asset_object_id" in payload) row.asset_object_id = payload.asset_object_id;
              return { eq: vi.fn(async () => ({ error: null })) };
            }),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: row, error: null })) })),
            })),
          };
        }
        if (table === "admin_asset_targets" || table === "admin_asset_bubble_specs") {
          return {
            delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            insert: vi.fn(async () => ({ error: null })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
  }

  async function load() {
    vi.resetModules();
    vi.doMock("@/lib/supabase/client", () => ({ createClient }));
    vi.doMock("@/lib/theme/assetCatalog/shadowPublishClient", () => ({ shadowPublishThemeAsset }));
    vi.doMock("@/lib/theme/remoteAssets", () => ({
      getThemeAssetSignedUrls: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((path) => [path, `https://signed.test/${path}`]))),
      sanitizeStoragePathPart: (value: string) => value.replace(/[^\w.-]+/g, "-"),
      storagePathToFile: vi.fn(),
      themeAssetsBucketName: "theme-assets",
    }));
    return await import("@/lib/theme/adminAssets");
  }

  function input(overrides: Partial<AdminAssetCandidateInput> = {}): AdminAssetCandidateInput {
    return {
      id: assetId,
      platform: "android",
      slotRole: "main_background",
      assetKind: "background",
      title: "새 배경",
      tags: [],
      fileName: "new.png",
      mimeType: "image/png",
      blob: new Blob(["new-bytes"], { type: "image/png" }),
      ...overrides,
    };
  }

  beforeEach(() => {
    uploadCalls = [];
    removeCalls = [];
    updatePayloads = [];
    upsertPayloads = [];
    upsertError = null;
    client = createClientStub();
    createClient = vi.fn(() => client);
    shadowPublishThemeAsset = vi.fn(async () => ({ status: "disabled" }));
  });

  afterEach(() => {
    for (const moduleName of [
      "@/lib/supabase/client",
      "@/lib/theme/assetCatalog/shadowPublishClient",
      "@/lib/theme/remoteAssets",
    ]) vi.doUnmock(moduleName);
  });

  it("기존 에셋 재저장은 revision 경로에 올리고 stale catalog pointer를 먼저 끊는다", async () => {
    const { saveAdminAssetCandidate } = await load();

    const saved = await saveAdminAssetCandidate(input());

    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]).toMatchObject({
      path: expect.stringMatching(new RegExp(`^admin-assets/${assetId}/revisions/[0-9a-f-]+/new\\.png$`)),
      options: expect.objectContaining({ upsert: false }),
    });
    expect(upsertPayloads[0]).toMatchObject({
      id: assetId,
      storage_path: uploadCalls[0].path,
      asset_object_id: null,
    });
    expect(updatePayloads).toEqual([{ asset_object_id: null }]);
    expect(saved.assetObjectId).toBeUndefined();
    expect(removeCalls).toHaveLength(0);
  });

  it("기존 에셋의 DB 저장이 실패하면 새 revision만 정리하고 기존 경로는 건드리지 않는다", async () => {
    upsertError = { message: "database unavailable" };
    const { saveAdminAssetCandidate } = await load();

    await expect(saveAdminAssetCandidate(input())).rejects.toMatchObject({ message: "database unavailable" });

    expect(uploadCalls).toHaveLength(1);
    expect(removeCalls).toEqual([[uploadCalls[0].path]]);
    expect(removeCalls[0]).not.toContain(`admin-assets/${assetId}/old.png`);
    expect(updatePayloads).toHaveLength(0);
  });
});
