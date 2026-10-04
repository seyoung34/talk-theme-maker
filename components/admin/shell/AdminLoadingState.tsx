/** A lightweight fallback; it never claims that an unfinished lookup is empty. */
export default function AdminLoadingState({ label = "화면을 불러오는 중입니다" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3 rounded-2xl border border-[var(--color-outline-variant)] bg-white p-5">
      <p className="text-sm font-bold text-[var(--color-on-surface-variant)]">{label}</p>
      <div aria-hidden="true" className="grid gap-3 motion-safe:animate-pulse">
        <div className="h-4 w-40 rounded bg-[var(--color-surface-container)]" />
        <div className="h-24 rounded-xl bg-[var(--color-surface-low)]" />
      </div>
    </div>
  );
}
