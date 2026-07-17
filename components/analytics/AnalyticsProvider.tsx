"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { getAcquisitionContext, getAnalyticsConsent, getAnalyticsMeasurementId, saveAnalyticsConsent, trackAnalyticsEvent, updateAnalyticsConsent, type AnalyticsConsent } from "@/lib/analytics/ga4";

function AnalyticsPageTracker({ consent }: { consent: AnalyticsConsent | null }) {
  const pathname = usePathname();

  useEffect(() => {
    // Also re-fires when consent flips to "granted" (component stays mounted across the consent
    // transition now), since that's the point at which the pending page_view should actually send.
    if (consent !== "granted") return;
    trackAnalyticsEvent("page_view", { page_path: pathname, ...getAcquisitionContext(pathname) });
  }, [pathname, consent]);

  return null;
}

export default function AnalyticsProvider() {
  const measurementId = getAnalyticsMeasurementId();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const initialConsent = getAnalyticsConsent();
    setConsent(initialConsent);
  }, []);

  const chooseConsent = (nextConsent: AnalyticsConsent) => {
    saveAnalyticsConsent(nextConsent);
    updateAnalyticsConsent(nextConsent);
    setConsent(nextConsent);
    setIsSettingsOpen(false);
  };

  if (!measurementId) return null;

  return (
    <>
      <AnalyticsPageTracker consent={consent} />
      {consent === null ? (
        <aside className="fixed inset-x-4 bottom-4 z-[200] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:flex sm:items-center sm:gap-4" role="dialog" aria-label="분석 쿠키 동의">
          <p className="text-sm font-medium leading-5 text-slate-700">서비스 이용 흐름을 분석하기 위해 분석 쿠키를 사용합니다. 동의 전에는 분석 쿠키와 사용자 행동 이벤트를 수집하지 않습니다. <Link href="/privacy" className="font-semibold underline underline-offset-2">개인정보 처리방침</Link></p>
          <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => chooseConsent("denied")}>거부</button>
            <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => chooseConsent("granted")}>동의</button>
          </div>
        </aside>
      ) : null}
      {consent !== null ? (
        <button
          type="button"
          className="fixed bottom-3 left-3 z-[200] grid size-10 place-items-center rounded-full bg-white/90 text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
          aria-label="분석 쿠키 설정"
          title="분석 쿠키 설정"
          onClick={() => setIsSettingsOpen(true)}
        >
          <Cookie size={18} aria-hidden="true" />
        </button>
      ) : null}
      {isSettingsOpen ? (
        <aside className="fixed inset-x-4 bottom-4 z-[201] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" role="dialog" aria-label="분석 쿠키 설정">
          <p className="text-sm font-medium leading-5 text-slate-700">{consent === "granted" ? "분석 쿠키를 끄면 이 브라우저에서 이후 분석 이벤트를 전송하지 않습니다." : "분석 쿠키를 켜면 동의 이후의 서비스 이용 흐름을 분석합니다."} <Link href="/privacy" className="font-semibold underline underline-offset-2">개인정보 처리방침</Link></p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => setIsSettingsOpen(false)}>{consent === "granted" ? "유지" : "닫기"}</button>
            <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => chooseConsent(consent === "granted" ? "denied" : "granted")}>{consent === "granted" ? "분석 쿠키 끄기" : "분석 쿠키 켜기"}</button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
