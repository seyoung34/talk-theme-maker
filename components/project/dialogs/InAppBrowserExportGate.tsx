"use client";

import { ExternalLink, X } from "lucide-react";
import { buildAndroidExternalBrowserIntent, isAndroidUserAgent, type InAppBrowser } from "@/lib/browser/inAppBrowser";

/**
 * 인앱 브라우저에서 다운로드를 누른 순간 한 번 끼어드는 안내.
 *
 * 내보내기는 크레딧을 쓴다. 인앱 브라우저는 `blob:` + `download` 조합을 처리하지 못해 파일만 조용히
 * 오지 않으므로, 빌드가 시작되기 전에 알린다. 크레딧이 나간 뒤에 알리면 이미 늦다.
 *
 * 막지는 않는다. 감지가 UA 문자열 기반이라 오탐이 가능하고, 그때 결제한 사용자의 다운로드를 완전히
 * 가로막는 쪽이 더 나쁘다. 대신 기본 행동을 외부 브라우저로 두고 계속하기는 약하게 둔다.
 */
export function InAppBrowserExportGate({
  browser,
  currentUrl,
  onContinue,
  onClose,
}: {
  browser: InAppBrowser;
  currentUrl: string;
  onContinue: () => void;
  onClose: () => void;
}) {
  const isAndroid = typeof navigator !== "undefined" && isAndroidUserAgent(navigator.userAgent);
  const externalUrl = isAndroid ? buildAndroidExternalBrowserIntent(currentUrl) : currentUrl;
  const isInstagram = browser === "instagram";

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="외부 브라우저 안내">
      <section className="grid w-full max-w-[420px] gap-4 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="grid gap-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#0f172a]">{isInstagram ? "인스타그램 앱 안에서는 받을 수 없어요" : "앱 안의 브라우저에서는 받기 어려워요"}</h2>
            <button
              type="button"
              className="-mr-1.5 grid size-11 shrink-0 place-items-center rounded-full text-[#475569] transition hover:bg-[#f1f5f9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              onClick={onClose}
              aria-label="닫기"
            >
              <X size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
          <p className="text-sm leading-6 text-[#64748b]">
            외부 브라우저에서 열면 파일을 정상적으로 받을 수 있습니다.
          </p>
          {/* 크레딧은 파일을 받기 전에 빠져나간다. 무엇을 잃을 수 있는지 먼저 알린다. */}
          <p className="mt-1 text-sm font-semibold leading-6 text-[#b06b00]">
            여기서 계속하면 크레딧은 사용되고 파일만 오지 않을 수 있습니다. 그때는 마이페이지에서 다시 받을 수 있습니다.
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
            편집 내용은 지금 이 브라우저에만 저장됩니다. 외부 브라우저로 옮기면 작업이 따라가지 않습니다.
          </p>
        </div>
        <div className="grid gap-2">
          <a
            href={externalUrl}
            target={isAndroid ? undefined : "_blank"}
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0f172a] px-4 text-sm font-semibold text-white transition hover:bg-[#1e293b]"
          >
            <ExternalLink size={15} aria-hidden="true" />
            외부 브라우저에서 열기
          </a>
          <button type="button" className="min-h-11 rounded-xl border border-[#d1d5db] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fafc]" onClick={onContinue}>
            그래도 여기서 계속
          </button>
          {!isAndroid ? <p className="text-center text-[11px] font-semibold leading-5 text-[#7890ad]">iPhone은 오른쪽 아래 … 메뉴에서 “브라우저에서 열기”를 선택해 주세요.</p> : null}
        </div>
      </section>
    </div>
  );
}
