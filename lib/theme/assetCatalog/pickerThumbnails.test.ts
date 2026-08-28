import { afterEach, describe, expect, it, vi } from "vitest";

const assetId = "c822775e-d341-4fef-a6ff-812657700cca";
const key = (seed: string) => `preview/v1/asset/${seed.slice(0, 2)}/${seed.padEnd(64, seed[0])}.webp`;

async function load(r2Origin: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_R2_PREVIEW_ORIGIN", r2Origin);
  return import("@/lib/theme/assetCatalog/pickerThumbnails");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function row(variantKey: string, seed: string, overrides: Record<string, unknown> = {}) {
  return {
    logical_asset_id: `admin:${assetId}`,
    variant_key: variantKey,
    r2_previews: { picker: { objectKey: key(seed), sha256: seed.padEnd(64, seed[0]) } },
    ...overrides,
  };
}

describe("buildPickerThumbnailIndex", () => {
  it("adminAssetId와 variantKey로 색인한다", async () => {
    const { buildPickerThumbnailIndex } = await load("https://cdn.example.com");
    const index = buildPickerThumbnailIndex([row("canonical", "aa"), row("ios", "bb")]);
    expect(Object.keys(index[assetId]).sort()).toEqual(["canonical", "ios"]);
  });

  /**
   * R2 origin이 없으면 빈 색인이다. 그러면 응답에 `thumbnailUrl`이 없고 화면은 기존 `previewUrl`로
   * 그린다 — 전환 전과 완전히 같은 동작이다. 이것이 롤백 경로다.
   */
  it("R2 origin이 없으면 빈 색인을 준다", async () => {
    const { buildPickerThumbnailIndex } = await load("");
    expect(buildPickerThumbnailIndex([row("canonical", "aa")])).toEqual({});
  });

  it("tpl 행과 picker 키 없는 행은 건너뛴다", async () => {
    const { buildPickerThumbnailIndex } = await load("https://cdn.example.com");
    expect(buildPickerThumbnailIndex([
      { ...row("canonical", "aa"), logical_asset_id: "tpl:x" },
      row("canonical", "aa", { r2_previews: { card: { objectKey: key("cc") } } }),
      row("canonical", "aa", { r2_previews: null }),
    ])).toEqual({});
  });

  it("깨진 행에 예외를 던지지 않는다", async () => {
    const { buildPickerThumbnailIndex } = await load("https://cdn.example.com");
    expect(buildPickerThumbnailIndex([
      { logical_asset_id: null, variant_key: "canonical" },
      row("canonical", "aa", { r2_previews: { picker: { objectKey: 123 } } }),
      row("canonical", "aa", { variant_key: null }),
      {},
    ])).toEqual({});
  });
});

describe("filterPickerThumbnailRowsForCurrentAssets", () => {
  it("현재 canonical/variant pointer와 일치하는 registry row만 남긴다", async () => {
    const { filterPickerThumbnailRowsForCurrentAssets } = await load("https://cdn.example.com");
    const rows = [
      row("canonical", "aa", { id: "current-canonical" }),
      row("android", "bb", { id: "current-android" }),
      row("canonical", "cc", { id: "stale" }),
    ];

    expect(filterPickerThumbnailRowsForCurrentAssets(rows, [{
      id: assetId,
      assetObjectId: "current-canonical",
      variants: [{ assetObjectId: "current-android" }],
    }])).toEqual(rows.slice(0, 2));
  });

  it("현재 pointer가 없으면 예전 active row도 남기지 않는다", async () => {
    const { filterPickerThumbnailRowsForCurrentAssets } = await load("https://cdn.example.com");
    expect(filterPickerThumbnailRowsForCurrentAssets([row("canonical", "aa", { id: "old" })], [{ id: assetId }])).toEqual([]);
  });
});

describe("selectPickerThumbnailUrl", () => {
  it("플랫폼 variant 썸네일을 우선한다", async () => {
    const { buildPickerThumbnailIndex, selectPickerThumbnailUrl } = await load("https://cdn.example.com");
    const index = buildPickerThumbnailIndex([row("canonical", "aa"), row("ios", "bb")]);

    expect(selectPickerThumbnailUrl({ index, adminAssetId: assetId, platform: "ios", usesPlatformVariant: true }))
      .toBe(`https://cdn.example.com/${key("bb")}`);
  });

  it("플랫폼 원본을 쓰지 않으면 canonical을 쓴다", async () => {
    const { buildPickerThumbnailIndex, selectPickerThumbnailUrl } = await load("https://cdn.example.com");
    const index = buildPickerThumbnailIndex([row("canonical", "aa")]);

    expect(selectPickerThumbnailUrl({ index, adminAssetId: assetId, platform: "ios", usesPlatformVariant: false }))
      .toBe(`https://cdn.example.com/${key("aa")}`);
  });

  /**
   * 이 조합이 버그의 핵심이었다. Android가 canonical인 에셋을 iOS에서 조회하면 원본은 iOS variant로
   * 바뀌는데 썸네일은 canonical(Android)이라, 화면에는 Android 그림이 보이고 선택 결과는 iOS 그림이
   * 된다. 틀린 그림을 보여 주느니 썸네일을 포기하고 원본을 받는 편이 낫다.
   */
  it("플랫폼 원본을 쓰는데 그 variant 썸네일이 없으면 canonical로 대체하지 않는다", async () => {
    const { buildPickerThumbnailIndex, selectPickerThumbnailUrl } = await load("https://cdn.example.com");
    const index = buildPickerThumbnailIndex([row("canonical", "aa")]);

    expect(selectPickerThumbnailUrl({ index, adminAssetId: assetId, platform: "ios", usesPlatformVariant: true }))
      .toBeUndefined();
  });

  it("색인에 없는 에셋은 undefined다", async () => {
    const { selectPickerThumbnailUrl } = await load("https://cdn.example.com");
    expect(selectPickerThumbnailUrl({ index: {}, adminAssetId: assetId, platform: "android", usesPlatformVariant: false }))
      .toBeUndefined();
  });
});
