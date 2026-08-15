import { describe, expect, it } from "vitest";
import { maxSignedUrlPaths, themeAssetCacheControl, themeAssetSignedUrlTtlSeconds } from "@/lib/theme/themeAssetSigning";

const hour = 60 * 60;
const day = 24 * hour;

/**
 * 서명 URL 수명과 캐시 수명의 관계.
 *
 * 이 둘이 어긋나면 최적화가 조용히 무효가 된다. 서명 수명이 짧으면 URL이 바뀌어 브라우저 캐시가
 * 무효화되고, `Cache-Control`이 서명 수명보다 짧으면 URL은 그대로인데 바이트를 버려 다시 받는다.
 * 값 자체보다 **둘의 관계**를 고정한다.
 */
describe("theme asset signing 상수", () => {
  it("서명 수명이 한 세션을 훌쩍 넘긴다", () => {
    // 예전 값(10분)에서는 사용자가 다시 방문할 때마다 전부 다시 받았다.
    expect(themeAssetSignedUrlTtlSeconds).toBeGreaterThanOrEqual(day);
  });

  it("Cache-Control이 서명 수명보다 짧지 않다", () => {
    // 짧으면 URL이 아직 유효한데도 브라우저가 바이트를 버려 다시 받는다.
    expect(Number(themeAssetCacheControl)).toBeGreaterThanOrEqual(themeAssetSignedUrlTtlSeconds);
  });

  it("Cache-Control은 Supabase가 받는 초 단위 문자열이다", () => {
    expect(themeAssetCacheControl).toMatch(/^\d+$/);
  });

  it("배치 상한은 서버 라우트와 같다", () => {
    // `normalizeThemeAssetStoragePaths`의 기본 limit과 어긋나면 배치가 400으로 떨어진다.
    expect(maxSignedUrlPaths).toBe(50);
  });
});
