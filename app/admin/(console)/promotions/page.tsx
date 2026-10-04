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
  const initialCampaign = loadAdminInitialData(async () => {
    const campaign = await getSignupBonusCampaign();
    if (!campaign) throw new Error("signup_bonus_campaign_missing");
    return campaign;
  }, "가입 혜택 캠페인을 불러오지 못했습니다.");
  return <Suspense fallback={<AdminPageLoadingState />}><InitialPromotions initialCampaign={initialCampaign} /></Suspense>;
}

async function InitialPromotions({ initialCampaign }: { initialCampaign: Promise<AdminInitialData<SignupBonusCampaignDto>> }) {
  const initialData = await loadAdminInitialData(listAdminGrantCodes, "지급 코드 목록을 불러오지 못했습니다.");
  return <AdminPromotionsClient initialData={initialData} initialCampaign={initialCampaign} />;
}
