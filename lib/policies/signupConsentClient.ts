import { currentSignupConsentAcceptance, signupConsentExpectedUserHeader } from "@/lib/policies/signupConsentServer";

export class SignupConsentSessionChangedError extends Error {
  constructor() {
    super("로그인한 계정이 바뀌어 동의 기록을 저장하지 않았습니다.");
    this.name = "SignupConsentSessionChangedError";
  }
}

/** 서버가 현재 세션 사용자를 확인해 expectedUserId와 같을 때만 동의를 기록한다. 다르면 SignupConsentSessionChangedError. */
export class SignupConsentVersionChangedError extends Error {
  constructor() {
    super("정책이 갱신되어 동의 기록을 저장하지 않았습니다.");
    this.name = "SignupConsentVersionChangedError";
  }
}

/** 사용자가 화면에서 체크한 현재 버전(약관·개인정보·만 14세)을 본문으로 보낸다. 호출 전에 체크 여부를 확인해야 한다. */
export async function recordSignupConsentFromClient(expectedUserId: string) {
  const response = await fetch("/api/auth/signup-consent", {
    method: "POST",
    cache: "no-store",
    headers: { [signupConsentExpectedUserHeader]: expectedUserId, "Content-Type": "application/json" },
    body: JSON.stringify(currentSignupConsentAcceptance()),
  });
  if (response.status === 409 && (await response.clone().json().catch(() => null))?.reason === "policy_version_changed") throw new SignupConsentVersionChangedError();
  if (response.status === 409 || response.status === 401) throw new SignupConsentSessionChangedError();
  if (!response.ok) throw new Error("consent_record_failed");
  // 2xx라도 서버가 기록을 확인해 준 본문({ recorded: true })이 아니면(204, HTML 대체 응답, 빈/다른 JSON) 저장된 것으로 보지 않는다.
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || (payload as { recorded?: unknown }).recorded !== true) throw new Error("consent_record_unconfirmed");
}
