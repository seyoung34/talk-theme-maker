import type { SignupBonusClaimResponse } from "@/lib/billing/apiTypes";
import { readJsonResponse } from "@/lib/shared/api/http";

export const expectedUserIdHeader = "x-expected-user-id";

export class SignupBonusSessionChangedError extends Error {
  constructor() {
    super("로그인한 계정이 바뀌어 가입 혜택을 처리하지 않았습니다.");
    this.name = "SignupBonusSessionChangedError";
  }
}

export class SignupBonusAuthUnavailableError extends Error {
  constructor() {
    super("로그인 상태를 확인하지 못해 가입 혜택을 처리하지 않았습니다.");
    this.name = "SignupBonusAuthUnavailableError";
  }
}

/**
 * 서버가 일시적인 인증 오류(503 auth_unavailable)를 알리면 expectedUserId가 있을 때 SignupBonusAuthUnavailableError로 던져
 * 호출자가 가입 복구 상태를 지우지 않고 재시도하게 한다. 기존 호출자는 일반 오류 처리를 유지한다.
 *
 * expectedUserId를 주면 서버가 현재 세션 사용자와 다를 때 지급하지 않고 409로 거절한다.
 * 이때 401(세션 만료·로그아웃)도 가입 완료로 볼 수 없으므로 SignupBonusSessionChangedError로 던진다.
 * expectedUserId가 없는 기존 호출자는 401이면 null(조용히 건너뜀)을 유지한다.
 */
export async function claimSignupBonusFromClient(expectedUserId?: string): Promise<SignupBonusClaimResponse | null> {
  const response = await fetch("/api/credits/signup-bonus", {
    method: "POST",
    cache: "no-store",
    headers: expectedUserId ? { [expectedUserIdHeader]: expectedUserId } : undefined,
  });
  if (response.status === 401) {
    if (expectedUserId) throw new SignupBonusSessionChangedError();
    return null;
  }
  if (response.status === 409) throw new SignupBonusSessionChangedError();
  if (response.status === 503 && expectedUserId) throw new SignupBonusAuthUnavailableError();

  const payload = await readJsonResponse<SignupBonusClaimResponse>(response);
  if (!response.ok) throw new Error(payload.error ?? "가입 혜택을 확인하지 못했습니다.");
  return payload;
}
