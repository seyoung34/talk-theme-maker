import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

/**
 * 미들웨어가 도는 경로.
 *
 * `updateSession()`은 요청마다 `supabase.auth.getClaims()`를 부른다. 자기 자신이 다시
 * `getUser()`로 인증하는 라우트에서는 같은 검증이 두 번 도는 셈이고, Cloudflare Workers Free는
 * 요청당 CPU 10ms라 그 중복이 그대로 Error 1102로 이어졌다. 제외 목록은 "핸들러가 스스로
 * 인증하는 경로"만 담아야 하므로, 비슷한 이름의 다른 경로가 딸려 나가지 않는지 함께 고정한다.
 */
describe("middleware matcher", () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`);
  const runsMiddleware = (pathname: string) => pattern.test(pathname);

  it.each([
    "/api/session",
    "/api/theme-assets/signed-url",
    "/api/theme-assets/signed-urls",
  ])("자체 인증하는 %s는 제외한다", (pathname) => {
    expect(runsMiddleware(pathname)).toBe(false);
  });

  it.each([
    "/api/sessions",
    "/api/session/refresh",
    "/api/theme-assets/signed-urls-legacy",
    "/api/theme-assets/upload",
    "/api/credits",
    "/admin",
    "/edit",
    "/",
  ])("이름이 비슷하기만 한 %s는 계속 통과시킨다", (pathname) => {
    expect(runsMiddleware(pathname)).toBe(true);
  });

  it("기존 제외 경로를 유지한다", () => {
    expect(runsMiddleware("/api/export")).toBe(false);
    expect(runsMiddleware("/_next/static/chunk.js")).toBe(false);
    expect(runsMiddleware("/favicon.ico")).toBe(false);
    expect(runsMiddleware("/logo.svg")).toBe(false);
  });
});
