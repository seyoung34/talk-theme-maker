import { describe, expect, it, vi } from "vitest";

/**
 * 카드 썸네일의 공개 URL 생성.
 *
 * 갤러리는 마운트 시 받은 URL을 계속 들고 있으므로, 만료되는 주소를 쓰면 탭을 오래 열어 둔
 * 사용자에게 썸네일이 전부 깨진다. 공개 버킷 주소는 서명이 없어 만료되지 않는다.
 */
describe("getPublicThemeAssetUrl", () => {
  async function load(url: string | undefined) {
    vi.resetModules();
    vi.doMock("@/lib/supabase/config", () => ({ supabaseUrl: url }));
    return (await import("@/lib/theme/remoteAssets")).getPublicThemeAssetUrl;
  }

  it("공개 버킷의 영구 주소를 만든다", async () => {
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl("system-templates/abc/preview/card.webp")).toBe(
      "https://example.supabase.co/storage/v1/object/public/theme-public/system-templates/abc/preview/card.webp",
    );
  });

  it("토큰이 붙지 않는다", async () => {
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl("system-templates/abc/preview/card.webp")).not.toContain("token=");
  });

  it("경로 구분자는 유지하고 각 조각만 인코딩한다", async () => {
    // 슬래시까지 인코딩하면 스토리지가 경로로 인식하지 못한다.
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl("system-templates/한글 이름/card.webp")).toBe(
      "https://example.supabase.co/storage/v1/object/public/theme-public/system-templates/%ED%95%9C%EA%B8%80%20%EC%9D%B4%EB%A6%84/card.webp",
    );
  });

  it("경로가 없으면 undefined", async () => {
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl(undefined)).toBeUndefined();
    expect(getPublicThemeAssetUrl("")).toBeUndefined();
  });

  it("Supabase 주소가 없는 환경에서는 undefined", async () => {
    // e2e 빌드처럼 Supabase 를 끈 환경. 호출부가 색상만으로 카드를 그린다.
    const getPublicThemeAssetUrl = await load(undefined);
    expect(getPublicThemeAssetUrl("system-templates/abc/preview/card.webp")).toBeUndefined();
  });
});
