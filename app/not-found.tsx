import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요 | TalkTheme",
  // 없는 주소는 검색 결과에 남을 이유가 없다.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_20%,#ffffff_60%,#f7fbff_100%)] text-[var(--color-on-background)]">
      <SiteHeader />
      <div className="grid place-items-center px-5 py-16 md:py-24">
        <section className="grid w-full max-w-xl gap-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#eaf2ff] text-[#2f6bbf]">
            <Compass className="size-7" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3d7bd6]">404</p>
            <h1 className="mt-2 text-[28px] font-black leading-tight tracking-[-0.02em] sm:text-[38px]">
              찾으시는 페이지가 없어요
            </h1>
            <p className="mt-3 text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:text-[15px]">
              주소가 바뀌었거나 삭제된 페이지일 수 있어요. 아래에서 다시 시작해 보세요.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2.5">
            <Link
              href="/template"
              className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-[#fee500] px-6 text-sm font-black text-[#191600] shadow-[0_14px_30px_rgba(254,229,0,0.4)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
            >
              내 테마 만들기
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link
              href="/guide"
              className="inline-flex min-h-12 items-center rounded-full border border-[#cfe0ff] bg-white/85 px-6 text-sm font-black text-[#2f6bbf] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
            >
              만드는 법 보기
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center rounded-full px-4 text-sm font-black text-[#5b6b82] underline-offset-4 transition hover:text-[#2f6bbf] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
            >
              홈으로
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
