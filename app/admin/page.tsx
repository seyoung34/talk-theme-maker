import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/admin" />

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 md:px-8">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Admin</p>
          <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">관리자 페이지</h1>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/admin/assets"
            className="group grid min-h-[160px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]"
          >
            <div>
              <strong className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">Assets</strong>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">이미지 슬롯에 사용할 관리 후보를 추가하고 삭제합니다.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)]">
              열기
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </section>
      </div>
    </main>
  );
}
