import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsConsentStorageKey,
  analyticsInternalStorageKey,
  getAcquisitionContext,
  getAnalyticsBootstrapScript,
  isInternalTraffic,
  markInternalTraffic,
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
    // 동의·내부 트래픽 플래그는 쿠키에도 남는다. 지우지 않으면 앞 테스트가 뒤 테스트에 샌다.
    for (const entry of document.cookie.split(";")) {
      const name = entry.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
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

  it("keeps expanded UTM values on the allowlist and drops arbitrary values", () => {
    saveAnalyticsConsent("granted");
    window.history.replaceState({}, "", "/?utm_source=naver&utm_medium=search&utm_campaign=naver_search");
    expect(getAcquisitionContext("/")).toEqual(expect.objectContaining({ utm_source: "naver", utm_medium: "search", utm_campaign: "naver_search" }));

    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/?utm_source=untrusted&utm_medium=anything&utm_campaign=free-text");
    expect(getAcquisitionContext("/")).not.toEqual(expect.objectContaining({ utm_source: expect.anything(), utm_medium: expect.anything(), utm_campaign: expect.anything() }));
  });

  it("tags events from a device marked as internal traffic", () => {
    window.localStorage.setItem(analyticsConsentStorageKey, "granted");
    markInternalTraffic();

    trackAnalyticsEvent("page_view", { page_path: "/template" });

    expect(gtag).toHaveBeenCalledWith("event", "page_view", expect.objectContaining({ traffic_type: "internal" }));
  });

  it("leaves normal visitor events untagged", () => {
    window.localStorage.setItem(analyticsConsentStorageKey, "granted");

    trackAnalyticsEvent("page_view", { page_path: "/template" });

    expect(gtag).toHaveBeenCalledWith("event", "page_view", expect.not.objectContaining({ traffic_type: expect.anything() }));
  });

  it("keeps the internal mark when localStorage is unavailable, via the cookie fallback", () => {
    markInternalTraffic();
    window.localStorage.removeItem(analyticsInternalStorageKey);

    expect(isInternalTraffic()).toBe(true);
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
