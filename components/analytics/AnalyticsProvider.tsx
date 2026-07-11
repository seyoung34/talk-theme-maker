"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { getAcquisitionContext, getAnalyticsConsent, getAnalyticsMeasurementId, initializeAnalytics, saveAnalyticsConsent, trackAnalyticsEvent, type AnalyticsConsent } from "@/lib/analytics/ga4";

function AnalyticsPageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackAnalyticsEvent("page_view", { page_path: pathname, ...getAcquisitionContext(pathname) });
  }, [pathname]);

  return null;
}

export default function AnalyticsProvider() {
  const measurementId = getAnalyticsMeasurementId();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    setConsent(getAnalyticsConsent());
  }, []);

  useEffect(() => {
    if (consent === "granted" && measurementId) initializeAnalytics(measurementId);
  }, [consent, measurementId]);

  const chooseConsent = (nextConsent: AnalyticsConsent) => {
    saveAnalyticsConsent(nextConsent);
    if (consent === "granted" && nextConsent === "denied") {
      window.location.reload();
      return;
    }
    setConsent(nextConsent);
    setIsSettingsOpen(false);
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
      {consent === "granted" ? <button type="button" className="fixed bottom-3 left-3 z-[200] rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200" onClick={() => setIsSettingsOpen(true)}>분석 쿠키 설정</button> : null}
      {isSettingsOpen ? <aside className="fixed inset-x-4 bottom-4 z-[201] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" role="dialog" aria-label="분석 쿠키 설정"><p className="text-sm font-medium leading-5 text-slate-700">분석 쿠키를 끄면 이 브라우저에서 이후 분석 이벤트를 전송하지 않습니다.</p><div className="mt-3 flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => setIsSettingsOpen(false)}>유지</button><button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => chooseConsent("denied")}>분석 쿠키 끄기</button></div></aside> : null}
    </>
  );
}
