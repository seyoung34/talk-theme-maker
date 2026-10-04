import { Suspense, type ReactNode } from "react";
import AdminConsoleShell from "@/components/admin/shell/AdminConsoleShell";
import AdminConsoleBadgeLoader from "@/components/admin/shell/AdminConsoleBadgeLoader";
import { getCurrentAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

/**
 * 관리자 콘솔 셸.
 *
 * 권한 판정과 로그인 이동은 각 page의 `requireAdmin`이 맡는다 — layout은 클라이언트 이동 때
 * 다시 실행되지 않고, 여기서 redirect하면 원래 가려던 경로(returnTo)를 알 수 없다. layout은
 * 관리자로 확인된 경우에만 service role 배지 조회를 하고, 아니면 배지 없이 셸만 그린다.
 */
export default async function AdminConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();
  return (
    <AdminConsoleShell badges={{}}>
      {admin.profile ? <Suspense fallback={null}><AdminConsoleBadgeLoader /></Suspense> : null}
      {children}
    </AdminConsoleShell>
  );
}
