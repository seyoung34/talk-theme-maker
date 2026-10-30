import { isAuthApiError, isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { recordCurrentPolicyConsents } from "@/lib/policies/consent";

export const signupConsentExpectedUserHeader = "x-expected-user-id";

export type SignupConsentResult = { status: "recorded" } | { status: "unauthenticated" } | { status: "session_changed" };

/**
 * 이메일 가입 직후 동의 기록을 가입 계정에만 남긴다.
 * 같은 supabase 클라이언트(= 요청 시점 쿠키의 JWT 하나)로 getUser 검증과 쓰기를 모두 하므로,
 * 검증한 사용자와 user_id 기본값(auth.uid())이 가리키는 사용자가 다른 계정일 수 없다.
 * expectedUserId는 신뢰하지 않고 서버가 확인한 사용자와 비교만 한다. 동의 출처는 서버가 고정한다.
 */
export async function recordEmailSignupConsentForUser(supabase: SupabaseClient, expectedUserId: string): Promise<SignupConsentResult> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // 세션 없음/무효 토큰만 인증 실패다. 네트워크·서비스 일시 오류는 던져 500으로 보내야 일회용 OTP 이후에도 재시도할 수 있다.
    if (isAuthSessionMissingError(error) || (isAuthApiError(error) && (error.status === 401 || error.status === 403))) return { status: "unauthenticated" };
    throw error;
  }
  if (!data.user) return { status: "unauthenticated" };
  if (data.user.id !== expectedUserId) return { status: "session_changed" };
  await recordCurrentPolicyConsents(supabase, "email_signup");
  return { status: "recorded" };
}
