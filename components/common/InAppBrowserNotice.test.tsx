import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import InAppBrowserNotice from "@/components/common/InAppBrowserNotice";
import { saveAnalyticsConsent } from "@/lib/analytics/ga4";

describe("InAppBrowserNotice analytics consent coordination", () => {
  let userAgentDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://talktheme.shop");
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("https://talktheme.shop/template");
    userAgentDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
    Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: "Instagram 300" });
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    if (userAgentDescriptor) Object.defineProperty(window.navigator, "userAgent", userAgentDescriptor);
    else Reflect.deleteProperty(window.navigator, "userAgent");
    vi.unstubAllEnvs();
  });

  it("does not wait for an analytics consent decision on a preview origin", async () => {
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("https://preview-talktheme.workers.dev/template");

    render(<InAppBrowserNotice ready hasRecentWork={false} />);

    expect(await screen.findByRole("dialog", { name: "외부 브라우저 안내" })).toBeInTheDocument();
  });

  it("continues to wait for consent on the production origin", async () => {
    render(<InAppBrowserNotice ready hasRecentWork={false} />);

    expect(screen.queryByRole("dialog", { name: "외부 브라우저 안내" })).toBeNull();
    saveAnalyticsConsent("denied");
    expect(await screen.findByRole("dialog", { name: "외부 브라우저 안내" })).toBeInTheDocument();
  });
});
