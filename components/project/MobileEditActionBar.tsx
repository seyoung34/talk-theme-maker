"use client";

import Link from "next/link";
import { ArrowLeft, Download, Save, ShieldCheck } from "lucide-react";

export function MobileEditActionBar({
  isAdminMode,
  isSaving,
  isExporting,
  onSave,
  onExport,
}: {
  readonly isAdminMode: boolean;
  readonly isSaving: boolean;
  readonly isExporting: boolean;
  readonly onSave: () => void;
  readonly onExport: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 shrink-0 px-1 pb-2 pt-[max(0.25rem,env(safe-area-inset-top))]">
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-2xl border border-[#e5e7eb] bg-white/92 px-2 py-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <Link
          href="/template"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e5e7eb] bg-[#f8fafc] text-[#111827] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          aria-label="템플릿으로 돌아가기"
        >
          <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        </Link>

        <div className="flex min-w-0 flex-1 justify-end gap-1.5">
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d1d5db] bg-white px-3 text-xs font-bold text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            onClick={onSave}
            disabled={isSaving}
          >
            {isAdminMode ? <ShieldCheck size={15} strokeWidth={2.2} aria-hidden="true" /> : <Save size={15} strokeWidth={2.2} aria-hidden="true" />}
            <span>{isSaving ? "저장 중" : "저장"}</span>
          </button>
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0f172a] px-3 text-xs font-bold text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition hover:bg-[#1e293b] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            onClick={onExport}
            disabled={isExporting}
          >
            <Download size={15} strokeWidth={2.2} aria-hidden="true" />
            <span>{isExporting ? "내보내는 중" : "내보내기"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
