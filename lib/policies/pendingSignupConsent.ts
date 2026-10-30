/**
 * 이메일 가입 직후 동의 기록이 실패했을 때, 새로고침·재로그인 뒤에도 동의 화면을 다시 띄우도록 남기는 같은 브라우저 안의 표식이다.
 * 이 표식은 동의의 증거가 아니라 "이 계정은 가입 동의 기록이 아직 안 끝났을 수 있다"는 화면 힌트일 뿐이다.
 * 표식이 있어도(위조·복원 포함) 자동으로 기록하지 않는다. 새로고침·재로그인 뒤에는 사용자가 현재 버전의 연령·약관·개인정보를 다시 체크해야 기록된다.
 * 브라우저 데이터가 지워지면 표식도 사라져 복구 화면이 뜨지 않는다(서버 전역 강제가 아닌 이 방식의 고유 한계).
 * - 저장하는 값은 가입 계정의 opaque user id와 시각뿐이다(이메일 등 개인정보 없음).
 * - 동의 행이 없다는 이유만으로는 만들지 않는다. 가입 폼에서 동의 후 인증이 성공한 직후에만 만든다.
 * - 쓰기는 서버가 현재 세션 사용자와 id 일치, 그리고 본문의 현재 버전 동의를 확인한 뒤에만 한다.
 * 서버 전역 강제는 아니다. 이 표식은 로그인 화면(LoginClient)에서만 읽는다.
 */
const storageKey = "talktheme.pendingSignupConsent";

type PendingSignupConsent = { userId: string; createdAt: number };

function readStore(): PendingSignupConsent | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignupConsent> | null;
    if (!parsed || typeof parsed.userId !== "string" || typeof parsed.createdAt !== "number") return null;
    return { userId: parsed.userId, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

export function markPendingSignupConsent(userId: string, now = Date.now()) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ userId, createdAt: now } satisfies PendingSignupConsent));
  } catch {
    // 저장소를 못 쓰면 같은 화면 안의 재시도만 가능하다.
  }
}

export function clearPendingSignupConsent(userId?: string) {
  try {
    if (userId) {
      const pending = readStore();
      if (pending && pending.userId !== userId) return;
    }
    window.localStorage.removeItem(storageKey);
  } catch {
    // 무시
  }
}

/**
 * 표식의 user id. 시간이 지나도 버리지 않는다(기록이 끝나기 전에는 복구 경로를 잃지 않는다). 손상된 표식은 null.
 * 읽기는 화면에서 "동의를 다시 받는 단계"를 보여 주는 용도뿐이며, 이 값만으로 동의를 기록하지 않는다.
 */
export function readPendingSignupConsentUserId(): string | null {
  return readStore()?.userId ?? null;
}
