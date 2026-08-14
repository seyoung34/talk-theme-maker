import { describe, expect, it } from "vitest";
import { hasSupabaseAuthCookie } from "@/lib/supabase/authCookie";

const named = (...names: string[]) => names.map((name) => ({ name }));

/**
 * `/api/session`의 조기 반환 판정.
 *
 * 이 판정이 잘못 "없음"으로 기울면 로그인한 사용자가 비로그인으로 응답받는다. 헤더가 로그아웃
 * 상태로 보이는, 알아채기 어려운 실패다. 그래서 쿠키 이름이 어떤 형태로 오든 세션이 있는 쪽으로
 * 판단하는지를 고정한다.
 */
describe("hasSupabaseAuthCookie", () => {
  it("표준 세션 쿠키를 찾는다", () => {
    expect(hasSupabaseAuthCookie(named("sb-abcdefgh-auth-token"))).toBe(true);
  });

  it("값이 커서 쪼개진 쿠키도 찾는다", () => {
    // 세션이 크면 @supabase/ssr이 `.0`, `.1`로 나눠 담는다. 조각만 있어도 세션이 있는 것이다.
    expect(hasSupabaseAuthCookie(named("sb-abcdefgh-auth-token.0", "sb-abcdefgh-auth-token.1"))).toBe(true);
  });

  it("이름 규칙이 바뀌어도 sb- 접두사만 있으면 세션이 있는 쪽으로 본다", () => {
    // 정확한 규칙에 맞추면 라이브러리가 규칙을 바꿨을 때 조용히 로그아웃된 것처럼 보인다.
    // 최악이 "최적화가 걸리지 않음"에 그치도록 느슨하게 둔다.
    expect(hasSupabaseAuthCookie(named("sb-abcdefgh-session"))).toBe(true);
    expect(hasSupabaseAuthCookie(named("sb-abcdefgh-auth-token-code-verifier"))).toBe(true);
  });

  it("다른 쿠키에 섞여 있어도 찾는다", () => {
    expect(hasSupabaseAuthCookie(named("_ga", "consent", "sb-abcdefgh-auth-token"))).toBe(true);
  });

  it("쿠키가 없으면 없다", () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
  });

  it("Supabase와 무관한 쿠키만 있으면 없다", () => {
    expect(hasSupabaseAuthCookie(named("_ga", "consent", "kakaotalk-theme-maker:hint"))).toBe(false);
  });

  it("이름 가운데에 sb-가 들어간 쿠키에 속지 않는다", () => {
    expect(hasSupabaseAuthCookie(named("my-sb-auth-token"))).toBe(false);
  });
});
