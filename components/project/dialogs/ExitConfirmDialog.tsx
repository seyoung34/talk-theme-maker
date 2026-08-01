type ExitConfirmDialogProps = {
  hasUnsavedChanges: boolean;
  isExporting: boolean;
  isSaving: boolean;
  saveFailed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
};

export function ExitConfirmDialog({
  hasUnsavedChanges,
  isExporting,
  isSaving,
  saveFailed,
  onCancel,
  onConfirm,
  onDiscard,
}: ExitConfirmDialogProps) {
  const description = saveFailed
    ? "최근 변경 사항을 자동 저장하지 못했습니다. 편집을 계속하거나 저장하지 않고 종료할 수 있습니다."
    : isExporting
      ? "다운로드 준비가 진행 중입니다. 지금 종료하면 결과물을 받지 못할 수 있습니다."
      : hasUnsavedChanges
        ? "최근 변경 사항을 자동 저장한 뒤 종료합니다."
        : "현재 편집 화면을 종료합니다.";

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="편집 종료 확인" aria-busy={isSaving}>
      <section className="grid w-full max-w-[360px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-[#0f172a]">{saveFailed ? "자동 저장하지 못했습니다" : "편집을 종료할까요?"}</h2>
          <p className="text-sm leading-6 text-[#64748b]">{description}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155] disabled:cursor-wait disabled:opacity-60" onClick={onCancel} disabled={isSaving}>편집 계속하기</button>
          {saveFailed ? (
            <button type="button" className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white" onClick={onDiscard}>저장하지 않고 종료</button>
          ) : (
            <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60" onClick={onConfirm} disabled={isSaving}>{isSaving ? "자동 저장 중…" : "편집 종료하기"}</button>
          )}
        </div>
      </section>
    </div>
  );
}
