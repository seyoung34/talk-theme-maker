import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /*
   * 제외 목록이 아니라 포함 목록이다.
   *
   * `updateSession()`이 존재하는 이유는 하나다 — 서버 컴포넌트는 쿠키를 쓸 수 없어서
   * (`lib/supabase/server.ts`의 `setAll` catch) 세션 갱신을 대신 해 줘야 한다. 그런데 서버에서
   * 세션을 읽는 페이지는 `requireAdmin()`을 거치는 `/admin/*` 7개뿐이다. 나머지 페이지는 세션
   * 없이 렌더되고 로그인 표시는 `SiteHeader`가 `/api/session`으로 채운다. Route Handler는 쿠키를
   * 직접 쓸 수 있으므로 API 경로도 미들웨어가 필요 없다.
   *
   * 그런데도 거의 모든 요청에서 `auth.getClaims()`가 돌고 있었다. Cloudflare Workers Free는
   * 요청당 CPU 10ms라 이 상시 비용이 그대로 한도를 밀어 올린다(Error 1102).
   *
   * 세션 갱신 책임은 `/api/session`(전 페이지 공통 `SiteHeader`가 마운트마다 호출)과 각 API
   * 라우트, 그리고 브라우저 Supabase 클라이언트의 자동 갱신이 나눠 맡는다.
   */
  matcher: ["/admin/:path*"],
};
