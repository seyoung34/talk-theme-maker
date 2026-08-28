import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const assetId = "99999999-8888-4777-8666-555555555555";

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    slot_role: "main_background",
    platform: "all",
    asset_kind: "background",
    analysis: { width: 1080, height: 1920, shapes: ["portrait"] },
    bubble_adjustment: null,
    title: `배경 ${id}`,
    file_name: `${id}.png`,
    mime_type: "image/png",
    storage_path: `admin-assets/${id}/background.png`,
    asset_object_id: "registry-1",
    enabled: true,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-22T00:00:00.000Z",
    admin_asset_targets: [
      { id: `${id}-t`, asset_id: id, platform: "all", slot_role: null, target_kind: "asset_kind", priority: 0, enabled: true },
    ],
    admin_asset_variants: [],
    ...overrides,
  };
}

describe("GET /api/admin/theme-assets", () => {
  let getCurrentAdmin: ReturnType<typeof vi.fn>;
  let rangeStarts: number[];
  let signedPaths: string[][];
  let assetFilters: { column: string; value: unknown }[];
  let registryRows: unknown[];

  async function load(batches: readonly unknown[][], options: { r2Origin?: string } = {}) {
    vi.resetModules();
    rangeStarts = [];
    signedPaths = [];
    assetFilters = [];

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "admin_assets") {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn((column: string, value: unknown) => { assetFilters.push({ column, value }); return query; }),
            is: vi.fn((column: string, value: unknown) => { assetFilters.push({ column, value }); return query; }),
            order: vi.fn(() => query),
            range: vi.fn(async (start: number) => {
              rangeStarts.push(start);
              return { data: batches[rangeStarts.length - 1] ?? [], error: null };
            }),
          };
          return query;
        }
        if (table === "theme_asset_objects") {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            in: vi.fn(async () => ({ data: registryRows, error: null })),
          };
          return query;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({
          createSignedUrls: vi.fn(async (paths: string[]) => {
            signedPaths.push(paths);
            return { data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${encodeURIComponent(path)}` })), error: null };
          }),
        })),
      },
    };

    getCurrentAdmin = vi.fn(async () => ({ configured: true, user: { id: "admin" }, profile: { user_id: "admin" } }));
    vi.doMock("@/lib/supabase/auth", () => ({ getCurrentAdmin }));
    vi.doMock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn(() => admin) }));
    vi.doMock("@/lib/theme/assetCatalog/previewUrl", () => ({
      getR2PreviewOrigin: vi.fn(() => options.r2Origin),
      previewUrlOf: vi.fn(({ r2ObjectKey }: { r2ObjectKey?: string }) => (options.r2Origin && r2ObjectKey ? `${options.r2Origin}/${r2ObjectKey}` : undefined)),
    }));
    return (await import("@/app/api/admin/theme-assets/route")).GET;
  }

  function request(query: string) {
    return { nextUrl: new URL(`http://localhost/api/admin/theme-assets?${query}`) } as never;
  }

  beforeEach(() => {
    registryRows = [];
  });

  afterEach(() => {
    for (const name of ["@/lib/supabase/auth", "@/lib/supabase/server", "@/lib/theme/assetCatalog/previewUrl"]) vi.doUnmock(name);
  });

  it("관리자가 아니면 목록을 주지 않는다", async () => {
    const GET = await load([[]]);
    getCurrentAdmin.mockResolvedValueOnce({ configured: true, user: { id: "u" }, profile: null });

    const response = await GET(request("assetKind=background"));

    expect(response.status).toBe(403);
  });

  it("허용되지 않은 assetKind는 거부한다", async () => {
    const GET = await load([[]]);

    const response = await GET(request("assetKind=sticker"));

    expect(response.status).toBe(400);
    expect(rangeStarts).toEqual([]);
  });

  /**
   * 목록이 원본 경로나 서명 URL을 흘리면 서버로 옮긴 이유가 사라진다.
   * 썸네일이 있는 에셋은 원본을 서명조차 하지 않아야 한다.
   */
  it("썸네일이 있으면 원본을 서명하지 않고 Storage path도 응답에 넣지 않는다", async () => {
    registryRows = [{ id: "registry-1", logical_asset_id: `admin:${assetId}`, variant_key: "canonical", r2_previews: { picker: { objectKey: "preview/v1/ab/hash.webp" } } }];
    const GET = await load([[row(assetId)]], { r2Origin: "https://preview.test" });

    const response = await GET(request("assetKind=background"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items[0].thumbnailUrl).toBe("https://preview.test/preview/v1/ab/hash.webp");
    expect(payload.items[0].previewUrl).toBeUndefined();
    expect(signedPaths).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("admin-assets/");
  });

  it("썸네일이 없는 에셋만 원본 signed URL로 폴백한다", async () => {
    registryRows = [{ id: "registry-1", logical_asset_id: `admin:${assetId}`, variant_key: "canonical", r2_previews: { picker: { objectKey: "preview/v1/ab/hash.webp" } } }];
    const GET = await load([[row(assetId), row("22222222-2222-4222-8222-222222222222")]], { r2Origin: "https://preview.test" });

    const response = await GET(request("assetKind=background"));
    const payload = await response.json();

    expect(signedPaths).toEqual([["admin-assets/22222222-2222-4222-8222-222222222222/background.png"]]);
    expect(payload.items.find((item: { id: string }) => item.id === assetId).previewUrl).toBeUndefined();
    expect(payload.items.find((item: { id: string }) => item.id !== assetId).previewUrl).toContain("https://signed.test/");
  });

  it("현재 catalog pointer와 다른 예전 registry 썸네일은 사용하지 않는다", async () => {
    registryRows = [{ id: "old-registry", logical_asset_id: `admin:${assetId}`, variant_key: "canonical", r2_previews: { picker: { objectKey: "preview/old.webp" } } }];
    const GET = await load([[row(assetId, { asset_object_id: "current-registry" })]], { r2Origin: "https://preview.test" });

    const response = await GET(request("assetKind=background"));
    const payload = await response.json();

    expect(payload.items[0].thumbnailUrl).toBeUndefined();
    expect(payload.items[0].previewUrl).toContain("https://signed.test/");
  });

  it("canonical이 없는 빌더 후보는 현재 Android variant 썸네일을 사용한다", async () => {
    registryRows = [{ id: "android-registry", logical_asset_id: `admin:${assetId}`, variant_key: "android", r2_previews: { picker: { objectKey: "preview/android.webp" } } }];
    const GET = await load([[
      row(assetId, {
        asset_kind: "bubble",
        asset_object_id: null,
        admin_asset_variants: [{
          id: "variant-1",
          asset_id: assetId,
          platform: "android",
          storage_path: `admin-assets/${assetId}/android.png`,
          asset_object_id: "android-registry",
          file_name: "android.png",
          mime_type: "image/png",
        }],
      }),
    ]], { r2Origin: "https://preview.test" });

    const response = await GET(request("assetKind=bubble"));
    const payload = await response.json();

    expect(payload.items[0].thumbnailUrl).toBe("https://preview.test/preview/android.webp");
    expect(payload.items[0].previewUrl).toBeUndefined();
  });

  it("R2 origin이 없으면 전부 원본으로 떨어진다", async () => {
    const GET = await load([[row(assetId)]]);

    const response = await GET(request("assetKind=background"));
    const payload = await response.json();

    expect(payload.items[0].thumbnailUrl).toBeUndefined();
    expect(payload.items[0].previewUrl).toContain("https://signed.test/");
  });

  it("한 배치를 넘는 종류도 전량을 읽는다", async () => {
    const first = Array.from({ length: 200 }, (_, index) => row(`asset-${String(index).padStart(3, "0")}`));
    const GET = await load([first, [row("tail")]]);

    const response = await GET(request("assetKind=background"));
    const payload = await response.json();

    expect(rangeStarts).toEqual([0, 200]);
    expect(payload.items).toHaveLength(201);
    expect(payload.truncated).toBe(false);
  });

  /** 잘린 목록을 성공처럼 보여 주면 운영자가 없는 에셋을 없다고 판단한다. */
  it("상한을 넘으면 잘라내고 truncated로 알린다", async () => {
    const batch = () => Array.from({ length: 200 }, (_, index) => row(`asset-${Math.random()}-${index}`));
    const GET = await load([batch(), batch(), batch(), batch()]);

    const response = await GET(request("assetKind=background"));
    const payload = await response.json();

    expect(payload.items).toHaveLength(500);
    expect(payload.truncated).toBe(true);
  });

  it("501~599개인 종류도 500개로 자르고 truncated로 알린다", async () => {
    const batch = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => row(`${prefix}-${index}`));
    const GET = await load([batch(200, "first"), batch(200, "second"), batch(101, "third")]);

    const response = await GET(request("assetKind=background"));
    const payload = await response.json();

    expect(payload.items).toHaveLength(500);
    expect(payload.truncated).toBe(true);
    expect(rangeStarts).toEqual([0, 200, 400]);
  });

  it("기존 enabled 값과 무관하게 등록된 후보를 모두 읽는다", async () => {
    const GET = await load([[row(assetId, { enabled: false })]]);
    await GET(request("assetKind=background"));

    expect(assetFilters).not.toContainEqual({ column: "enabled", value: true });
  });

  it("말풍선 spec이 있으면 조정값 배지를 유지한다", async () => {
    const GET = await load([[
      row(assetId, {
        asset_kind: "bubble",
        admin_asset_bubble_specs: [{
          asset_id: assetId,
          android_markers: { top: { start: 1, end: 2 }, left: { start: 1, end: 2 }, right: { start: 4, end: 5 }, bottom: { start: 4, end: 5 } },
          ios_insets: { top: 1, right: 1, bottom: 1, left: 1 },
          ios_stretch: { x: 2, y: 2 },
          geometry: null,
        }],
      }),
    ]]);

    const response = await GET(request("assetKind=bubble"));
    const payload = await response.json();

    expect(payload.items[0].hasBubbleAdjustment).toBe(true);
  });

  it("legacy는 asset_kind가 비어 있는 행을 찾는다", async () => {
    const GET = await load([[]]);

    const response = await GET(request("assetKind=legacy"));

    expect(response.status).toBe(200);
    expect(assetFilters).toContainEqual({ column: "asset_kind", value: null });
  });

  it("관리자 목록은 어떤 캐시에도 남기지 않는다", async () => {
    const GET = await load([[row(assetId)]]);

    const response = await GET(request("assetKind=background"));

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
