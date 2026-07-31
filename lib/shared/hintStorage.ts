/**
 * 처음 한 번만 보여줄 안내(hint)의 노출 여부를 이 브라우저에 기록한다.
 *
 * 편집기의 도움말처럼 "몰라서 못 쓰는" 기능은 처음에 한 번 펼쳐 보여줄 가치가 있지만,
 * 매번 열리면 방해가 된다. 계정이 아니라 브라우저 단위 기록이라 기기를 바꾸면 다시 뜬다.
 * 분석 동의 플래그와 같은 이유로 실패를 삼킨다(프라이버시 확장이 localStorage를 막는다).
 * 안내를 못 본 것보다 잘못 기록해서 영영 안 뜨는 쪽이 나쁘므로, 읽기 실패는 "아직 안 봄"으로 본다.
 */
export const bubbleEditorHelpHint = "bubble-editor-help";

function hintStorageKey(name: string) {
  return `talktheme:hint:${name}:v1`;
}

export function hasSeenHint(name: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(hintStorageKey(name)) === "1";
  } catch {
    return false;
  }
}

export function markHintSeen(name: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(hintStorageKey(name), "1");
  } catch {
    // 저장할 수 없으면 다음 방문에 한 번 더 뜬다. 기능에는 영향이 없다.
  }
}
