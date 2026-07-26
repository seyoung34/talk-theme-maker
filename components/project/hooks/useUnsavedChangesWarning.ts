"use client";

import { useEffect } from "react";

/**
 * 새로고침·탭 종료·주소창 이동으로 편집 결과를 잃기 전에 브라우저 기본 확인창을 띄운다.
 *
 * 뒤로 가기는 `popstate` 가드가 자체 다이얼로그로 처리하지만, 그 경로는 새로고침과 탭 종료를 잡지 못한다.
 * 브라우저는 커스텀 문구를 무시하고 자체 문구를 쓰므로 메시지는 지정하지 않는다.
 *
 * 조건 없이 등록하면 빈 편집기에서도 경고가 떠 성가시므로, 잃을 것이 있을 때만 `enabled`를 켜는 판단은
 * 호출부가 한다.
 */
export function useUnsavedChangesWarning(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 최신 브라우저는 preventDefault만으로 충분하지만, 일부는 여전히 returnValue가 설정돼야 경고를 띄운다.
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled]);
}
