"use client";

import { ArrowLeft, Download, Save, ShieldCheck } from "lucide-react";
import { AutosaveStatusBadge } from "@/components/project/AutosaveStatusBadge";
import type { AutosaveStatus } from "@/components/project/autosaveStatus";

//모바일 헤더
export function MobileEditActionBar({
  visible = true,
  isAdminMode,
  isSaving,
  isExporting,
  isPreparingExport,
  templateName,
  autosaveStatus,
  autosaveSavedAt,
  onBack,
  onSave,
  onExport,
}: {
  readonly visible?: boolean;
  readonly isAdminMode: boolean;
  readonly isSaving: boolean;
  readonly isExporting: boolean;
  readonly isPreparingExport: boolean;
  readonly templateName?: string;
  readonly autosaveStatus: AutosaveStatus;
  readonly autosaveSavedAt: number | null;
  readonly onBack: () => void;
  readonly onSave: () => void;
  readonly onExport: () => void;
}) {
  const hiddenTabIndex = visible ? undefined : -1;

  return (
    <div
      className={`sticky top-0 z-30 grid shrink-0 transition-[grid-template-rows,opacity,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${visible ? "grid-rows-[1fr] opacity-100 translate-y-0" : "pointer-events-none grid-rows-[0fr] -translate-y-3 opacity-0"}`}
      aria-hidden={!visible}
    >
      <div className="min-h-0 overflow-hidden px-1 pb-2 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <div className="flex min-h-12 items-center justify-between gap-2 rounded-2xl border border-[#e5e7eb] bg-white/92 px-2 py-1.5  backdrop-blur-md">
          <button
            type="button"
            onClick={onBack}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e5e7eb] bg-[#f8fafc] text-[#111827] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            aria-label="편집 종료"
            tabIndex={hiddenTabIndex}
          >
            <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1 px-1">
            {templateName ? (
              <p className="truncate text-sm font-semibold leading-5 text-[#0f172a]">{templateName}</p>
            ) : null}
            <AutosaveStatusBadge status={autosaveStatus} savedAt={autosaveSavedAt} className="flex text-[11px] leading-4" />
          </div>

          <div className="flex min-w-0 shrink-0 justify-end gap-1.5">
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d1d5db] bg-white px-3 text-xs font-bold text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              onClick={onSave}
              disabled={isSaving}
              tabIndex={hiddenTabIndex}
            >
              {isAdminMode ? <ShieldCheck size={15} strokeWidth={2.2} aria-hidden="true" /> : <Save size={15} strokeWidth={2.2} aria-hidden="true" />}
              <span>{isSaving ? "저장 중" : "저장"}</span>
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0f172a] px-3 text-xs font-bold text-white  transition hover:bg-[#1e293b] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              onClick={onExport}
              disabled={isPreparingExport || isExporting}
              tabIndex={hiddenTabIndex}
            >
              <Download size={15} strokeWidth={2.2} aria-hidden="true" />
              <span>{isExporting ? "다운로드 준비 중" : isPreparingExport ? "준비 중" : "다운로드"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
