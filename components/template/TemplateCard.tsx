import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

// 내 템플릿 카드와 템플릿 갤러리 카드가 공유하는 컴포넌트.
// 모바일(< sm)에서는 항상 "썸네일 + 이름 + 모달 여는 버튼"만 노출하고,
// 데스크톱(sm 이상) 상세 레이아웃은 각 호출부가 desktopVisual/desktopContent/desktopFooter로 채운다.
export default function TemplateCard({
  title,
  onOpen,
  openLabel,
  mobileVisual,
  desktopVisual,
  desktopContent,
  desktopFooter,
  className = "",
}: {
  title: string;
  onOpen: () => void;
  openLabel?: string;
  mobileVisual: ReactNode;
  desktopVisual: ReactNode;
  desktopContent: ReactNode;
  desktopFooter?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`group relative grid min-h-0 w-full content-between gap-2 overflow-hidden rounded-[16px] border border-[var(--color-outline-variant)] bg-white/92 p-2 text-left shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-2 sm:gap-3 sm:rounded-[28px] sm:p-4 ${className}`}
    >
      <button
        type="button"
        aria-label={openLabel ?? `${title} 열기`}
        className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none"
        onClick={onOpen}
      />

      {/* 모바일: 썸네일 + 템플릿 이름 + 모달 여는 버튼 */}
      <div className="grid gap-1.5 sm:hidden">
        {mobileVisual}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-black text-[var(--color-on-surface)]">{title}</span>
          <span
            aria-hidden="true"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-low)] text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-on-primary-container)]"
          >
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>

      {/* 데스크톱: 각 호출부가 채우는 상세 레이아웃 */}
      <div className="hidden sm:grid sm:gap-2.5">
        {desktopVisual}
        {desktopContent}
      </div>

      {desktopFooter ? <div className="hidden sm:block">{desktopFooter}</div> : null}
    </article>
  );
}
