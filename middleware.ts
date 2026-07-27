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
  matcher: ["/((?!_next/static|_next/image|api/export|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
