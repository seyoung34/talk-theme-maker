import AdminAssetsClient from "@/components/admin/AdminAssetsClient";
import { requireAdmin } from "@/lib/supabase/auth";
import { Suspense } from "react";
import { AdminPageLoadingState } from "@/components/admin/shell/AdminLoadingState";
import { loadAdminInitialData } from "@/lib/admin/initialData";
import { readAdminAssetList } from "@/lib/theme/server/adminAssetList";

export const dynamic = "force-dynamic";

export default async function AdminAssetsPage() {
  await requireAdmin("/admin/assets");

  // Usage scanning stays in its own API request so it does not share the page's Worker CPU budget.
  return <Suspense fallback={<AdminPageLoadingState />}><InitialAssets /></Suspense>;
}

async function InitialAssets() {
  const initialData = await loadAdminInitialData(() => readAdminAssetList("background"), "관리 후보를 불러오지 못했습니다.");
  return <AdminAssetsClient initialData={initialData} />;
}
