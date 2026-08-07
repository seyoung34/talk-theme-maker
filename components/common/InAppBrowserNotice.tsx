"use client";

import { ExternalLink, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getAnalyticsConsent, getAnalyticsMeasurementId, analyticsConsentChangedEvent } from "@/lib/analytics/ga4";
import { buildAndroidExternalBrowserIntent, detectInAppBrowser, isAndroidUserAgent, type InAppBrowser } from "@/lib/browser/inAppBrowser";

const dismissedStorageKey = "talktheme:in-app-browser-notice-dismissed:v1";

type InAppBrowserNoticeProps = {
  ready: boolean;
  hasRecentWork: boolean;
};

export default function InAppBrowserNotice({ ready, hasRecentWork }: InAppBrowserNoticeProps) {
  const [browser, setBrowser] = useState<InAppBrowser | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [isDismissed, setIsDismissed] = useState(false);
  const [hasResolvedAnalyticsConsent, setHasResolvedAnalyticsConsent] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    const detected = detectInAppBrowser(userAgent);
    if (!detected) return;

    setBrowser(detected);
    setCurrentUrl(window.location.href);
    try {
      setIsDismissed(window.sessionStorage.getItem(dismissedStorageKey) === "1");
    } catch {
      // 일부 브라우저가 sessionStorage를 막아도 안내 자체는 계속 보여 준다.
    }
  }, []);

  useEffect(() => {
    const measurementId = getAnalyticsMeasurementId();
    const syncConsent = () => {
      // GA4가 설정되지 않은 환경에는 쿠키 동의 배너가 없으므로 바로 표시한다.
      setHasResolvedAnalyticsConsent(!measurementId || getAnalyticsConsent() !== null);
    };
    syncConsent();
    window.addEventListener(analyticsConsentChangedEvent, syncConsent);
    return () => window.removeEventListener(analyticsConsentChangedEvent, syncConsent);
  }, []);

  if (!ready || !browser || !currentUrl || isDismissed || !hasResolvedAnalyticsConsent) return null;

  const isAndroid = isAndroidUserAgent(navigator.userAgent);
  const browserUrl = isAndroid ? buildAndroidExternalBrowserIntent(currentUrl) : currentUrl;
  const isInstagram = browser === "instagram";

  const dismiss = () => {
    setIsDismissed(true);
    try {
      window.sessionStorage.setItem(dismissedStorageKey, "1");
    } catch {
      // 저장할 수 없으면 이번 렌더링에서만 닫는다.
    }
  };

  return (
    <aside className="relative rounded-[20px] border border-[#cfe0ff] bg-[#f7fbff] px-4 py-4 shadow-[0_12px_28px_rgba(47,107,191,0.07)] sm:px-5" aria-label="외부 브라우저 안내">
      <button type="button" onClick={dismiss} className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-[#7890ad] transition hover:bg-white hover:text-[#2f6bbf]" aria-label="외부 브라우저 안내 닫기">
        <X size={16} aria-hidden="true" />
      </button>
      <div className="flex gap-3 pr-8">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[#3d7bd6] ring-1 ring-[#dbe8fb]">
          <Info size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[var(--color-on-surface)]">{isInstagram ? "인스타그램 앱 안에서 열렸어요" : "앱 안의 브라우저에서 열렸어요"}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#5b6b82]">로그인과 테마 파일 다운로드는 외부 브라우저에서 더 안정적입니다.</p>
          {hasRecentWork ? <p className="mt-1 text-xs font-bold leading-5 text-[#b06b00]">이미 작업 중인 내용은 현재 브라우저에 저장되어 있어요. 브라우저를 바꾸면 최근 작업이 이어지지 않을 수 있습니다.</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-11">
        <a href={browserUrl} target={isAndroid ? undefined : "_blank"} rel="noopener noreferrer" onClick={dismiss} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-black text-white transition hover:bg-[#1d4ed8]">
          <ExternalLink size={14} aria-hidden="true" />
          외부 브라우저에서 열기
        </a>
        <button type="button" onClick={dismiss} className="inline-flex min-h-10 items-center rounded-full px-3 py-2 text-xs font-bold text-[#5b6b82] transition hover:bg-white hover:text-[#2f6bbf]">이 브라우저에서 계속</button>
        {!isAndroid ? <p className="basis-full text-[11px] font-semibold leading-5 text-[#7890ad]">iPhone은 오른쪽 아래 … 메뉴에서 “브라우저에서 열기”를 선택해 주세요.</p> : null}
      </div>
    </aside>
  );
}
