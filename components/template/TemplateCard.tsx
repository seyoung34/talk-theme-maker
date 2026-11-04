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
      className={`group relative grid min-h-0 w-full content-between gap-2 overflow-hidden rounded-[16px] bg-white p-2 text-left shadow-[0_8px_28px_rgba(47,107,191,0.10)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(47,107,191,0.12)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-2 sm:gap-3 sm:rounded-[28px] sm:p-4 ${className}`}
    >
      <button
        type="button"
        aria-label={openLabel ?? `${title} 열기`}
        className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none"
        onClick={onOpen}
      />

      {/* 모바일: 썸네일 + 템플릿 이름 + 모달 여는 버튼 */}
      <div className="grid gap-1.5 sm:hidden">
        {/*
          미리보기(회색 바탕 이미지)를 카드 위·양옆 끝까지 채운다. 카드 안에 또 하나의 둥근 틀이 들어 있던
          3중 구조(카드 → 회색 영역 → 화면)를 줄이기 위해서다. 모서리는 카드의 overflow-hidden이 자르므로
          안쪽 둥근 모서리는 없앤다.
        */}
        <div className="-mx-2 -mt-2 overflow-hidden [&_img]:!rounded-none [&>*]:!rounded-none">{mobileVisual}</div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-bold text-[var(--color-on-surface)]">{title}</span>
          <ArrowRight className="size-4 shrink-0 text-[var(--color-on-surface-variant)] transition group-hover:text-[#2f6bbf]" aria-hidden="true" />
        </div>
      </div>

      {/* 데스크톱: 각 호출부가 채우는 상세 레이아웃 */}
      <div className="hidden sm:grid sm:gap-3">
        <div className="-mx-4 -mt-4 overflow-hidden [&_img]:!rounded-none [&>*]:!rounded-none">{desktopVisual}</div>
        {desktopContent}
      </div>

      {desktopFooter ? <div className="hidden sm:block">{desktopFooter}</div> : null}
    </article>
  );
}
