import AdminInquiriesClient from "@/components/admin/AdminInquiriesClient";
import { requireAdmin } from "@/lib/supabase/auth";
import { Suspense } from "react";
import { AdminPageLoadingState } from "@/components/admin/shell/AdminLoadingState";
import { listAdminInquiries } from "@/lib/admin/listData";
import { loadAdminInitialData } from "@/lib/admin/initialData";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage() {
  await requireAdmin("/admin/inquiries");
  return <Suspense fallback={<AdminPageLoadingState />}><InitialInquiries /></Suspense>;
}

async function InitialInquiries() {
  const initialData = await loadAdminInitialData(() => listAdminInquiries("open"), "문의 목록을 불러오지 못했습니다.");
  return <AdminInquiriesClient initialData={initialData} />;
}
