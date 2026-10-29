import { signupConsentExpectedUserHeader } from "@/lib/policies/signupConsentServer";

export class SignupConsentSessionChangedError extends Error {
  constructor() {
    super("로그인한 계정이 바뀌어 동의 기록을 저장하지 않았습니다.");
    this.name = "SignupConsentSessionChangedError";
  }
}

/** 서버가 현재 세션 사용자를 확인해 expectedUserId와 같을 때만 동의를 기록한다. 다르면 SignupConsentSessionChangedError. */
export async function recordSignupConsentFromClient(expectedUserId: string) {
  const response = await fetch("/api/auth/signup-consent", {
    method: "POST",
    cache: "no-store",
    headers: { [signupConsentExpectedUserHeader]: expectedUserId },
  });
  if (response.status === 409 || response.status === 401) throw new SignupConsentSessionChangedError();
  if (!response.ok) throw new Error("consent_record_failed");
}
