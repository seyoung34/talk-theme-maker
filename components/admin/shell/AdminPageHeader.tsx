import type { ReactNode } from "react";

/**
 * 콘솔 화면 공통 바깥 틀.
 *
 * 사이드바 옆 본문이 화면마다 다른 폭·정렬(가운데 5xl, 6xl, 7xl)을 쓰면 메뉴를 옮길 때마다 제목이
 * 좌우로 흔들린다. 모든 콘솔 화면이 이 틀을 쓰고, 폼·표처럼 좁아야 읽기 좋은 본문은 안쪽에서
 * 왼쪽 정렬로 폭만 줄인다(`adminPageNarrowClassName`).
 */
export const adminPageClassName = "mx-auto grid w-full max-w-7xl content-start gap-6 px-5 py-8 md:px-8";

/** 폼·표 위주 화면의 본문 폭. 제목 위치는 그대로 두고 오른쪽만 줄인다. */
export const adminPageNarrowClassName = "w-full max-w-5xl";

type AdminPageHeaderProps = {
  /** 제목 위 작은 영문 라벨. */
  eyebrow: string;
  title: string;
  /** 제목 옆 안내(예: InfoTip). */
  info?: ReactNode;
  description?: ReactNode;
  /** 오른쪽 작업 버튼. */
  actions?: ReactNode;
  /** 제목 아래 줄(필터·요약 칩 등). */
  children?: ReactNode;
};

export default function AdminPageHeader({ eyebrow, title, info, description, actions, children }: AdminPageHeaderProps) {
  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">{eyebrow}</p>
          <h1 className="mt-1 flex items-center gap-1.5 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">
            {title}
            {info}
          </h1>
          {description ? <p className="mt-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
