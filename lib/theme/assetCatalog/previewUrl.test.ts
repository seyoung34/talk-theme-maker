import { afterEach, describe, expect, it, vi } from "vitest";

const supabaseOrigin = "https://example.supabase.co";

async function load(r2Origin: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseOrigin);
  if (r2Origin === undefined) vi.stubEnv("NEXT_PUBLIC_R2_PREVIEW_ORIGIN", "");
  else vi.stubEnv("NEXT_PUBLIC_R2_PREVIEW_ORIGIN", r2Origin);
  return import("@/lib/theme/assetCatalog/previewUrl");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const objectKey = "preview/v1/ab/" + "ab".padEnd(64, "c") + ".webp";
const legacyPath = "system-templates/abc/preview/card.webp";

describe("resolvePreviewUrl", () => {
  it("R2 origin이 있으면 R2 URL을 준다", async () => {
    const { resolvePreviewUrl } = await load("https://preview.example.com");
    expect(resolvePreviewUrl({ r2ObjectKey: objectKey, legacyStoragePath: legacyPath })).toEqual({
      url: `https://preview.example.com/${objectKey}`,
      provider: "r2",
    });
  });

  // 도메인 환경변수를 비우면 전체가 즉시 기존 경로로 되돌아간다. 이것이 롤백 수단이다.
  it("R2 origin이 없으면 기존 Supabase URL로 떨어진다", async () => {
    const { resolvePreviewUrl } = await load(undefined);
    const resolved = resolvePreviewUrl({ r2ObjectKey: objectKey, legacyStoragePath: legacyPath });
    expect(resolved?.provider).toBe("supabase");
    expect(resolved?.url).toContain(`${supabaseOrigin}/storage/v1/object/public/theme-public/`);
  });

  // 에셋 단위로 전환을 쪼갤 수 있어야 한다. 아직 R2 키가 없는 에셋은 그대로 legacy를 쓴다.
  it("R2 키가 없는 에셋은 origin이 있어도 legacy를 쓴다", async () => {
    const { resolvePreviewUrl } = await load("https://preview.example.com");
    expect(resolvePreviewUrl({ legacyStoragePath: legacyPath })?.provider).toBe("supabase");
  });

  it("둘 다 없으면 undefined다", async () => {
    const { resolvePreviewUrl } = await load("https://preview.example.com");
    expect(resolvePreviewUrl({})).toBeUndefined();
  });

  /**
   * R2 키는 content-addressed라 불변이다. `?v=`를 붙이면 CDN 캐시가 매번 갈라져
   * immutable 캐시의 의미가 사라진다(계획 §8.1).
   */
  it("R2 URL에는 cache busting을 붙이지 않는다", async () => {
    const { resolvePreviewUrl } = await load("https://preview.example.com");
    const resolved = resolvePreviewUrl({ r2ObjectKey: objectKey, legacyStoragePath: legacyPath, legacyVersion: 12345 });
    expect(resolved?.url).not.toContain("?v=");
  });

  it("legacy URL에는 버전을 붙인다", async () => {
    const { resolvePreviewUrl } = await load(undefined);
    expect(resolvePreviewUrl({ legacyStoragePath: legacyPath, legacyVersion: 12345 })?.url).toContain("?v=12345");
  });

  it("끝의 슬래시를 정리한다", async () => {
    const { resolvePreviewUrl } = await load("https://preview.example.com/");
    expect(resolvePreviewUrl({ r2ObjectKey: objectKey })?.url).toBe(`https://preview.example.com/${objectKey}`);
  });

  // 잘못된 값으로 깨진 URL을 만드느니 legacy로 떨어지는 편이 낫다.
  it("http나 경로가 섞인 origin은 무시하고 legacy로 떨어진다", async () => {
    for (const bad of ["http://preview.example.com", "preview.example.com", "https://a.com/sub"]) {
      const { resolvePreviewUrl } = await load(bad);
      expect(resolvePreviewUrl({ r2ObjectKey: objectKey, legacyStoragePath: legacyPath })?.provider).toBe("supabase");
    }
  });

  it("키 구간은 인코딩하되 슬래시는 경로로 남긴다", async () => {
    const { previewUrlOf } = await load("https://preview.example.com");
    expect(previewUrlOf({ r2ObjectKey: "preview/v1/한 글/a b.webp" }))
      .toBe("https://preview.example.com/preview/v1/%ED%95%9C%20%EA%B8%80/a%20b.webp");
  });
});
