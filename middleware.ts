import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/export 제외: 내보내기 요청은 최대 50MB 멀티파트라 미들웨어를 통과시키면
  // 본문이 그대로 미들웨어 계층을 거친다. 상태 폴링도 이 경로를 자주 두드린다.
  // 이 라우트 핸들러들은 각자 인증을 확인하고, Route Handler의 Supabase 클라이언트는
  // 갱신된 세션 쿠키를 직접 쓸 수 있으므로 미들웨어의 세션 갱신에 의존하지 않는다.
  //
  // api/session, api/theme-assets/signed-url(s)도 같은 이유로 제외한다. 셋 다 핸들러에서
  // 다시 getUser()와 관리자/공개 여부를 확인하므로, 미들웨어의 getClaims()는 같은 검증을
  // 한 번 더 하는 순수 중복이다. Cloudflare Workers Free는 요청당 CPU 10ms라 이 중복이
  // 그대로 한도를 밀어 올린다(Error 1102). 뒤에 문자가 더 붙은 경로(api/sessions 등)까지
  // 딸려 나가지 않도록 세 경로는 `$`로 끝을 고정한다.
  matcher: [
    "/((?!_next/static|_next/image|api/export|api/session$|api/theme-assets/signed-url$|api/theme-assets/signed-urls$|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
