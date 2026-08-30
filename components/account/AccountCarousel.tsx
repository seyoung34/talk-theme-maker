"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 계정 화면의 목록 캐러셀.
 *
 * 한 장에 여러 줄을 세로로 담고, **장 단위로** 가로로 넘긴다. 항목 하나씩 가로로 미는 방식이
 * 아니다 — 내보내기 기록이나 크레딧 내역은 날짜·금액이 세로로 줄 맞춰야 훑어볼 수 있고,
 * 한 줄씩 옆으로 흐르면 그 정렬이 사라진다.
 *
 * 넘기는 수단을 둘 다 둔다. 모바일은 스와이프(스크롤 스냅), 데스크톱은 버튼이다. 스크롤
 * 위치를 읽어 현재 장을 판단하므로 어느 쪽으로 넘겨도 표시가 따라온다.
 */
export default function AccountCarousel({
  pages,
  label,
}: {
  /** 한 장씩 렌더된 내용. 호출부가 `chunkIntoPages`로 자른다. */
  pages: readonly ReactNode[];
  /** 스크린리더가 이 캐러셀을 무엇이라 부를지. 예: "크레딧 내역" */
  label: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, pages.length);

  /**
   * 스크롤 위치에서 현재 장을 읽는다.
   *
   * 버튼을 누른 뒤 상태를 먼저 바꾸지 않는다. 스와이프·키보드 스크롤·브라우저가 포커스를
   * 따라 스크롤한 경우까지 같은 경로로 처리해야 표시가 실제 위치와 어긋나지 않는다.
   */
  const syncPageIndex = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const next = Math.round(scroller.scrollLeft / scroller.clientWidth);
    setPageIndex(Math.min(Math.max(0, next), pageCount - 1));
  }, [pageCount]);

  const goToPage = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ left: index * scroller.clientWidth, behavior: "smooth" });
  }, []);

  return (
    <div className="grid gap-3">
      <div
        ref={scrollerRef}
        onScroll={syncPageIndex}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-roledescription="캐러셀"
        aria-label={label}
      >
        {pages.map((page, index) => (
          <div
            // 장의 내용이 바뀌어도 순서는 그대로다. 인덱스가 곧 이 장의 정체다.
            key={index}
            className="w-full shrink-0 snap-start"
            role="group"
            aria-roledescription="슬라이드"
            aria-label={`${index + 1} / ${pageCount}`}
          >
            {page}
          </div>
        ))}
      </div>

      {pageCount > 1 ? (
        <nav className="flex items-center justify-center gap-2" aria-label={`${label} 페이지`}>
          <CarouselStepButton direction="previous" disabled={pageIndex === 0} onClick={() => goToPage(pageIndex - 1)} />
          <span className="min-w-14 text-center text-xs font-extrabold tabular-nums text-[var(--color-on-surface-variant)]" aria-live="polite">
            {pageIndex + 1} / {pageCount}
          </span>
          <CarouselStepButton direction="next" disabled={pageIndex >= pageCount - 1} onClick={() => goToPage(pageIndex + 1)} />
        </nav>
      ) : null}
    </div>
  );
}

function CarouselStepButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      className="grid size-9 place-items-center rounded-full border border-[#dbe8fb] bg-white text-[var(--color-on-surface-variant)] transition hover:bg-[#f2f7fd] disabled:opacity-40 disabled:hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "previous" ? "이전" : "다음"}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
