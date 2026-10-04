import { beforeEach, expect, it, vi } from "vitest";
import InquiriesPage from "@/app/admin/(console)/inquiries/page";
import NoticesPage from "@/app/admin/(console)/notices/page";
import AnalyticsPage from "@/app/admin/(console)/analytics/page";
import PromotionsPage from "@/app/admin/(console)/promotions/page";
import AssetsPage from "@/app/admin/(console)/assets/page";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), load: vi.fn(), campaign: vi.fn(), assets: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/listData", () => ({ listAdminInquiries: mocks.load, listAdminNotices: mocks.load, loadAdminMarketingReport: mocks.load, listAdminGrantCodes: mocks.load }));
vi.mock("@/lib/billing/signupBonusAdmin", () => ({ getSignupBonusCampaign: mocks.campaign }));
vi.mock("@/lib/theme/server/adminAssetList", () => ({ readAdminAssetList: mocks.assets }));
vi.mock("@/lib/theme/server/adminAssetUsage", () => ({ readAdminAssetUsageIndex: mocks.usage }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockRejectedValue(new Error("redirect: unauthorized"));
});

it.each([
  ["/admin/inquiries", InquiriesPage], ["/admin/notices", NoticesPage], ["/admin/analytics", AnalyticsPage],
  ["/admin/promotions", PromotionsPage], ["/admin/assets", AssetsPage],
])("%s authorizes before any initial service-role read", async (path, page) => {
  await expect(page()).rejects.toThrow("unauthorized");
  expect(mocks.requireAdmin).toHaveBeenCalledWith(path);
  for (const load of [mocks.load, mocks.campaign, mocks.assets, mocks.usage]) expect(load).not.toHaveBeenCalled();
});
