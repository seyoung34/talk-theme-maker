import Link from "next/link";
import { ArrowLeft, Pin } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import { InfoTip } from "@/components/common/InfoTip";
import { noticeCategoryLabels, type Notice } from "@/lib/notices/types";
import { formatKoreanDate } from "@/lib/shared/koreanDate";
import type { ReactNode } from "react";

/** 공지 목록·상세가 공유하는 껍데기. 정책 문서 페이지와 같은 표면을 쓴다. */
export function NoticeShell({ title, description, backHref, backLabel, children }: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e8f1ff_0%,#f7fbff_24%,#ffffff_58%,#edf5ff_100%)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/notice" />
      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white px-3.5 py-2 text-xs font-black text-[#2f6bbf] transition hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bbf]"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {backLabel}
        </Link>

        <header className="mt-6">
          <h1 className="flex items-start gap-1.5 font-[var(--font-display)] text-[26px] font-semibold tracking-[-0.04em] text-[var(--color-on-surface)] sm:text-[32px]">
            {title}
            {description ? <InfoTip label={`${title} 안내`}>{description}</InfoTip> : null}
          </h1>
        </header>

        {children}
      </div>
    </main>
  );
}

export function NoticeMeta({ notice }: { notice: Notice }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
      {notice.pinned ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fff2bd] px-2.5 py-1 text-[#665300]">
          <Pin size={12} aria-hidden="true" />
          고정
        </span>
      ) : null}
      <span className="rounded-full border border-[#dbe8fb] bg-[#f7fbff] px-2.5 py-1 text-[#3d7bd6]">{noticeCategoryLabels[notice.category]}</span>
      <span className="text-[#5b6b82]">{formatKoreanDate(notice.publishedAt ?? notice.createdAt)}</span>
    </div>
  );
}
