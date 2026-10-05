import AdminNoticesClient from "@/components/admin/AdminNoticesClient";
import { requireAdmin } from "@/lib/supabase/auth";
import { Suspense } from "react";
import { AdminPageLoadingState } from "@/components/admin/shell/AdminLoadingState";
import { listAdminNotices } from "@/lib/admin/listData";
import { loadAdminInitialData } from "@/lib/admin/initialData";

export const dynamic = "force-dynamic";

export default async function AdminNoticesPage() {
  await requireAdmin("/admin/notices");
  return <Suspense fallback={<AdminPageLoadingState />}><InitialNotices /></Suspense>;
}

async function InitialNotices() {
  const initialData = await loadAdminInitialData(listAdminNotices, "공지 목록을 불러오지 못했습니다.");
  return <AdminNoticesClient initialData={initialData} />;
}
