/**
 * 요청에 Supabase 세션 쿠키가 있는지.
 *
 * 인증 판정이 아니라 **조회를 건너뛸지** 정하는 최적화용이다. 쿠키가 있으면 기존 경로를 그대로
 * 타므로 위조된 쿠키가 통과할 여지는 없다. 없을 때 Supabase 왕복과 DB 조회를 생략할 뿐이다.
 *
 * 판정을 `sb-` 접두사만 보고 한다. `@supabase/ssr`은 `sb-<project-ref>-auth-token`을 쓰고 값이
 * 크면 `.0`, `.1`로 쪼개는데, 정확한 이름 규칙에 맞추면 라이브러리가 그 규칙을 바꿨을 때
 * **로그인한 사용자를 비로그인으로 응답**하게 된다. 조용히 로그아웃된 것처럼 보이는 실패라
 * 알아채기 어렵다. 접두사만 보면 규칙이 바뀌어도 최악이 "최적화가 걸리지 않음"에 그친다.
 */
export function hasSupabaseAuthCookie(cookies: { name: string }[]) {
  return cookies.some((cookie) => cookie.name.startsWith("sb-"));
}
