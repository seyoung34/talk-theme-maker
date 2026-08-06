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
    // `search`로 들어와도 저장은 GA4가 자연 검색으로 읽는 `organic`으로 한다. 이미 뿌린 링크를
    // 회수할 수 없으므로 입력은 옛 값을 받되 전송 값만 옮긴다.
    expect(getAcquisitionContext("/")).toEqual(expect.objectContaining({ utm_source: "naver", utm_medium: "organic", utm_campaign: "naver_search" }));

    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/?utm_source=untrusted&utm_medium=anything&utm_campaign=free-text");
    expect(getAcquisitionContext("/")).not.toEqual(expect.objectContaining({ utm_source: expect.anything(), utm_medium: expect.anything(), utm_campaign: expect.anything() }));
  });

  /**
   * GA4는 `page_location` 안의 `utm_*`를 읽어 세션 소스·매체·캠페인을 채우고, 그 값으로 채널
   * 그룹을 정한다. 예전에는 여기서 쿼리를 통째로 잘라 보내 캠페인 귀속이 끊겨 있었고,
   * 운영 속성에서 `Unassigned`가 최다 세션이었다. 그런데 이 파일에 `page_location` 검증이
   * 하나도 없어 결함이 그대로 통과했다.
   */
  it("carries approved campaign values in page_location so GA4 can attribute the session", () => {
    saveAnalyticsConsent("granted");
    window.history.replaceState({}, "", "/template?utm_source=instagram&utm_medium=social&utm_campaign=instagram_personal_launch");
    trackAnalyticsEvent("template_started", { template_key: "basic", template_source: "base", platform: "android" });

    const [, , params] = gtag.mock.calls.at(-1)!;
    expect(params.page_location).toContain("utm_source=instagram");
    expect(params.page_location).toContain("utm_medium=social");
    expect(params.page_location).toContain("utm_campaign=instagram_personal_launch");
  });

  it("rebuilds page_location instead of forwarding the original query", () => {
    // 원본 쿼리에는 로그인 returnTo·오류 코드처럼 무엇이든 들어올 수 있다. 그대로 보내면
    // 개인정보가 분석 도구로 샌다. 허용 목록을 통과한 값만 다시 조립해야 한다.
    saveAnalyticsConsent("granted");
    window.history.replaceState({}, "", "/template?utm_source=instagram&utm_medium=social&returnTo=%2Faccount&token=secret");
    trackAnalyticsEvent("template_started", { template_key: "basic", template_source: "base", platform: "android" });

    const [, , params] = gtag.mock.calls.at(-1)!;
    expect(params.page_location).toContain("utm_source=instagram");
    expect(params.page_location).not.toContain("returnTo");
    expect(params.page_location).not.toContain("token");
  });

  it("sends no campaign query when the visit has no approved UTM", () => {
    saveAnalyticsConsent("granted");
    window.history.replaceState({}, "", "/template");
    trackAnalyticsEvent("template_started", { template_key: "basic", template_source: "base", platform: "android" });

    const [, , params] = gtag.mock.calls.at(-1)!;
    expect(params.page_location).not.toContain("?");
  });

  it("rewrites the medium GA4 does not recognise", () => {
    // `search`는 GA4 채널 규칙에 없어 Unassigned 로 떨어진다. 자연 검색 규칙은 `organic`이다.
    saveAnalyticsConsent("granted");
    window.history.replaceState({}, "", "/?utm_source=naver&utm_medium=search&utm_campaign=naver_search");
    trackAnalyticsEvent("template_started", { template_key: "basic", template_source: "base", platform: "android" });

    const [, , params] = gtag.mock.calls.at(-1)!;
    expect(params.page_location).toContain("utm_medium=organic");
    expect(params.page_location).not.toContain("utm_medium=search");
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
