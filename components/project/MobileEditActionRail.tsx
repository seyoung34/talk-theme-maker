"use client";

import { ArrowLeft, Download, Save, ShieldCheck } from "lucide-react";
import { AutosaveStatusBadge } from "@/components/project/AutosaveStatusBadge";
import type { AutosaveStatus } from "@/components/project/autosaveStatus";
import type { MobileSheetSnap } from "@/components/project/MobileEditSheet";

/**
 * 시트가 올라온 상태의 전역 행동.
 *
 * 이때 프리뷰는 남은 높이에 맞춰 축소되므로 좌우에 큰 빈 공간이 생긴다(360px 폭·half 스냅에서
 * 한쪽 약 80px). 가로 헤더 밴드를 없애고 그 빈 공간에 버튼만 띄우면 프리뷰가 밴드 높이만큼
 * 더 커지면서 저장·다운로드·나가기도 그대로 남는다.
 *
 * 방향은 스냅에 따라 바꾼다. half에서는 프리뷰가 가로로 넓어 세로 스택이라야 겹치지 않고,
 * full에서는 남은 높이가 세로 스택보다 짧은 대신 프리뷰가 가늘어져 가로 배치가 안전하다.
 */
export function MobileEditActionRail({
  snap,
  isAdminMode,
  isSaving,
  isExporting,
  isPreparingExport,
  autosaveStatus,
  autosaveSavedAt,
  onBack,
  onSave,
  onExport,
}: {
  readonly snap: MobileSheetSnap;
  readonly isAdminMode: boolean;
  readonly isSaving: boolean;
  readonly isExporting: boolean;
  readonly isPreparingExport: boolean;
  readonly autosaveStatus: AutosaveStatus;
  readonly autosaveSavedAt: number | null;
  readonly onBack: () => void;
  readonly onSave: () => void;
  readonly onExport: () => void;
}) {
  const stackClassName = snap === "full" ? "flex items-center gap-1.5" : "flex flex-col gap-1.5";
  const buttonClassName =
    "grid size-11 shrink-0 place-items-center rounded-xl border shadow-[0_4px_14px_rgba(15,23,42,0.12)] backdrop-blur-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-wait disabled:opacity-60";

  return (
    // 프리뷰 위에 얹되 버튼 밖은 클릭을 통과시켜, 프리뷰 자체의 상호작용을 막지 않는다.
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-between px-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
      <div className={`pointer-events-auto min-w-0 ${stackClassName}`}>
        <button
          type="button"
          onClick={onBack}
          className={`${buttonClassName} border-[#e5e7eb] bg-white/90 text-[#111827] hover:bg-white`}
          aria-label="편집 종료"
        >
          <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {/*
          시트가 올라온 동안에는 저장 배지를 보여 주지 않는다. 프리뷰를 넓히려고 헤더 밴드를 접은
          자리에 다시 칩을 띄우면 목적이 상쇄되고, 저장 상태는 시트를 접으면 밴드에서 바로 보인다.
          다만 화면에서만 감춘다. 상태 변화를 알리는 유일한 `aria-live` 영역이라, 지우면 편집하는
          내내 자동 저장 성공·실패가 스크린리더에 전달되지 않는다.
        */}
        <AutosaveStatusBadge status={autosaveStatus} savedAt={autosaveSavedAt} className="sr-only" />
      </div>

      <div className={`pointer-events-auto ${stackClassName}`}>
        <button
          type="button"
          className={`${buttonClassName} border-[#d1d5db] bg-white/90 text-[#334155] hover:bg-white`}
          onClick={onSave}
          disabled={isSaving}
          aria-label={isSaving ? "저장 중" : isAdminMode ? "시스템 템플릿 저장" : "템플릿 저장"}
        >
          {isAdminMode ? <ShieldCheck size={17} strokeWidth={2.2} aria-hidden="true" /> : <Save size={17} strokeWidth={2.2} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={`${buttonClassName} border-transparent bg-[#0f172a]/92 text-white hover:bg-[#1e293b]`}
          onClick={onExport}
          disabled={isPreparingExport || isExporting}
          aria-label={isExporting || isPreparingExport ? "다운로드 준비 중" : "테마 다운로드"}
        >
          <Download size={17} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
