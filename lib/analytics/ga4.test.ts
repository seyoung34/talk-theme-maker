import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsConsentStorageKey,
  getAcquisitionContext,
  getAnalyticsBootstrapScript,
  saveAnalyticsConsent,
  trackAnalyticsEvent,
  trackPurchaseOnce,
} from "@/lib/analytics/ga4";

describe("GA4 analytics", () => {
  const gtag = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/template");
    window.gtag = gtag;
    gtag.mockClear();
  });

  it("queues denied consent before the GA config command", () => {
    const script = getAnalyticsBootstrapScript("G-TEST123");

    expect(script.indexOf('"consent","default"')).toBeLessThan(script.indexOf('"config",id'));
    expect(script.indexOf('"config",id')).toBeLessThan(script.indexOf('tag.src="https://www.googletagmanager.com/gtag/js'));
    expect(script).toContain('analytics_storage:stored==="granted"?"granted":"denied"');
    expect(script).toContain('ad_personalization:"denied"');
  });

  it("does not send product events before consent", () => {
    trackAnalyticsEvent("template_started", { template_key: "basic", template_source: "base", platform: "android" });

    expect(gtag).not.toHaveBeenCalled();
  });

  it("adds the saved template context to downstream events", () => {
    saveAnalyticsConsent("granted");
    trackAnalyticsEvent("template_started", { template_key: "basic", template_source: "base", platform: "android" });
    trackAnalyticsEvent("export_completed", { platform: "android", export_mode: "apk" });

    expect(gtag).toHaveBeenLastCalledWith("event", "export_completed", expect.objectContaining({
      landing_page: "/template",
      template_key: "basic",
      template_source: "base",
      platform: "android",
      export_mode: "apk",
    }));
  });

  it("allows only approved campaign values and strips referrer paths", () => {
    saveAnalyticsConsent("granted");
    window.history.replaceState({}, "", "/template?utm_source=instagram&utm_medium=social&utm_campaign=instagram_personal_launch&utm_content=private");

    expect(getAcquisitionContext("/template")).toEqual(expect.objectContaining({
      landing_page: "/template",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "instagram_personal_launch",
    }));
    expect(getAcquisitionContext("/template")).not.toHaveProperty("utm_content");
  });

  it("sends a purchase transaction only once per tab", () => {
    window.localStorage.setItem(analyticsConsentStorageKey, "granted");
    const params = { currency: "KRW", value: 1000, items: [{ item_id: "credit-1", item_name: "1 credit", price: 1000, quantity: 1 }] };

    trackPurchaseOnce("transaction-1", params);
    trackPurchaseOnce("transaction-1", params);

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "purchase", expect.objectContaining({ transaction_id: "transaction-1" }));
  });
});
