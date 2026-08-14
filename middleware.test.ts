import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

/**
 * 미들웨어가 도는 경로.
 *
 * `updateSession()`은 요청마다 `supabase.auth.getClaims()`를 부른다. Cloudflare Workers Free는
 * 요청당 CPU 10ms라, 필요 없는 경로에서 도는 것만으로 한도를 밀어 올린다(Error 1102).
 *
 * 이 장치가 필요한 곳은 **서버 컴포넌트가 세션을 읽는 페이지**뿐이다. 서버 컴포넌트는 쿠키를
 * 쓸 수 없어(`lib/supabase/server.ts`의 `setAll` catch) 세션 갱신을 미들웨어에 맡겨야 한다.
 * Route Handler는 쿠키를 직접 쓰므로 해당하지 않는다.
 */

/**
 * Next는 matcher를 path-to-regexp로 컴파일한다. 그 결과는 빌드 산출물
 * `.next/server/middleware-manifest.json`에 남고 그것이 실제 동작의 근거다. 여기서는 이 프로젝트가
 * 쓰는 형태(`/prefix/:path*`)만 같은 의미로 옮겨 검사한다.
 *
 * 다른 형태를 넣으면 이 변환이 감당하지 못하므로 그 자리에서 던진다. 조용히 통과해서 "테스트는
 * 도는데 실제 matcher는 딴 것"이 되는 상황을 막는다.
 */
function toPattern(matcher: string) {
  const suffix = "/:path*";
  if (!matcher.endsWith(suffix)) {
    throw new Error(`지원하지 않는 matcher 형태입니다: ${matcher}. 이 테스트의 변환을 함께 갱신하세요.`);
  }
  const prefix = matcher.slice(0, -suffix.length).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${prefix}(?:/.*)?$`);
}

const patterns = config.matcher.map(toPattern);
const runsMiddleware = (pathname: string) => patterns.some((pattern) => pattern.test(pathname));

describe("middleware matcher", () => {
  it.each([
    "/admin",
    "/admin/edit",
    "/admin/assets",
    "/admin/inquiries",
    "/admin/marketing",
    "/admin/notices",
    "/admin/promotions",
  ])("서버에서 세션을 읽는 %s는 통과시킨다", (pathname) => {
    expect(runsMiddleware(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/template",
    "/edit",
    "/login",
    "/guide",
    "/credits",
    "/account",
    "/api/session",
    "/api/theme-assets/signed-urls",
    "/api/export",
    "/_next/static/chunk.js",
    "/favicon.ico",
  ])("세션이 필요 없는 %s는 돌지 않는다", (pathname) => {
    expect(runsMiddleware(pathname)).toBe(false);
  });

  it("이름이 겹치기만 하는 경로를 끌어들이지 않는다", () => {
    // `/admin` 접두사가 경계 없이 붙으면 `/administrator` 같은 경로까지 딸려 들어온다.
    expect(runsMiddleware("/administrator")).toBe(false);
    expect(runsMiddleware("/adminx")).toBe(false);
  });
});

/**
 * matcher와 실제 코드가 어긋나지 않게 하는 회귀 가드.
 *
 * 누군가 `/account` 같은 페이지에 `requireAdmin()`을 붙이면 그 페이지는 세션을 서버에서 읽는데
 * 미들웨어는 돌지 않는다. 토큰이 만료되면 조용히 로그아웃된 것처럼 보이고, 원인을 middleware.ts
 * 에서 찾기 어렵다. 그래서 "세션을 읽는 페이지 목록"을 코드에서 직접 뽑아 대조한다.
 */
describe("서버 세션을 읽는 페이지는 모두 matcher 안에 있다", () => {
  const appDir = path.resolve(import.meta.dirname, "app");
  const serverSessionImports = ["requireAdmin", "getCurrentAdmin", "@/lib/supabase/server", "@/lib/supabase/auth"];

  function collectPageRoutes(dir: string, segments: string[] = []): { route: string; file: string }[] {
    const found: { route: string; file: string }[] = [];
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) {
        // 라우트 그룹 `(name)`은 URL에 나타나지 않는다. 동적 세그먼트는 임의 값으로 채운다.
        const segment = item.name.startsWith("(") ? null : item.name.replace(/^\[+|\]+$/g, "");
        found.push(...collectPageRoutes(path.join(dir, item.name), segment ? [...segments, segment] : segments));
        continue;
      }
      if (item.name === "page.tsx") found.push({ route: `/${segments.join("/")}`, file: path.join(dir, item.name) });
    }
    return found;
  }

  const sessionPages = collectPageRoutes(appDir).filter(({ file }) => {
    const source = readFileSync(file, "utf8");
    return serverSessionImports.some((token) => source.includes(token));
  });

  it("찾아낸 페이지가 하나 이상이다", () => {
    // 탐색이 조용히 실패하면 아래 검사가 공회전한다.
    expect(sessionPages.length).toBeGreaterThan(0);
  });

  it("전부 미들웨어를 통과한다", () => {
    const uncovered = sessionPages.filter(({ route }) => !runsMiddleware(route)).map(({ route }) => route);
    expect(uncovered).toEqual([]);
  });
});
