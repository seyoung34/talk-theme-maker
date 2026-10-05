import AdminPromotionsClient from "@/components/admin/AdminPromotionsClient";
import { requireAdmin } from "@/lib/supabase/auth";
import { Suspense } from "react";
import { AdminPageLoadingState } from "@/components/admin/shell/AdminLoadingState";
import { listAdminGrantCodes } from "@/lib/admin/listData";
import { loadAdminInitialData, type AdminInitialData } from "@/lib/admin/initialData";
import type { SignupBonusCampaignDto } from "@/lib/billing/apiTypes";
import { getSignupBonusCampaign } from "@/lib/billing/signupBonusAdmin";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  await requireAdmin("/admin/promotions");
  const initialCampaign = loadAdminInitialData(getSignupBonusCampaign, "가입 혜택 캠페인을 불러오지 못했습니다.")
    .then((result): AdminInitialData<SignupBonusCampaignDto> => {
      if (!result.ok) return result;
      if (!result.value) return { ok: false, error: "가입 혜택 캠페인을 찾을 수 없습니다." };
      return { ok: true, value: result.value };
    });
  return <Suspense fallback={<AdminPageLoadingState />}><InitialPromotions initialCampaign={initialCampaign} /></Suspense>;
}

async function InitialPromotions({ initialCampaign }: { initialCampaign: Promise<AdminInitialData<SignupBonusCampaignDto>> }) {
  const initialData = await loadAdminInitialData(listAdminGrantCodes, "지급 코드 목록을 불러오지 못했습니다.");
  return <AdminPromotionsClient initialData={initialData} initialCampaign={initialCampaign} />;
}
