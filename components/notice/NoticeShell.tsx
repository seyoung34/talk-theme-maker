import Link from "next/link";
import { ArrowLeft, Megaphone, Pin } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import { noticeCategoryLabels, type Notice } from "@/lib/notices/types";
import type { ReactNode } from "react";

/** 공지 목록·상세가 공유하는 껍데기. 정책 문서 페이지와 같은 표면을 쓴다. */
export function NoticeShell({ eyebrow, title, description, backHref, backLabel, children }: {
  eyebrow: string;
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

        <header className="relative mt-5 overflow-hidden rounded-[32px] border border-[#dbe8fb] bg-white/90 px-6 py-8 shadow-[0_24px_70px_rgba(47,107,191,0.1)] sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-[radial-gradient(circle,rgba(91,155,255,0.2),transparent_68%)]" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#fff2bd] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#665300]">
              <Megaphone size={14} aria-hidden="true" />
              {eyebrow}
            </span>
            <h1 className="mt-5 font-[var(--font-display)] text-[32px] font-semibold tracking-[-0.05em] text-[var(--color-on-surface)] sm:text-[46px]">{title}</h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:text-base">{description}</p>
          </div>
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
      <span className="text-[#5b6b82]">{formatNoticeDate(notice.publishedAt ?? notice.createdAt)}</span>
    </div>
  );
}

export function formatNoticeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, "0")}. ${String(date.getDate()).padStart(2, "0")}`;
}
