import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin("/admin");

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-8 md:px-8">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Admin</p>
        <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">개요</h1>
        <p className="mt-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">왼쪽 메뉴에서 관리 화면으로 이동합니다.</p>
      </header>
    </main>
  );
}
