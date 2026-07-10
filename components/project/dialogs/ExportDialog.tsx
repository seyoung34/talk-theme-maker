"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Archive, Download, LoaderCircle, Package, ShieldCheck, Wrench, X } from "lucide-react";
import { getExportNotice, getExportProgressSteps } from "@/components/project/exportClient";
import type { AccountState, ExportMode } from "@/components/project/exportModel";
import type { ThemePlatform } from "@/lib/theme/types";

export function ExportDialog({
  isExporting, isPreparingExport, preparationError, platform, exportMode, exportName, exportVersionName, progressStep,
  elapsedSeconds, accountState, isAccountLoading, onClose, onModeChange, onNameChange, onVersionNameChange,
  onLogin, onBuyCredits, onRetryPreparation, onSubmit,
}: {
  isExporting: boolean; isPreparingExport: boolean; preparationError: string | null; platform: ThemePlatform; exportMode: ExportMode;
  exportName: string; exportVersionName: string; progressStep: number; elapsedSeconds: number; accountState: AccountState | null;
  isAccountLoading: boolean; onClose: () => void; onModeChange: (mode: ExportMode) => void; onNameChange: (value: string) => void;
  onVersionNameChange: (value: string) => void; onLogin: () => void; onBuyCredits: () => void; onRetryPreparation: () => void; onSubmit: () => void;
}) {
  const steps = getExportProgressSteps(exportMode);
  const exportNameError = platform === "ios" && (exportName.trim().length === 0 || exportName.trim().length > 80) ? "테마 이름은 1~80자로 입력해 주세요." : null;
  const versionNameError = platform === "ios" && !/^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/.test(exportVersionName.trim()) ? "영문, 숫자, 점, 밑줄, 하이픈으로 32자 이하로 입력해 주세요." : null;
  const canSubmit = exportName.trim().length > 0 && exportVersionName.trim().length > 0 && !exportNameError && !versionNameError;
  const isLoggedIn = Boolean(accountState?.user);
  const credits = accountState?.credits ?? 0;
  const hasCredits = credits >= 1;
  const isAdmin = accountState?.isAdmin ?? false;
  const ctaLabel = !isLoggedIn ? "로그인 후 내보내기" : !hasCredits ? "크레딧 충전" : exportMode === "apk" ? "APK 내보내기" : exportMode === "apk-zip" ? "APK ZIP 내보내기" : exportMode === "project" ? "프로젝트 ZIP 내보내기" : "내보내기";

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !isExporting) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-[rgba(15,23,42,0.48)] backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] grid max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[22px] border border-[#e2e8f0] bg-white shadow-[0_24px_72px_rgba(15,23,42,0.24)] focus:outline-none" onEscapeKeyDown={(event) => { if (isExporting) event.preventDefault(); }} onPointerDownOutside={(event) => { if (isExporting) event.preventDefault(); }}>
          <div className="flex items-start justify-between gap-4 border-b border-[#e2e8f0] px-5 py-4">
            <div className="grid gap-1"><Dialog.Title className="text-lg font-bold text-[#0f172a]">{isPreparingExport ? "내보내기 정보를 준비하는 중입니다" : platform === "android" ? "Android 내보내기" : "iOS 내보내기"}</Dialog.Title><Dialog.Description className="text-xs font-medium text-[#64748b]">{isPreparingExport ? "버전 정보와 계정 상태를 확인하고 있습니다." : "완성된 테마를 설치하거나 보관할 파일로 만듭니다."}</Dialog.Description></div>
            <Dialog.Close asChild><button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40" disabled={isExporting} aria-label="내보내기 창 닫기"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1]">
            {isExporting ? <div className="grid gap-5 py-4 text-center min-h-56 place-content-center" role="status" aria-live="polite"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><Download className="animate-pulse" size={22} aria-hidden="true" /></span><div><p className="text-base font-bold text-[#0f172a]">{getExportNotice(exportMode)}</p><p className="mt-2 text-sm font-medium text-[#64748b]">{steps[Math.min(progressStep, steps.length - 1)]} · {formatElapsedTime(elapsedSeconds)}</p></div><div className="mx-auto h-2 w-56 max-w-full overflow-hidden rounded-full bg-[#e2e8f0]"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#2563eb]" /></div><p className="text-xs font-medium text-[#64748b]">완료될 때까지 이 창을 유지해 주세요.</p></div> : isPreparingExport ? <div className="grid min-h-56 place-content-center gap-4 py-4 text-center" role="status" aria-live="polite"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><LoaderCircle className="animate-spin" size={22} aria-hidden="true" /></span><div><p className="text-base font-bold text-[#0f172a]">내보내기 정보를 준비하는 중입니다</p><p className="mt-2 text-sm font-medium text-[#64748b]">버전 정보를 불러오고 계정 상태를 확인하고 있습니다.</p></div></div> : preparationError ? <div className="grid min-h-56 place-content-center gap-3 py-4 text-center" role="alert"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#fef2f2] text-[#dc2626]"><X size={22} aria-hidden="true" /></span><div><p className="text-base font-bold text-[#0f172a]">내보내기 정보를 준비하지 못했습니다</p><p className="mt-2 max-w-md text-sm font-medium leading-6 text-[#64748b]">{preparationError}</p></div></div> : <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={platform === "android" ? "앱 이름" : "테마 이름"} value={exportName} disabled={isExporting} error={exportNameError} onChange={onNameChange} />
                <Field label={platform === "android" ? "앱 버전" : "테마 버전"} value={exportVersionName} disabled={isExporting} error={versionNameError} onChange={onVersionNameChange} />
                <div className="flex items-start gap-3 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-3.5 py-3 text-[#1e3a8a] sm:col-span-2"><ShieldCheck className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><div>{platform === "android" ? <><p className="text-sm font-bold">고유 앱 ID 자동 발급</p><p className="mt-0.5 text-xs font-medium leading-5 text-[#475569]">내보낼 때마다 계정과 요청 번호를 조합한 비식별 applicationId를 서버에서 생성합니다.</p></> : <><p className="text-sm font-bold">고유 테마 identifier 자동 발급</p><p className="mt-0.5 text-xs font-medium leading-5 text-[#475569]">내보낼 때마다 계정과 요청 번호를 조합한 비식별 identifier를 서버에서 생성하고 CSS에 적용합니다.</p></>}</div></div>
              </div>
              <div className="grid gap-2 mt-4 sm:grid-cols-2" role="radiogroup" aria-label="출력 형식">
                {platform === "ios" ? <><ModeButton selected={exportMode === "ktheme"} onClick={() => onModeChange("ktheme")} disabled={isExporting} label="iOS .ktheme" /><ModeButton selected={exportMode === "theme-zip"} onClick={() => onModeChange("theme-zip")} disabled={isExporting} label="iOS 테마 ZIP" /></> : <>
                  {isAdmin ? <ModeButton selected={exportMode === "project"} onClick={() => onModeChange("project")} disabled={isExporting} label="프로젝트 ZIP" description="관리자 디버깅용 빌드 전 소스" icon={<Wrench size={16} aria-hidden="true" />} /> : null}
                  <ModeButton selected={exportMode === "apk"} onClick={() => onModeChange("apk")} disabled={isExporting} label="Android APK" description="기기에 바로 설치할 파일" icon={<Package size={16} aria-hidden="true" />} />
                  <ModeButton selected={exportMode === "apk-zip"} onClick={() => onModeChange("apk-zip")} disabled={isExporting} label="APK ZIP" description="공유하거나 보관하기 좋은 압축 파일" icon={<Archive size={16} aria-hidden="true" />} />
                </>}
              </div>
              <div className="mt-4 grid gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-[#475569]">비용 <strong className="ml-1 text-[#0f172a]">1크레딧</strong></span><span className="font-semibold text-[#475569]">보유 <strong className={`ml-1 ${hasCredits ? "text-emerald-700" : "text-rose-700"}`}>{isAccountLoading ? "확인 중" : `${credits}크레딧`}</strong></span></div></div>
            </>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#e2e8f0] bg-white px-5 py-4"><button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isExporting}>취소</button>{preparationError ? <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white" onClick={onRetryPreparation}>다시 시도</button> : !isPreparingExport ? <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={!isLoggedIn ? onLogin : !hasCredits ? onBuyCredits : onSubmit} disabled={isExporting || isAccountLoading || (isLoggedIn && hasCredits && !canSubmit)}>{isExporting ? "내보내는 중…" : ctaLabel}</button> : null}</div>
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

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
