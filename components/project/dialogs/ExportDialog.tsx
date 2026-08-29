"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { persistenceNotice } from "@/lib/theme/project/persistenceNotice";
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";
import { Archive, Download, LoaderCircle, Package, X } from "lucide-react";
import { getExportNotice, getExportProgressSteps, getExportWaitNotice } from "@/components/project/exportClient";
import type { AccountState, ExportDownloadResult, ExportMode } from "@/components/project/exportModel";
import type { ThemePlatform } from "@/lib/theme/types";

export function ExportDialog({
  isExporting, isExportQueued, isPreparingExport, preparationError, downloadResult, platform, exportMode, exportName, progressStep,
  elapsedSeconds, accountState, isAccountLoading, onClose, onModeChange, onNameChange,
  onLogin, onBuyCredits, onRetryPreparation, onSubmit,
}: {
  isExporting: boolean; isExportQueued: boolean; isPreparingExport: boolean; preparationError: string | null; downloadResult: ExportDownloadResult | null; platform: ThemePlatform; exportMode: ExportMode;
  exportName: string; progressStep: number; elapsedSeconds: number; accountState: AccountState | null;
  isAccountLoading: boolean; onClose: () => void; onModeChange: (mode: ExportMode) => void; onNameChange: (value: string) => void;
  onLogin: () => void; onBuyCredits: () => void; onRetryPreparation: () => void; onSubmit: () => void;
}) {
  const steps = getExportProgressSteps(exportMode);
  const exportNameError = platform === "ios" && (exportName.trim().length === 0 || exportName.trim().length > 80) ? "테마 이름은 1~80자로 입력해 주세요." : null;
  const canSubmit = exportName.trim().length > 0 && !exportNameError;
  const isLoggedIn = Boolean(accountState?.user);
  const credits = accountState?.credits ?? 0;
  const hasCredits = credits >= 1;
  const ctaLabel = !isLoggedIn ? "로그인·가입 후 받기" : !hasCredits ? "크레딧 충전" : "테마 파일 받기";
  const canCloseWhileExporting = !isExporting || isExportQueued;
  const waitNotice = getExportWaitNotice(exportMode);
  const dialogTitle = isPreparingExport
    ? "다운로드 정보를 준비하는 중입니다"
    : downloadResult
      ? "다운로드를 시작했어요"
      : isExportQueued
        ? "다운로드 작업이 접수됐어요"
        : platform === "android" ? "Android 테마 파일 받기" : "iPhone 테마 파일 받기";
  const dialogDescription = isPreparingExport
    ? "버전 정보와 계정 상태를 확인하고 있습니다."
    : downloadResult
      ? "파일을 받은 뒤 아래 순서로 설치하거나 공유해 주세요."
      : isExportQueued
        ? "파일은 백그라운드에서 생성됩니다. 이 창을 닫으면 마이페이지에서 결과를 확인할 수 있습니다."
    : "완성된 테마 파일을 받아 카카오톡에 적용합니다.";

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && canCloseWhileExporting) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-[rgba(15,23,42,0.48)] backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] grid max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[22px] border border-[#e2e8f0] bg-white shadow-[0_24px_72px_rgba(15,23,42,0.24)] focus:outline-none" onEscapeKeyDown={(event) => { if (isExporting && !isExportQueued) event.preventDefault(); }} onPointerDownOutside={(event) => { if (isExporting && !isExportQueued) event.preventDefault(); }}>
          <div className="flex items-start justify-between gap-4 border-b border-[#e2e8f0] px-5 py-4">
            <div className="grid gap-1"><Dialog.Title className="text-lg font-bold text-[#0f172a]">{dialogTitle}</Dialog.Title><Dialog.Description className="text-xs font-medium text-[#64748b]">{dialogDescription}</Dialog.Description></div>
            <Dialog.Close asChild><button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40" disabled={!canCloseWhileExporting} aria-label="다운로드 창 닫기"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1]">
            {isExporting ? (
              <div className="grid min-h-56 place-content-center gap-5 py-4 text-center" role="status" aria-live="polite">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><Download className="animate-pulse" size={22} aria-hidden="true" /></span>
                <div>
                  <p className="text-base font-bold text-[#0f172a]">{isExportQueued ? "파일을 백그라운드에서 만들고 있어요." : getExportNotice(exportMode)}</p>
                  <p className="mt-2 text-sm font-medium text-[#64748b]">{steps[Math.min(progressStep, steps.length - 1)]} · {formatElapsedTime(elapsedSeconds)}</p>
                </div>
                <div className="mx-auto h-2 w-56 max-w-full overflow-hidden rounded-full bg-[#e2e8f0]"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#2563eb]" /></div>
                {waitNotice ? <p className="rounded-xl border border-[#dbeafe] bg-[#f8fbff] px-3 py-2 text-xs font-semibold leading-5 text-[#36577f]">{waitNotice}</p> : null}
                {isExportQueued ? <p className="text-xs font-medium leading-5 text-[#64748b]">작업 접수 완료 · 이 창을 닫아도 계속 진행됩니다. <Link href="/account" className="font-bold text-[#2563eb] underline underline-offset-2">마이페이지에서 상태 확인</Link></p> : <p className="text-xs font-medium leading-5 text-[#64748b]">{waitNotice ? "작업을 접수하는 동안 이 창을 유지해 주세요. 접수 후에는 닫아도 됩니다." : "파일 생성과 다운로드가 끝날 때까지 이 창을 유지해 주세요."}</p>}
              </div>
            ) : downloadResult ? <DownloadComplete result={downloadResult} /> : isPreparingExport ? <div className="grid min-h-56 place-content-center gap-4 py-4 text-center" role="status" aria-live="polite"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><LoaderCircle className="animate-spin" size={22} aria-hidden="true" /></span><div><p className="text-base font-bold text-[#0f172a]">다운로드 정보를 준비하는 중입니다</p><p className="mt-2 text-sm font-medium text-[#64748b]">버전 정보를 불러오고 계정 상태를 확인하고 있습니다.</p></div></div> : preparationError ? <div className="grid min-h-56 place-content-center gap-3 py-4 text-center" role="alert"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#fef2f2] text-[#dc2626]"><X size={22} aria-hidden="true" /></span><div><p className="text-base font-bold text-[#0f172a]">다운로드 정보를 준비하지 못했습니다</p><p className="mt-2 max-w-md text-sm font-medium leading-6 text-[#64748b]">{preparationError}</p></div></div> : <>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* applicationId·identifier 자동 발급은 사용자가 선택하거나 확인할 것이 없는 내부 동작이라 안내하지 않는다. */}
                <Field label={platform === "android" ? "앱 이름" : "테마 이름"} value={exportName} disabled={isExporting} error={exportNameError} onChange={onNameChange} />
              </div>
              <div className="grid gap-2 mt-4 sm:grid-cols-2" role="radiogroup" aria-label="출력 형식">
                {platform === "ios" ? <ModeButton selected={exportMode === "ktheme"} onClick={() => onModeChange("ktheme")} disabled={isExporting} label="카카오톡으로 공유·적용" description=".ktheme · 기본 추천" /> : <>
                  <ModeButton selected={exportMode === "apk"} onClick={() => onModeChange("apk")} disabled={isExporting} label="내가 바로 설치" description=".apk · 이 Android 기기에 설치" icon={<Package size={16} aria-hidden="true" />} />
                  <ModeButton selected={exportMode === "apk-zip"} onClick={() => onModeChange("apk-zip")} disabled={isExporting} label="카카오톡으로 공유하기 쉬운 파일" description=".apk를 한 번 압축한 .zip · 받은 뒤 압축 해제" icon={<Archive size={16} aria-hidden="true" />} />
                </>}
              </div>
              <div className="mt-4 grid gap-2 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-[#475569]">필요 크레딧 <strong className="ml-1 text-[#0f172a]">1개</strong></span><span className="font-semibold text-[#475569]">보유 <strong className={`ml-1 ${hasCredits ? "text-emerald-700" : "text-rose-700"}`}>{isAccountLoading ? "확인 중" : `크레딧 ${credits}개`}</strong></span></div>{accountState?.signupBonus ? <p className="text-xs font-semibold leading-5 text-[#695600]">가입 혜택 지급 내역은 마이페이지에서 확인할 수 있어요.</p> : null}</div>
              <p className="mt-3 text-xs font-medium leading-5 text-[#64748b]">{persistenceNotice.browserDetailed} {persistenceNotice.exportTemporary} <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2563eb] underline underline-offset-2">자세히 보기</Link></p>
            </>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#e2e8f0] bg-white px-5 py-4"><button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={!canCloseWhileExporting}>{downloadResult || isExportQueued ? "닫기" : "취소"}</button>{preparationError ? <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white" onClick={onRetryPreparation}>다시 시도</button> : !isPreparingExport && !downloadResult && !isExporting ? <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={!isLoggedIn ? onLogin : !hasCredits ? onBuyCredits : onSubmit} disabled={isAccountLoading || (isLoggedIn && hasCredits && !canSubmit)}>{ctaLabel}</button> : null}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, value, disabled, error, onChange }: { label: string; value: string; disabled: boolean; error: string | null; onChange: (value: string) => void }) {
  return <label className="grid gap-2"><span className="text-sm font-semibold text-[#0f172a]">{label}</span><input type="text" value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled} aria-invalid={Boolean(error)} className={`h-11 rounded-xl border bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb] ${error ? "border-[#ef4444]" : "border-[#d1d5db]"}`} />{error ? <span className="text-xs font-medium text-[#dc2626]">{error}</span> : null}</label>;
}

