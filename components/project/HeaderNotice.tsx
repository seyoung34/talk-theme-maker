"use client";

import { useEffect, useRef } from "react";
import type { ProjectNotice } from "@/components/project/editorTypes";

export const noticeAutoDismissMs = 2500;

/**
 * 편집기 상단에 잠깐 떴다 사라지는 알림.
 *
 * 타이머는 알림 객체가 바뀔 때만 다시 건다. `onDismiss`를 의존성에 넣으면 호출부가
 * 인라인 화살표 함수를 넘기는 한 부모가 리렌더할 때마다 타이머가 초기화되고, 편집기는
 * 자동 저장 상태 표시와 미리보기 콜백 때문에 2.5초 안에 거의 항상 리렌더된다.
 * 그러면 알림이 영영 사라지지 않는다. 최신 콜백은 ref로 따라간다.
 */
export function HeaderNotice({ notice, onDismiss }: { notice: ProjectNotice; onDismiss: () => void }) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (notice.persistent) return;
    const timeout = window.setTimeout(() => dismissRef.current(), noticeAutoDismissMs);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const noticeToneClass =
    notice.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : notice.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : notice.tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <div className={`pointer-events-auto fixed left-1/2 top-4 z-[90] flex w-[min(92vw,460px)] -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-sm ${noticeToneClass}`}>
      <span className="truncate">{notice.message}</span>
      <button type="button" className="shrink-0 text-current/70 hover:text-current" onClick={onDismiss} aria-label="알림 닫기">
        닫기
      </button>
    </div>
  );
}
