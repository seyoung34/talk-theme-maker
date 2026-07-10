export function ExitConfirmDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="편집 종료 확인">
      <section className="grid w-full max-w-[360px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-[#0f172a]">편집을 종료할까요?</h2>
          <p className="text-sm leading-6 text-[#64748b]">저장하지 않은 변경 사항은 사라질 수 있습니다.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onCancel}>편집 계속하기</button>
          <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white" onClick={onConfirm}>편집 종료하기</button>
        </div>
      </section>
    </div>
  );
}
