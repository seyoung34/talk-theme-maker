import { isAuthApiError, isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { currentPolicyVersions, minimumAgeConfirmationVersion, recordCurrentPolicyConsents } from "@/lib/policies/consent";

export const signupConsentExpectedUserHeader = "x-expected-user-id";

/** 사용자가 화면에서 보고 명시적으로 동의한 정책·연령 확인 버전. 서버는 이 값이 현재 버전과 같을 때만 기록한다. */
export type SignupConsentAcceptance = { termsVersion: string; privacyVersion: string; minimumAgeVersion: string };

export function currentSignupConsentAcceptance(): SignupConsentAcceptance {
  return { termsVersion: currentPolicyVersions.terms, privacyVersion: currentPolicyVersions.privacy, minimumAgeVersion: minimumAgeConfirmationVersion };
}

/** malformed: 본문 형식 오류, version_mismatch: 화면에 보인 버전이 서버의 현재 버전과 다름(정책 개정 등). */
export function checkSignupConsentAcceptance(body: unknown): "ok" | "malformed" | "version_mismatch" {
  if (!body || typeof body !== "object") return "malformed";
  const { termsVersion, privacyVersion, minimumAgeVersion } = body as Record<string, unknown>;
  if (typeof termsVersion !== "string" || typeof privacyVersion !== "string" || typeof minimumAgeVersion !== "string") return "malformed";
  const current = currentSignupConsentAcceptance();
  return termsVersion === current.termsVersion && privacyVersion === current.privacyVersion && minimumAgeVersion === current.minimumAgeVersion ? "ok" : "version_mismatch";
}

export type SignupConsentResult = { status: "recorded" } | { status: "unauthenticated" } | { status: "session_changed" };

/**
 * 이메일 가입 직후 동의 기록을 가입 계정에만 남긴다.
 * 같은 supabase 클라이언트(= 요청 시점 쿠키의 JWT 하나)로 getUser 검증과 쓰기를 모두 하므로,
 * 검증한 사용자와 user_id 기본값(auth.uid())이 가리키는 사용자가 다른 계정일 수 없다.
 * 호출자는 사용자의 명시적 동의(버전 포함)를 먼저 검증해야 한다. 브라우저 표식은 동의의 증거가 아니며 여기까지 전달되지 않는다.
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
