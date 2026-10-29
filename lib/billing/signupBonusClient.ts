import type { SignupBonusClaimResponse } from "@/lib/billing/apiTypes";
import { readJsonResponse } from "@/lib/shared/api/http";

export const expectedUserIdHeader = "x-expected-user-id";

export class SignupBonusSessionChangedError extends Error {
  constructor() {
    super("로그인한 계정이 바뀌어 가입 혜택을 처리하지 않았습니다.");
    this.name = "SignupBonusSessionChangedError";
  }
}

/** expectedUserId를 주면 서버가 현재 세션 사용자와 다를 때 지급하지 않고 409로 거절한다. */
export async function claimSignupBonusFromClient(expectedUserId?: string): Promise<SignupBonusClaimResponse | null> {
  const response = await fetch("/api/credits/signup-bonus", {
    method: "POST",
    cache: "no-store",
    headers: expectedUserId ? { [expectedUserIdHeader]: expectedUserId } : undefined,
  });
  if (response.status === 401) return null;
  if (response.status === 409) throw new SignupBonusSessionChangedError();

  const payload = await readJsonResponse<SignupBonusClaimResponse>(response);
  if (!response.ok) throw new Error(payload.error ?? "가입 혜택을 확인하지 못했습니다.");
  return payload;
}
