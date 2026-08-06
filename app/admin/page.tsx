import Link from "next/link";
import { ArrowRight, Gift, Megaphone, MessageSquare, TrendingUp } from "lucide-react";
import AdminSystemTemplateEntryCard from "@/components/admin/AdminSystemTemplateEntryCard";
import AdminSystemTemplateList from "@/components/admin/AdminSystemTemplateList";
import SiteHeader from "@/components/layout/SiteHeader";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin("/admin");

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/admin" />

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 md:px-8">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Admin</p>
          <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">관리자 페이지</h1>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AdminSystemTemplateEntryCard />

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

          <Link
            href="/admin/notices"
            className="group grid min-h-[160px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]"
          >
            <div>
              <span className="mb-3 grid size-9 place-items-center rounded-xl bg-[var(--color-primary-container)]"><Megaphone className="size-4" aria-hidden="true" /></span>
              <strong className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">Notices</strong>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">서비스 공지를 작성하고 발행 시점을 관리합니다.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)]">열기<ArrowRight className="h-4 w-4" /></span>
          </Link>

          <Link
            href="/admin/inquiries"
            className="group grid min-h-[160px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]"
          >
            <div>
              <span className="mb-3 grid size-9 place-items-center rounded-xl bg-[var(--color-primary-container)]"><MessageSquare className="size-4" aria-hidden="true" /></span>
              <strong className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">Inquiries</strong>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">사용자 문의를 확인하고 답변합니다.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)]">열기<ArrowRight className="h-4 w-4" /></span>
          </Link>

          <Link
            href="/admin/marketing"
            className="group grid min-h-[160px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]"
          >
            <div>
              <span className="mb-3 grid size-9 place-items-center rounded-xl bg-[var(--color-primary-container)]"><TrendingUp className="size-4" aria-hidden="true" /></span>
              <strong className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">Marketing</strong>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">홍보 링크 클릭과 주간 전환을 한 화면에서 봅니다.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)]">열기<ArrowRight className="h-4 w-4" /></span>
          </Link>

          <Link
            href="/admin/promotions"
            className="group grid min-h-[160px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]"
          >
            <div>
              <span className="mb-3 grid size-9 place-items-center rounded-xl bg-[var(--color-primary-container)]"><Gift className="size-4" aria-hidden="true" /></span>
              <strong className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">Promotions</strong>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">크레딧 지급 코드를 생성하고 사용 현황을 관리합니다.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)]">열기<ArrowRight className="h-4 w-4" /></span>
          </Link>
        </section>

        <AdminSystemTemplateList />
      </div>
    </main>
  );
}
