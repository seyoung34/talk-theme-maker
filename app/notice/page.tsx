import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createPublicPageMetadata } from "@/lib/seo/site";
import { listPublishedNotices } from "@/lib/notices/queries";
import { NoticeMeta, NoticeShell } from "@/components/notice/NoticeShell";

export const metadata: Metadata = createPublicPageMetadata({
  title: "공지사항",
  description: "TalkTheme 업데이트, 점검, 정책 변경 안내",
  path: "/notice",
});

// 공지는 관리자가 발행하는 즉시 보여야 한다. 정적으로 굳으면 재배포까지 옛 목록이 남는다.
export const dynamic = "force-dynamic";

export default async function NoticePage() {
  const notices = await listPublishedNotices();

  return (
    <NoticeShell
      eyebrow="Notice"
      title="공지사항"
      description="업데이트, 점검, 정책 변경을 안내합니다."
      backHref="/"
      backLabel="서비스로 돌아가기"
    >
      {notices.length < 1 ? (
        <p className="mt-7 rounded-[28px] border border-[#dbe8fb] bg-white/92 px-6 py-12 text-center text-sm font-bold text-[#5b6b82] shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
          등록된 공지가 아직 없습니다.
        </p>
      ) : (
        <ul className="mt-7 overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
          {notices.map((notice) => (
            <li key={notice.id} className="border-b border-[#e8eff8] last:border-b-0">
              <Link
                href={`/notice/${notice.id}`}
                className="flex items-center gap-4 px-5 py-5 transition hover:bg-[#f7fbff] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2f6bbf] sm:px-8"
              >
                <span className="min-w-0 flex-1">
                  <NoticeMeta notice={notice} />
                  <strong className="mt-2 block truncate text-[15px] font-extrabold text-[var(--color-on-surface)] sm:text-base">{notice.title}</strong>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[#9fb4d0]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </NoticeShell>
  );
}
