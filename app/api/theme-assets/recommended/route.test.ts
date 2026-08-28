import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TargetInput = {
  readonly targetKind: "exact_role" | "asset_kind";
  readonly slotRole?: string;
  readonly priority: number;
};

const exactAssetId = "99999999-8888-4777-8666-555555555555";
const duplicateAssetId = "88888888-7777-4666-8555-444444444444";

function target(assetId: string, input: TargetInput) {
  return {
    id: `${assetId}-${input.targetKind}-${input.priority}`,
    asset_id: assetId,
    platform: "android",
    slot_role: input.slotRole ?? null,
    target_kind: input.targetKind,
    priority: input.priority,
    enabled: true,
  };
}

function sourceRow(id: string, targets: readonly TargetInput[]) {
  return {
    id,
    slot_role: "main_background",
    platform: "android",
    asset_kind: "background",
    analysis: null,
    bubble_adjustment: null,
    title: id,
    note: null,
    tags: [],
    file_name: `${id}.png`,
    mime_type: "image/png",
    storage_path: `admin-assets/${id}/background.png`,
    asset_object_id: null,
    enabled: true,
    created_at: "2026-08-22T00:00:00.000Z",
    updated_at: "2026-08-22T00:00:00.000Z",
    admin_asset_targets: targets.map((item) => target(id, item)),
    admin_asset_bubble_specs: [],
    admin_asset_variants: [],
  };
}

describe("GET /api/theme-assets/recommended", () => {
  let createAdminClient: ReturnType<typeof vi.fn>;
  let createRegistryStore: ReturnType<typeof vi.fn>;
  let findActiveByKeys: ReturnType<typeof vi.fn>;
  let rangeStarts: number[];
  let signedPaths: string[][];

  async function load(rows: readonly unknown[][]) {
    vi.resetModules();
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "admin_assets") {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn(async (start: number) => {
              rangeStarts.push(start);
              return { data: rows[rangeStarts.length - 1] ?? [], error: null };
            }),
          };
          return query;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({
          createSignedUrls: vi.fn(async (paths: string[]) => {
            signedPaths.push(paths);
            return {
              data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${encodeURIComponent(path)}` })),
              error: null,
            };
          }),
        })),
      },
    };
    createAdminClient = vi.fn(() => admin);
    findActiveByKeys = vi.fn(async () => []);
    createRegistryStore = vi.fn(() => ({ findActiveByKeys }));
    vi.doMock("@/lib/supabase/server", () => ({ createAdminClient }));
    vi.doMock("@/lib/theme/assetCatalog/registryStore", () => ({ createRegistryStore }));
    vi.doMock("@/lib/theme/assetCatalog/previewUrl", () => ({ getR2PreviewOrigin: vi.fn(() => undefined) }));
    vi.doMock("@/lib/theme/assetCatalog/exportGate", () => ({
      isCatalogExportAssetAllowed: vi.fn(() => true),
      warnOnCatalogExportScopeDrift: vi.fn(),
    }));
    return (await import("@/app/api/theme-assets/recommended/route")).GET;
  }

  beforeEach(() => {
    rangeStarts = [];
    signedPaths = [];
  });

  afterEach(() => {
    for (const moduleName of [
      "@/lib/supabase/server",
      "@/lib/theme/assetCatalog/registryStore",
      "@/lib/theme/assetCatalog/previewUrl",
      "@/lib/theme/assetCatalog/exportGate",
    ]) vi.doUnmock(moduleName);
  });

  it("200개를 넘는 source를 모두 읽고 전역 rank와 중복 제거 후 페이지를 자른다", async () => {
    const firstBatch = Array.from({ length: 200 }, (_, index) => {
      if (index === 0) {
        return sourceRow(duplicateAssetId, [
          { targetKind: "asset_kind", priority: 9 },
          { targetKind: "exact_role", slotRole: "main_background", priority: 9 },
        ]);
      }
      return sourceRow(`asset-${String(index).padStart(3, "0")}`, [{ targetKind: "asset_kind", priority: 0 }]);
    });
    const secondBatch = [
      sourceRow(exactAssetId, [{ targetKind: "exact_role", slotRole: "main_background", priority: 10 }]),
      sourceRow("tail-asset", [{ targetKind: "asset_kind", priority: 0 }]),
    ];
    const GET = await load([firstBatch, secondBatch]);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=main_background&limit=50"),
    } as never);
    const payload = await response.json();
    const ids = payload.items.map((item: { id: string }) => item.id);

    expect(response.status).toBe(200);
    expect(rangeStarts).toEqual([0, 200]);
    expect(ids[0]).toBe(exactAssetId);
    expect(ids.filter((id: string) => id === duplicateAssetId)).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(payload.items[0]).toMatchObject({ matchRank: 0, target: { priority: 10 } });
    expect(payload.nextCursor).toEqual(expect.any(String));
    expect(signedPaths).toHaveLength(1);
    expect(findActiveByKeys).toHaveBeenCalledTimes(1);
  });

  it("호환되지 않는 exact_role target은 그 슬롯에서 제외한다", async () => {
    const GET = await load([[
      sourceRow("kind-target", [{ targetKind: "asset_kind", priority: 0 }]),
      sourceRow("other-exact", [{ targetKind: "exact_role", slotRole: "passcode_background", priority: 10 }]),
    ]]);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=main_background"),
    } as never);
    const payload = await response.json();

    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(["kind-target"]);
  });

  it("slotRole이 없으면 exact_role target은 빼고 kind 전체 후보만 내려준다", async () => {
    const GET = await load([[
      sourceRow("kind-target", [{ targetKind: "asset_kind", priority: 0 }]),
      sourceRow(exactAssetId, [{ targetKind: "exact_role", slotRole: "main_background", priority: 10 }]),
    ]]);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=background"),
    } as never);
    const payload = await response.json();

    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(["kind-target"]);
  });

  it("잘못된 platform과 assetKind는 DB 조회 전에 거부한다", async () => {
    const GET = await load([[]]);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=windows&assetKind=background"),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Valid platform and assetKind are required." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
