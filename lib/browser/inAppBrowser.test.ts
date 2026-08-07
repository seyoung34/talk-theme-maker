import { describe, expect, it } from "vitest";
import { buildAndroidExternalBrowserIntent, detectInAppBrowser, isAndroidUserAgent } from "@/lib/browser/inAppBrowser";

describe("in-app browser detection", () => {
  it("detects Instagram and other supported in-app browsers", () => {
    expect(detectInAppBrowser("Mozilla/5.0 Instagram 345.0.0.0.100")).toBe("instagram");
    expect(detectInAppBrowser("Mozilla/5.0 [FBAN/FB4A;FBAV/500.0]")).toBe("facebook");
    expect(detectInAppBrowser("Mozilla/5.0 KAKAOTALK")).toBe("kakaotalk");
    expect(detectInAppBrowser("Mozilla/5.0 TikTok 36.0")).toBe("tiktok");
  });

  it("detects Android WebView without flagging regular browsers", () => {
    expect(detectInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36; wv")).toBe("android-webview");
    expect(detectInAppBrowser("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36")).toBeNull();
    expect(isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36")).toBe(true);
    expect(isAndroidUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(false);
  });
});

describe("buildAndroidExternalBrowserIntent", () => {
  it("keeps the current UTM URL as the fallback", () => {
    const intent = buildAndroidExternalBrowserIntent("https://talktheme.shop/template?utm_source=instagram&utm_medium=social&utm_campaign=launch_2608");
    expect(intent).toContain("intent://talktheme.shop/template");
    expect(intent).toContain("scheme=https");
    expect(intent).toContain("S.browser_fallback_url=https%3A%2F%2Ftalktheme.shop%2Ftemplate%3Futm_source%3Dinstagram");
  });
});
