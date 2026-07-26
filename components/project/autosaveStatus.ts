/**
 * 자동 저장 상태를 화면에 보여주기 위한 표기 규칙.
 *
 * "저장됨"만 띄우면 언제 저장됐는지 알 수 없어 사용자가 신뢰하지 못한다. 반대로 정확한 시각을
 * 그대로 쓰면 편집 화면에서 읽는 비용이 크다. 그래서 최근일수록 거칠게, 오래될수록 단위를 키운다.
 */
export function formatRelativeSavedAt(savedAt: number, now: number = Date.now()) {
  const elapsedMs = Math.max(0, now - savedAt);
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  return `${Math.floor(hours / 24)}일 전`;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export function getAutosaveStatusLabel(status: AutosaveStatus, savedAt: number | null, now: number = Date.now()) {
  switch (status) {
    case "saving":
      return "저장 중";
    case "saved":
      return savedAt ? `저장됨 · ${formatRelativeSavedAt(savedAt, now)}` : "저장됨";
    case "error":
      return "자동 저장 실패";
    case "conflict":
      return "다른 탭에서 편집 중";
    case "idle":
      return null;
  }
}
