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

it("distinguishes a missing signup campaign from a failed query", async () => {
  mocks.requireAdmin.mockResolvedValue({});
  mocks.campaign.mockResolvedValue(null);
  const missingPage = await PromotionsPage();
  await expect(missingPage.props.children.props.initialCampaign).resolves.toEqual({
    ok: false, error: "가입 혜택 캠페인을 찾을 수 없습니다.",
  });
  mocks.campaign.mockRejectedValue(new Error("database unavailable"));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const failedPage = await PromotionsPage();
    await expect(failedPage.props.children.props.initialCampaign).resolves.toEqual({
      ok: false, error: "가입 혜택 캠페인을 불러오지 못했습니다.",
    });
  } finally { warning.mockRestore(); }
});

it("assets page delivers the list without scanning template usage", async () => {
  mocks.requireAdmin.mockResolvedValue({});
  mocks.assets.mockResolvedValue({ items: [], truncated: false });
  const page = await AssetsPage();
  const client = await page.props.children.type();
  expect(client.props.initialData).toEqual({ ok: true, value: { items: [], truncated: false } });
  expect(mocks.assets).toHaveBeenCalledWith("background");
  expect(mocks.usage).not.toHaveBeenCalled();
  expect(client.props).not.toHaveProperty("initialUsage");
});