function ModeButton({ selected, onClick, disabled, label, description, icon }: { selected: boolean; onClick: () => void; disabled: boolean; label: string; description?: string; icon?: React.ReactNode }) {
  return <button type="button" role="radio" aria-checked={selected} className={`rounded-2xl border px-4 py-3 text-left ${selected ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`} onClick={onClick} disabled={disabled}><span className={`flex items-center gap-2 text-sm font-semibold text-[#0f172a]${icon ? "" : " block"}`}>{icon}{label}</span>{description ? <span className="mt-1 block text-xs font-medium text-[#64748b]">{description}</span> : null}</button>;
}

function DownloadComplete({ result }: { result: ExportDownloadResult }) {
  const steps = result.platform === "android"
    ? result.mode === "apk-zip"
      ? ["다운로드한 ZIP 파일을 카카오톡 대화방에 공유합니다.", "받은 기기에서 ZIP 압축을 풀고 APK를 설치합니다."]
      : ["다운로드 폴더에서 APK 파일을 엽니다.", "설치를 마친 뒤 테마 앱을 열어 적용합니다."]
    : [".ktheme 파일을 카카오톡 대화방으로 공유하거나 iPhone에 저장합니다.", "파일을 카카오톡으로 열어 테마를 적용합니다."];

  return <div className="grid min-h-56 place-content-center gap-4 py-4 text-center" role="status" aria-live="polite">
    <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#ecfdf5] text-[#059669]"><Download size={22} aria-hidden="true" /></span>
    <div><p className="text-base font-bold text-[#0f172a]">파일 다운로드를 시작했습니다</p><p className="mt-2 max-w-md break-all text-sm font-medium text-[#64748b]">{result.fileName}</p></div>
    <ol className="grid gap-2 rounded-xl border border-[#dbeafe] bg-[#f8fbff] p-4 text-left text-sm font-medium leading-6 text-[#334155]">{steps.map((step, index) => <li key={step} className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#2563eb] text-[11px] font-bold text-white">{index + 1}</span><span>{step}</span></li>)}</ol>
    <div className="grid gap-2 sm:grid-cols-2">
      <button type="button" className="min-h-11 rounded-xl bg-[#ecfdf5] px-3 text-sm font-bold text-[#047857]" onClick={() => trackAnalyticsEvent("install_confirmed", { platform: result.platform })}>설치·적용 완료</button>
      <Link href={`/guide?platform=${result.platform}`} onClick={() => trackAnalyticsEvent("install_help_requested", { platform: result.platform })} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#bfdbfe] px-3 text-sm font-semibold text-[#2563eb]">적용 방법 자세히 보기</Link>
    </div>
  </div>;
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
