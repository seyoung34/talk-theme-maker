import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAssetCandidateInput } from "@/lib/theme/adminAssets";

const assetId = "11111111-2222-4333-8444-555555555555";
const previousPath = `admin-assets/${assetId}/old.png`;

describe("admin asset storage persistence", () => {
  let createClient: ReturnType<typeof vi.fn>;
  let shadowPublishThemeAsset: ReturnType<typeof vi.fn>;
  let uploadCalls: { path: string; options: Record<string, unknown> }[];
  let removeCalls: string[][];
  let rpcCalls: { name: string; args: Record<string, unknown> }[];
  let rpcError: { message: string } | null;
  let candidateError: { message: string } | null;
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
      storage_path: previousPath,
      asset_object_id: null,
      enabled: true,
      created_at: "2026-08-22T00:00:00.000Z",
      updated_at: "2026-08-22T00:00:00.000Z",
      admin_asset_targets: [{
        asset_id: assetId,
        platform: "all",
        slot_role: null,
        target_kind: "asset_kind",
        priority: 0,
        enabled: true,
      }],
      admin_asset_bubble_specs: [],
      admin_asset_variants: [],
    };

    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "admin-1" } }, error: null })) },
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: assetId, error: rpcError };
      }),
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
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: candidateError ? null : row, error: candidateError })),
                maybeSingle: vi.fn(async () => ({ data: { storage_path: previousPath }, error: null })),
              })),
            })),
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
    rpcCalls = [];
    rpcError = null;
    candidateError = null;
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

  /**
   * 부모·target·말풍선 spec을 나눠 쓰던 시절에는 그 사이에서 끊기면 target이 없는 에셋이
   * 남았다. 그 상태는 오류를 내지 않고 적용 범위만 조용히 좁아진다.
   */
  it("저장은 RPC 한 번으로 끝난다", async () => {
    const { saveAdminAssetCandidate } = await load();

    await saveAdminAssetCandidate(input());

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("upsert_admin_asset_bundle");
    expect(rpcCalls[0].args).toMatchObject({
      p_asset: expect.objectContaining({ id: assetId, storage_path: uploadCalls[0].path }),
      // target을 주지 않으면 부모 컬럼으로 legacy exact_role 하나를 만든다.
      p_targets: [expect.objectContaining({ target_kind: "exact_role", slot_role: "main_background" })],
    });
  });

  it("관리자 화면이 보내는 kind 전체 target을 그대로 싣는다", async () => {
    const { saveAdminAssetCandidate } = await load();

    await saveAdminAssetCandidate(input({
      targets: [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }],
    }));

    expect(rpcCalls[0].args).toMatchObject({
      p_targets: [expect.objectContaining({ platform: "all", target_kind: "asset_kind", slot_role: null })],
    });
  });

  it("기존 에셋 재저장은 revision 경로에 올린다", async () => {
    const { saveAdminAssetCandidate } = await load();

    await saveAdminAssetCandidate(input());

    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]).toMatchObject({
      path: expect.stringMatching(new RegExp(`^admin-assets/${assetId}/revisions/[0-9a-f-]+/new\\.png$`)),
      options: expect.objectContaining({ upsert: false }),
    });
  });

  /** 커밋 전에 지우면 RPC가 실패했을 때 되돌아갈 바이트가 없다. */
  it("재저장이 커밋된 뒤에야 이전 revision을 지운다", async () => {
    const { saveAdminAssetCandidate } = await load();

    await saveAdminAssetCandidate(input());

    expect(removeCalls).toEqual([[previousPath]]);
  });

  it("새 에셋은 지울 이전 revision이 없다", async () => {
    const { saveAdminAssetCandidate } = await load();

    await saveAdminAssetCandidate(input({ id: undefined }));

    expect(uploadCalls[0].path).toBe(`admin-assets/${uploadCalls[0].path.split("/")[1]}/new.png`);
    expect(removeCalls).toHaveLength(0);
  });

  it("RPC가 실패하면 방금 올린 바이트만 치우고 이전 경로는 남긴다", async () => {
    rpcError = { message: "database unavailable" };
    const { saveAdminAssetCandidate } = await load();

    await expect(saveAdminAssetCandidate(input())).rejects.toMatchObject({ message: "database unavailable" });

    expect(removeCalls).toEqual([[uploadCalls[0].path]]);
    expect(removeCalls[0]).not.toContain(previousPath);
  });

  it("RPC가 커밋된 뒤 조회가 실패해도 새 바이트를 지우지 않는다", async () => {
    candidateError = { message: "candidate read failed" };
    const { saveAdminAssetCandidate } = await load();

    await expect(saveAdminAssetCandidate(input())).rejects.toMatchObject({ message: "candidate read failed" });

    expect(removeCalls).toEqual([]);
  });

  /**
   * 제목만 고치는 요청이 target을 지우면 적용 범위를 잃는다. RPC는 넘기지 않은 인자를
   * "그대로 둔다"로 해석하므로, 클라이언트도 없는 값을 빈 배열로 바꿔 보내면 안 된다.
   */
  it("수정에서 targets를 주지 않으면 null로 보내 target을 건드리지 않는다", async () => {
    const { updateAdminAssetCandidate } = await load();

    await updateAdminAssetCandidate(assetId, { title: "새 제목" });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("update_admin_asset_metadata");
    expect(rpcCalls[0].args).toMatchObject({
      p_asset_id: assetId,
      p_title: "새 제목",
      p_targets: null,
      p_bubble_spec: null,
      p_enabled: null,
    });
  });

  it("수정도 Storage를 건드리지 않는다", async () => {
    const { updateAdminAssetCandidate } = await load();

    await updateAdminAssetCandidate(assetId, { title: "새 제목", enabled: false });

    expect(uploadCalls).toHaveLength(0);
    expect(removeCalls).toHaveLength(0);
    expect(rpcCalls[0].args).toMatchObject({ p_enabled: false });
  });

  it("빈 제목은 RPC를 부르기 전에 거절한다", async () => {
    const { updateAdminAssetCandidate } = await load();

    await expect(updateAdminAssetCandidate(assetId, { title: "   " })).rejects.toThrow("INVALID_ASSET_TITLE");
    expect(rpcCalls).toHaveLength(0);
  });
});
