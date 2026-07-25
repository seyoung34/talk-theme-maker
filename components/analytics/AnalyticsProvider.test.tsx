import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import { analyticsConsentStorageKey } from "@/lib/analytics/ga4";

let pathname = "/template";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("AnalyticsProvider", () => {
  const gtag = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    document.cookie = "talktheme_analytics_consent=; Path=/; Max-Age=0";
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.gtag = gtag;
    gtag.mockClear();
    pathname = "/template";
  });

  afterEach(() => cleanup());

  it("accepts consent and sends the current page view once", async () => {
    render(createElement(AnalyticsProvider));

    fireEvent.click(await screen.findByRole("button", { name: "동의" }));

    await waitFor(() => expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe("granted"));
    expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "granted" });
    expect(gtag).toHaveBeenCalledWith("event", "page_view", expect.objectContaining({ page_path: "/template" }));
    expect(gtag.mock.calls.filter((call) => call[0] === "event" && call[1] === "page_view")).toHaveLength(1);
  });

  it("persists rejection without sending a page view", async () => {
    render(createElement(AnalyticsProvider));

    fireEvent.click(await screen.findByRole("button", { name: "거부" }));

    await waitFor(() => expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe("denied"));
    expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "denied" });
    expect(gtag.mock.calls.some((call) => call[0] === "event")).toBe(false);
  });

  it("lets a returning user revoke analytics consent", async () => {
    window.localStorage.setItem(analyticsConsentStorageKey, "granted");
    render(createElement(AnalyticsProvider));

    fireEvent.click(await screen.findByRole("button", { name: "분석 쿠키 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "분석 쿠키 끄기" }));

    await waitFor(() => expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe("denied"));
    expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "denied" });
  });

  it("lets a returning user grant consent after rejecting it", async () => {
    window.localStorage.setItem(analyticsConsentStorageKey, "denied");
    render(createElement(AnalyticsProvider));

    fireEvent.click(await screen.findByRole("button", { name: "분석 쿠키 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "분석 쿠키 켜기" }));

    await waitFor(() => expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe("granted"));
    expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "granted" });
    expect(gtag).toHaveBeenCalledWith("event", "page_view", expect.objectContaining({ page_path: "/template" }));
  });

  it("hides consent controls on the editor route without changing saved consent", async () => {
    pathname = "/edit";
    window.localStorage.setItem(analyticsConsentStorageKey, "granted");

    render(createElement(AnalyticsProvider));

    await waitFor(() => expect(gtag).toHaveBeenCalledWith("event", "page_view", expect.objectContaining({ page_path: "/edit" })));
    expect(screen.queryByRole("button", { name: "분석 쿠키 설정" })).toBeNull();
    expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe("granted");
  });
});
