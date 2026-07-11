"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { analyticsConsentStorageKey, getAnalyticsConsent, getAnalyticsMeasurementId, initializeAnalytics, trackAnalyticsEvent, type AnalyticsConsent } from "@/lib/analytics/ga4";

function AnalyticsPageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackAnalyticsEvent("page_view", { page_path: pathname });
  }, [pathname]);

  return null;
}

export default function AnalyticsProvider() {
  const measurementId = getAnalyticsMeasurementId();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);

  useEffect(() => {
    setConsent(getAnalyticsConsent());
  }, []);

  useEffect(() => {
    if (consent === "granted" && measurementId) initializeAnalytics(measurementId);
  }, [consent, measurementId]);

  const chooseConsent = (nextConsent: AnalyticsConsent) => {
    window.localStorage.setItem(analyticsConsentStorageKey, nextConsent);
    setConsent(nextConsent);
  };

  if (!measurementId) return null;

  return (
    <>
      {consent === "granted" ? <><Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" /><AnalyticsPageTracker /></> : null}
      {consent === null ? (
        <aside className="fixed inset-x-4 bottom-4 z-[200] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:flex sm:items-center sm:gap-4" role="dialog" aria-label="분석 쿠키 동의">
          <p className="text-sm font-medium leading-5 text-slate-700">서비스 이용 흐름을 익명으로 분석하기 위해 분석 쿠키를 사용합니다. 동의 전에는 분석 데이터를 수집하지 않습니다.</p>
          <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => chooseConsent("denied")}>거부</button>
            <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => chooseConsent("granted")}>동의</button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
