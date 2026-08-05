import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicPageMetadata } from "@/lib/seo/site";
import { getPublishedNotice } from "@/lib/notices/queries";
import { toNoticeParagraphs } from "@/lib/notices/types";
import { NoticeMeta, NoticeShell } from "@/components/notice/NoticeShell";

export const dynamic = "force-dynamic";

type NoticeDetailProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: NoticeDetailProps): Promise<Metadata> {
  const { id } = await params;
  const notice = await getPublishedNotice(id);
  if (!notice) return createPublicPageMetadata({ title: "공지사항", description: "TalkTheme 공지사항", path: "/notice" });
  return createPublicPageMetadata({
    title: notice.title,
    // 본문 첫 문단을 요약으로 쓴다. 별도 요약 필드를 두면 관리자가 매번 두 번 써야 한다.
    description: toNoticeParagraphs(notice.body)[0]?.slice(0, 120) ?? "TalkTheme 공지사항",
    path: `/notice/${notice.id}`,
  });
}

export default async function NoticeDetailPage({ params }: NoticeDetailProps) {
  const { id } = await params;
  const notice = await getPublishedNotice(id);
  if (!notice) notFound();

  // 상세는 제목 자체가 내용이라 덧붙일 안내가 없다. description 을 비우면 info 버튼도 나오지 않는다.
  return (
    <NoticeShell
      title={notice.title}
      description=""
      backHref="/notice"
      backLabel="공지사항 목록"
    >
      <article className="mt-7 overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 px-5 py-6 shadow-[0_22px_62px_rgba(47,107,191,0.09)] sm:px-8 sm:py-8">
        <NoticeMeta notice={notice} />
        <div className="mt-5 grid gap-4">
          {toNoticeParagraphs(notice.body).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:text-[15px]">
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </NoticeShell>
  );
}
