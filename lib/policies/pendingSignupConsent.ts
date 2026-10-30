/**
 * 이메일 가입 직후 동의 기록이 실패했을 때, 새로고침·재로그인 뒤에도 "동의 기록만 재시도"하도록 남기는 같은 브라우저 안의 표식이다.
 * 이 표식은 동의의 증거가 아니라 "이 브라우저에서 이 계정의 가입 폼 동의를 받았고 기록이 아직 안 끝났다"는 재시도 힌트다.
 * - 저장하는 값은 가입 계정의 opaque user id와 시각뿐이다(이메일 등 개인정보 없음).
 * - 동의 행이 없다는 이유만으로는 만들지 않는다. 가입 폼에서 동의 후 인증이 성공한 직후에만 만든다.
 * - 쓰기는 서버가 현재 세션 사용자와 id 일치를 확인한 뒤에만 한다. 표식이 위조돼도 다른 계정에는 기록되지 않는다.
 * 서버 전역 강제는 아니다. 이 표식은 로그인 화면(LoginClient)에서만 읽는다.
 */
const storageKey = "talktheme.pendingSignupConsent";
export const pendingSignupConsentMaxAgeMs = 24 * 60 * 60 * 1000;

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

/** 만료되지 않은 표식의 user id. 만료·손상된 표식은 지운다. */
export function readPendingSignupConsentUserId(now = Date.now()): string | null {
  const pending = readStore();
  if (!pending) return null;
  if (now - pending.createdAt > pendingSignupConsentMaxAgeMs || pending.createdAt > now + 60_000) {
    clearPendingSignupConsent();
    return null;
  }
  return pending.userId;
}
