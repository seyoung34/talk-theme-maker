import AdminMarketingClient from "@/components/admin/AdminMarketingClient";
import { requireAdmin } from "@/lib/supabase/auth";
import { Suspense } from "react";
import { AdminPageLoadingState } from "@/components/admin/shell/AdminLoadingState";
import { loadAdminMarketingReport } from "@/lib/admin/listData";
import { loadAdminInitialData } from "@/lib/admin/initialData";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireAdmin("/admin/analytics");
  return <Suspense fallback={<AdminPageLoadingState />}><InitialMarketing /></Suspense>;
}

async function InitialMarketing() {
  const initialData = await loadAdminInitialData(loadAdminMarketingReport, "지표를 불러오지 못했습니다.");
  return <AdminMarketingClient initialData={initialData} />;
}
