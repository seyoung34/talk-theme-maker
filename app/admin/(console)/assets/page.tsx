import AdminAssetsClient from "@/components/admin/AdminAssetsClient";
import { requireAdmin } from "@/lib/supabase/auth";
import { Suspense } from "react";
import { AdminPageLoadingState } from "@/components/admin/shell/AdminLoadingState";
import { loadAdminInitialData, type AdminInitialData } from "@/lib/admin/initialData";
import type { AdminAssetUsageIndex } from "@/lib/theme/adminAssetUsage";
import { readAdminAssetList } from "@/lib/theme/server/adminAssetList";
import { readAdminAssetUsageIndex } from "@/lib/theme/server/adminAssetUsage";

export const dynamic = "force-dynamic";

export default async function AdminAssetsPage() {
  await requireAdmin("/admin/assets");

  const initialUsage = loadAdminInitialData(readAdminAssetUsageIndex, "연결 정보를 불러오지 못했습니다. 다시 조회해 주세요.");
  return <Suspense fallback={<AdminPageLoadingState />}><InitialAssets initialUsage={initialUsage} /></Suspense>;
}

async function InitialAssets({ initialUsage }: { initialUsage: Promise<AdminInitialData<AdminAssetUsageIndex>> }) {
  const initialData = await loadAdminInitialData(() => readAdminAssetList("background"), "관리 후보를 불러오지 못했습니다.");
  return <AdminAssetsClient initialData={initialData} initialUsage={initialUsage} />;
}
