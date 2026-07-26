"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";

/**
 * 라우트 렌더 오류 경계.
 *
 * 이 파일이 없으면 Next.js 기본 오류 화면으로 넘어가면서 편집 중이던 상태까지 함께 사라진다.
 * 사용자가 새로고침만 반복하지 않도록 재시도와 안전한 다음 경로를 함께 제공한다.
 * 중앙 오류 수집(Sentry)은 별도 작업이며, 지금은 콘솔 기록과 digest 노출로 문의 대응을 돕는다.
 */
export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_28%,#ffffff_100%)] px-5 py-16">
      <section className="grid w-full max-w-xl gap-5 rounded-[28px] border border-[#dbe8fb] bg-white/92 p-6 shadow-[0_18px_48px_rgba(47,107,191,0.1)] backdrop-blur sm:p-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3d7bd6]">Something went wrong</p>
          <h1 className="mt-2 text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--color-on-surface)] sm:text-[32px]">
            화면을 여는 중 문제가 생겼어요
          </h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)]">
            잠시 후 다시 시도해 주세요. 계속 같은 화면이 나오면 아래 코드와 함께 문의해 주시면 원인을 찾는 데 도움이 됩니다.
          </p>
          {error.digest ? (
            <p className="mt-4 rounded-xl bg-[#f4f9ff] px-3 py-2 font-mono text-[12px] font-bold text-[#5b6b82]">
              오류 코드 {error.digest}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#fee500] px-5 text-sm font-black text-[#191600] shadow-[0_12px_26px_rgba(254,229,0,0.38)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            다시 시도
          </button>
          <Link
            href="/template"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cfe0ff] bg-white px-5 text-sm font-black text-[#2f6bbf] transition hover:-translate-y-0.5 hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
          >
            템플릿 둘러보기
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-black text-[#5b6b82] underline-offset-4 transition hover:text-[#2f6bbf] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
          >
            홈으로
          </Link>
        </div>

        <p className="text-xs font-semibold leading-6 text-[var(--color-outline)]">
          편집 중이던 내용이 있었다면 편집 화면으로 돌아가 확인해 주세요. 문제가 계속되면{" "}
          <Link href="/support" className="font-black text-[#2f6bbf] underline underline-offset-2">
            고객지원
          </Link>
          으로 알려주세요.
        </p>
      </section>
    </main>
  );
}
