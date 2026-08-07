export type InAppBrowser = "instagram" | "facebook" | "kakaotalk" | "tiktok" | "android-webview";

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  if (/Instagram/i.test(userAgent)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(userAgent)) return "facebook";
  if (/KAKAOTALK/i.test(userAgent)) return "kakaotalk";
  if (/TikTok|musical_ly/i.test(userAgent)) return "tiktok";
  if (/Android/i.test(userAgent) && /(?:\bwv\b|; wv\))/i.test(userAgent)) return "android-webview";
  return null;
}

export function isAndroidUserAgent(userAgent: string) {
  return /Android/i.test(userAgent);
}

/**
 * 외부 브라우저 실행을 시도할 때 쓸 Android Intent URL.
 * 브라우저·호스트 앱 정책으로 실행이 막히면 fallback URL로 돌아간다.
 */
export function buildAndroidExternalBrowserIntent(targetUrl: string) {
  const url = new URL(targetUrl);
  const fallbackUrl = encodeURIComponent(url.toString());
  const targetPath = `${url.host}${url.pathname}${url.search}${url.hash}`;
  return `intent://${targetPath}#Intent;scheme=${url.protocol.replace(":", "")};S.browser_fallback_url=${fallbackUrl};end`;
}
