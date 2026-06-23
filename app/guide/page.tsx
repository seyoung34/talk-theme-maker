import type { Metadata } from "next";
import GuideClient, { GuideSummary } from "@/components/guide/GuideClient";
import SiteHeader from "@/components/layout/SiteHeader";
import { isGuidePlatform } from "@/lib/guide/content";

export const metadata: Metadata = {
  title: "Guide | TalkTheme",
  description: "Android와 iOS 카카오톡 테마의 편집, 내보내기, 적용 방법과 상세 파일 규격을 확인하세요.",
};

type GuidePageProps = {
  searchParams: Promise<{ platform?: string }>;
};

export default async function GuidePage({ searchParams }: GuidePageProps) {
  const params = await searchParams;
  const initialPlatform = isGuidePlatform(params.platform) ? params.platform : "android";

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/guide" />
      <div className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-11">
        <header className="grid gap-7 border-b border-[var(--color-outline-variant)] pb-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-end">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-[var(--color-secondary)]">THEME GUIDE</p>
            <h1 className="mt-2 max-w-2xl font-[var(--font-display)] text-[34px] font-semibold tracking-[-0.05em] text-[var(--color-on-surface)] sm:text-[42px]">만드는 방법부터<br className="hidden sm:block" /> 적용하는 순간까지</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">sample theme와 실제 내보내기 구조를 기준으로 정리한 작업 안내서입니다. 처음 만드는 사용자와 파일 규격을 확인하려는 사용자 모두를 위한 내용을 담았습니다.</p>
          </div>
          <GuideSummary />
        </header>

        <GuideClient initialPlatform={initialPlatform} />
      </div>
    </main>
  );
}
