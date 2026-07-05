import type { Metadata } from "next";
import GuideClient from "@/components/guide/GuideClient";
import SiteHeader from "@/components/layout/SiteHeader";
import { isGuideMode, isGuidePlatform } from "@/lib/guide/content";

export const metadata: Metadata = {
  title: "Guide | TalkTheme",
  description: "Android와 iOS 카카오톡 테마의 편집, 내보내기, 적용 방법과 상세 파일 규격을 확인하세요.",
};

type GuidePageProps = {
  searchParams: Promise<{ platform?: string; mode?: string }>;
};

export default async function GuidePage({ searchParams }: GuidePageProps) {
  const params = await searchParams;
  const initialPlatform = isGuidePlatform(params.platform) ? params.platform : "android";
  const initialMode = isGuideMode(params.mode) ? params.mode : "easy";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_16%,#ffffff_40%,#f7fbff_66%,#e9f2ff_100%)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/guide" />
      <div className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-11">
        <GuideClient initialPlatform={initialPlatform} initialMode={initialMode} />
      </div>
    </main>
  );
}
