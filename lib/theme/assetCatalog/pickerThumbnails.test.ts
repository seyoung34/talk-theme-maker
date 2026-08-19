import { afterEach, describe, expect, it, vi } from "vitest";

const key = "preview/v1/asset/ab/" + "ab".padEnd(64, "c") + ".webp";

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

function row(overrides: Record<string, unknown> = {}) {
  return {
    logical_asset_id: "admin:c822775e-d341-4fef-a6ff-812657700cca",
    variant_key: "canonical",
    r2_previews: { picker: { objectKey: key, sha256: "ab".padEnd(64, "c") } },
    ...overrides,
  };
}

describe("buildPickerThumbnailUrls", () => {
  it("admin 행의 picker 키를 URL로 바꾼다", async () => {
    const { buildPickerThumbnailUrls } = await load("https://preview.example.com");
    expect(buildPickerThumbnailUrls([row()])).toEqual({
      "c822775e-d341-4fef-a6ff-812657700cca": `https://preview.example.com/${key}`,
    });
  });

  /**
   * R2 origin이 없으면 빈 표다. 그러면 응답에 `thumbnailUrl`이 없고 화면은 기존 `previewUrl`로
   * 그린다 — 전환 전과 완전히 같은 동작이다. 이것이 롤백 경로다.
   */
  it("R2 origin이 없으면 빈 표를 준다", async () => {
    const { buildPickerThumbnailUrls } = await load("");
    expect(buildPickerThumbnailUrls([row()])).toEqual({});
  });

  // 피커는 추천 에셋만 보여 준다. 템플릿 업로드 행은 대상이 아니다.
  it("tpl 행은 건너뛴다", async () => {
    const { buildPickerThumbnailUrls } = await load("https://preview.example.com");
    expect(buildPickerThumbnailUrls([row({ logical_asset_id: "tpl:android-bubble-me-1:upload:1785660295620" })])).toEqual({});
  });

  it("canonical이 아닌 variant는 건너뛴다", async () => {
    const { buildPickerThumbnailUrls } = await load("https://preview.example.com");
    expect(buildPickerThumbnailUrls([row({ variant_key: "ios" })])).toEqual({});
  });

  // 아직 굽지 않은 에셋은 표에 없고, 호출부가 기존 previewUrl로 그린다.
  it("picker 키가 없는 행은 건너뛴다", async () => {
    const { buildPickerThumbnailUrls } = await load("https://preview.example.com");
    expect(buildPickerThumbnailUrls([row({ r2_previews: {} })])).toEqual({});
    expect(buildPickerThumbnailUrls([row({ r2_previews: null })])).toEqual({});
    expect(buildPickerThumbnailUrls([row({ r2_previews: { card: { objectKey: key } } })])).toEqual({});
  });

  it("깨진 행에 예외를 던지지 않는다", async () => {
    const { buildPickerThumbnailUrls } = await load("https://preview.example.com");
    expect(buildPickerThumbnailUrls([
      row({ logical_asset_id: null }),
      row({ r2_previews: { picker: { objectKey: 123 } } }),
      row({ r2_previews: "nope" }),
      {},
    ])).toEqual({});
  });

  it("여러 행을 한 표로 모은다", async () => {
    const { buildPickerThumbnailUrls } = await load("https://preview.example.com");
    const other = "preview/v1/asset/cd/" + "cd".padEnd(64, "e") + ".webp";
    const result = buildPickerThumbnailUrls([
      row(),
      row({ logical_asset_id: "admin:other-id", r2_previews: { picker: { objectKey: other, sha256: "cd".padEnd(64, "e") } } }),
    ]);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["other-id"]).toBe(`https://preview.example.com/${other}`);
  });
});
