import Link from "next/link";

export function InitialTemplateLoadingPanel({
  message,
  detail,
  current,
  total,
}: {
  message: string;
  detail?: string;
  current?: number;
  total?: number;
}) {
  const hasProgress = typeof current === "number" && typeof total === "number" && total > 0;
  const progressValue = hasProgress ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 18;

  return (
    <div className="grid h-full px-5 place-items-center">
      <section className="grid w-full max-w-3xl gap-5 rounded-[28px] border border-[#e5e7eb] bg-white/95 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748b]">Loading template</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#0f172a]">{message}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">{detail ?? "미리보기에 필요한 에셋을 먼저 준비한 뒤 편집 화면을 엽니다."}</p>
          <div className="grid gap-2 mt-5">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#64748b]">
              <span>초기 준비</span>
              <span>{hasProgress ? `${progressValue}%` : "준비 중"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
              <div className="h-full rounded-full bg-[#2563eb] transition-all duration-300" style={{ width: `${progressValue}%` }} />
            </div>
            {hasProgress ? <p className="text-[11px] font-semibold text-[#94a3b8]">{current}/{total} 단계 완료</p> : null}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="aspect-[9/16] animate-pulse rounded-[28px] bg-[#f1f5f9]" />
          <div className="grid content-start gap-3">
            <span className="h-10 animate-pulse rounded-2xl bg-[#f1f5f9]" />
            <span className="h-24 animate-pulse rounded-2xl bg-[#f1f5f9]" />
            <span className="h-24 animate-pulse rounded-2xl bg-[#f1f5f9]" />
          </div>
        </div>
      </section>
    </div>
  );
}

export function InitialTemplateErrorPanel({ message, onStartDefault }: { message: string; onStartDefault: () => void }) {
  return (
    <div className="grid h-full px-5 place-items-center">
      <section className="grid w-full max-w-xl gap-4 rounded-[28px] border border-rose-100 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">Template load failed</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#0f172a]">{message}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">네트워크 또는 Storage 권한을 확인한 뒤 다시 시도하거나 기본 템플릿으로 시작할 수 있습니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/template" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fafc]">템플릿으로 돌아가기</Link>
          <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1e293b]" onClick={onStartDefault}>기본 템플릿으로 시작</button>
        </div>
      </section>
    </div>
  );
}
