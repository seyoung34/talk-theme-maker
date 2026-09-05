"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";
import { claimSignupBonusFromClient } from "@/lib/billing/signupBonusClient";
import { readJsonResponse } from "@/lib/shared/api/http";
import { cancelAsyncExport, createExportFormData, getDownloadFileName, getExportNotice, getExportProgressSteps, pollAsyncExportStatus, triggerDownload } from "@/components/project/exportClient";
import { getExportFailureReasonFromStatus, isNetworkError, toExportFailureReason, type ExportFailureReason } from "@/lib/theme/export/failureReason";
import { UploadSourceUnavailableError } from "@/lib/theme/project/state";
import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/components/project/projectModel";
import type { AccountState, ExportDownloadResult, ExportErrorResponse, ExportMode } from "@/components/project/exportModel";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import type { RecoveryExportOptions } from "@/lib/theme/project/recoveryDraft";

type ProjectNotice = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
};

type UseProjectExportOptions = {
  activeTemplate: ThemeTemplate;
  bubbleGeometry: Partial<Record<string, BubbleGeometry>>;
  bubbleInsets: Partial<Record<string, Insets>>;
  bubbleMarkers: Partial<Record<string, Markers>>;
  bubbleStretch: Partial<Record<string, StretchPoint>>;
  bubbleFlipX: Partial<Record<string, boolean>>;
  candidateSelections: SlotCandidateSelections;
  colors: SlotColors;
  displayTemplateName: string;
  ensureSystemTemplateUploadsHydrated: () => Promise<SlotUploads>;
  onExportCompleted?: () => Promise<void> | void;
  onUnauthenticated?: (options: RecoveryExportOptions) => Promise<void>;
  platform: ThemePlatform;
  setNotice: Dispatch<SetStateAction<ProjectNotice | null>>;
  slots: ThemeAssetSlot[];
  templateId: ThemeTemplateId;
};

export function useProjectExport({
  activeTemplate,
  bubbleGeometry,
  bubbleInsets,
  bubbleMarkers,
  bubbleStretch,
  bubbleFlipX,
  candidateSelections,
  colors,
  displayTemplateName,
  ensureSystemTemplateUploadsHydrated,
  onExportCompleted,
  onUnauthenticated,
  platform,
  setNotice,
  slots,
  templateId,
}: UseProjectExportOptions) {
  const exportPreparingRef = useRef(false);
  const exportSubmittingRef = useRef(false);
  const exportCancellingRef = useRef(false);
  const exportPollAbortRef = useRef<AbortController | null>(null);
  const [isPreparingExport, setIsPreparingExport] = useState(false);
  const [exportPreparationError, setExportPreparationError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportQueued, setIsExportQueued] = useState(false);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [isCancellingExport, setIsCancellingExport] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDownloadResult, setExportDownloadResult] = useState<ExportDownloadResult | null>(null);
  const [exportMode, setExportMode] = useState<ExportMode>("apk");
  const [exportName, setExportName] = useState("");
  const [exportProgressStep, setExportProgressStep] = useState(0);
  const [exportElapsedSeconds, setExportElapsedSeconds] = useState(0);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [isAccountLoading, setIsAccountLoading] = useState(false);

  const refreshAccountState = useCallback(async () => {
    setIsAccountLoading(true);
    try {
      const bonusClaim = await claimSignupBonusFromClient().catch(() => null);
      if (bonusClaim?.granted && bonusClaim.campaignKey) {
        trackAnalyticsEvent("signup_bonus_granted", { campaign_key: bonusClaim.campaignKey, credits_granted: bonusClaim.creditsGranted ?? 0 });
      }
      const response = await fetch("/api/me", { cache: "no-store" });
      const payload = await readJsonResponse<AccountState>(response);
      const next = {
        user: payload.user,
        credits: payload.credits ?? 0,
        isAdmin: payload.isAdmin ?? false,
        signupBonus: payload.signupBonus ?? null,
      };
      setAccountState(next);
      return next;
    } finally {
      setIsAccountLoading(false);
    }
  }, []);

  const openExportDialog = useCallback(async () => {
    if (exportPreparingRef.current) return;
    exportPreparingRef.current = true;
    setIsPreparingExport(true);
    setExportPreparationError(null);
    setExportDialogOpen(true);
    setExportDownloadResult(null);
    setIsExportQueued(false);
    setExportJobId(null);
    setIsCancellingExport(false);
    setExportName(displayTemplateName);
    setExportMode(platform === "android" ? "apk" : "ktheme");
    setExportProgressStep(0);
    setExportElapsedSeconds(0);

    try {
      await refreshAccountState();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "내보내기 정보를 준비하는 중 오류가 발생했습니다.";
      setExportPreparationError(message);
      setNotice({ tone: "error", message });
    } finally {
      exportPreparingRef.current = false;
      setIsPreparingExport(false);
    }
  }, [displayTemplateName, platform, refreshAccountState, setNotice]);

  const resumeExportDialog = useCallback(async (options: RecoveryExportOptions) => {
    if (exportPreparingRef.current) return;
    exportPreparingRef.current = true;
    setIsPreparingExport(true);
    setExportPreparationError(null);
    setExportDialogOpen(true);
    setExportDownloadResult(null);
    setIsExportQueued(false);
    setExportJobId(null);
    setIsCancellingExport(false);
    setExportName(options.name);
    setExportMode(options.exportMode);
    setExportProgressStep(0);
    setExportElapsedSeconds(0);
    try {
      await refreshAccountState();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "내보내기 정보를 준비하는 중 오류가 발생했습니다.";
      setExportPreparationError(message);
      setNotice({ tone: "error", message });
    } finally {
      exportPreparingRef.current = false;
      setIsPreparingExport(false);
    }
  }, [refreshAccountState, setNotice]);

  const submitExport = useCallback(async () => {
    if (exportSubmittingRef.current) return;
    exportSubmittingRef.current = true;
    const progressSteps = getExportProgressSteps(exportMode);
    let progressTimer: number | null = null;
    let isCreditBlocked = false;
    // 실패 사유는 단계가 진행될수록 좁혀 간다. 각 대입은 "여기서 던지면 이 사유"라는 뜻이며,
    // catch는 마지막으로 확정된 값을 분석에 올린다. 사용자 메시지는 이 값과 별개로 다룬다.
    let failureReason: ExportFailureReason = "preparation_failed";

    try {
      setIsExporting(true);
      setIsExportQueued(false);
      setExportJobId(null);
      setIsCancellingExport(false);
      setExportProgressStep(0);
      setExportElapsedSeconds(0);
      setNotice({ tone: "info", message: getExportNotice(exportMode) });
      trackAnalyticsEvent("export_started", { platform, export_mode: exportMode });
      progressTimer = window.setInterval(() => {
        setExportElapsedSeconds((current) => current + 1);
      }, 1000);

      const hydratedUploads = await ensureSystemTemplateUploadsHydrated();
      setExportProgressStep(platform === "ios" ? 1 : 0);
      const hydratedAnalysis = createThemeProjectAnalysis(activeTemplate, platform, slots, hydratedUploads, colors, candidateSelections);
      const formData = await createExportFormData({
        analysis: hydratedAnalysis,
        template: activeTemplate,
        templateId,
        exportName,
        mode: exportMode,
        slots,
        uploads: hydratedUploads,
        colors,
        selections: candidateSelections,
        bubbleGeometry,
        bubbleMarkers,
        bubbleInsets,
        bubbleStretch,
        bubbleFlipX,
        catalogExportUserId: accountState?.user?.id,
      });
      setExportProgressStep(platform === "ios" ? 2 : 1);

      const response = await fetch(platform === "android" ? "/api/export/android" : "/api/export/ios", {
        method: "POST",
        body: formData,
      });
      failureReason = "unknown";

      if (!response.ok) {
        const errorBody = await readJsonResponse<ExportErrorResponse>(response).catch(() => null);
        failureReason = toExportFailureReason(errorBody?.reason, getExportFailureReasonFromStatus(response.status));
        if (response.status === 401 || errorBody?.reason === "unauthenticated") {
          await onUnauthenticated?.({ exportMode, name: exportName });
          return;
        }
        if (response.status === 402 || errorBody?.reason === "insufficient_credits") {
          await refreshAccountState();
          isCreditBlocked = true;
          trackAnalyticsEvent("export_blocked_insufficient_credits", { platform, export_mode: exportMode, credits_remaining: accountState?.credits ?? 0 });
          throw new Error("크레딧이 부족합니다. 크레딧 충전 후 다시 시도해 주세요.");
        }
        if (errorBody?.refunded) await refreshAccountState();
        throw new Error(errorBody?.error ?? "내보내기에 실패했습니다.");
      }

      // 202: 비동기(Cloud Run Job) 큐잉 경로. 완료/실패까지 status를 폴링한 뒤 서명 URL로 다운로드한다.
      if (response.status === 202) {
        const queued = await readJsonResponse<{ exportJobId: string; exportNumber?: number; error?: string }>(response);
        setIsExportQueued(true);
        setExportJobId(queued.exportJobId);
        const pollAbortController = new AbortController();
        exportPollAbortRef.current = pollAbortController;
        const stepLabels = getExportProgressSteps(exportMode);
        const outcome = await pollAsyncExportStatus(platform, queued.exportJobId, () => {
          setExportProgressStep((current) => Math.min(current + 1, stepLabels.length - 2));
        }, pollAbortController.signal);

        if (progressTimer) {
          window.clearInterval(progressTimer);
          progressTimer = null;
        }
        if (outcome.status === "failed") {
          failureReason = outcome.reason;
          await refreshAccountState();
          throw new Error(outcome.error);
        }
        if (outcome.status === "cancelled") {
          await refreshAccountState();
          setNotice({ tone: "info", message: "내보내기를 취소했고 크레딧을 환불했습니다." });
          return;
        }

        setExportProgressStep(stepLabels.length - 1);
        failureReason = "download_failed";
        failureReason = "unknown";
        // 서명 URL로 바로 이동시킨다. 예전에는 이걸 fetch해서 blob으로 바꾼 뒤 `<a download>`로 넘겼는데,
        // 인앱 브라우저는 그 조합을 처리하지 못해 파일이 조용히 오지 않았다. 직접 이동은 `/account`의
        // 다시 받기가 이미 같은 형태의 URL로 쓰고 있는 검증된 경로다.
        // 덤으로 수십 MB짜리 APK를 메모리에 통째로 올리던 것도 사라진다.
        window.location.href = outcome.downloadUrl;
        await refreshAccountState();
        await onExportCompleted?.();
        setExportDownloadResult({ platform, mode: exportMode, fileName: outcome.fileName });
        trackAnalyticsEvent("export_completed", { platform, export_mode: exportMode });
        setNotice({ tone: "success", message: `${queued.exportNumber ? `내보내기 #${queued.exportNumber} · ` : ""}${outcome.fileName} 파일을 생성했습니다.` });
        return;
      }

      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      setExportProgressStep(progressSteps.length - 1);
      const blob = await response.blob();
      const fileName = getDownloadFileName(response.headers.get("content-disposition")) ?? `${exportName}-${platform}-export`;
      triggerDownload(blob, fileName);
      const remainingCredits = Number(response.headers.get("X-Credits-Remaining"));
      if (Number.isFinite(remainingCredits)) setAccountState((current) => ({
        user: current?.user ?? accountState?.user ?? null,
        credits: remainingCredits,
        isAdmin: current?.isAdmin ?? accountState?.isAdmin ?? false,
        signupBonus: current?.signupBonus ?? accountState?.signupBonus ?? null,
      }));
      const exportNumber = response.headers.get("X-Export-Number");
      await onExportCompleted?.();
      setExportDownloadResult({ platform, mode: exportMode, fileName });
      trackAnalyticsEvent("export_completed", { platform, export_mode: exportMode });
      setNotice({ tone: "success", message: `${exportNumber ? `내보내기 #${exportNumber} · ` : ""}${fileName} 파일을 생성했습니다.` });
    } catch (error) {
      // 준비 단계 오류는 화면에 보일 수 없는 진단을 따로 들고 온다. 콘솔에는 그쪽을 남긴다.
      console.error(error instanceof UploadSourceUnavailableError ? `${error.name}: ${error.detail}` : error);
      // fetch 자체가 실패한 경우(오프라인·중단)는 단계별 사유보다 네트워크 오류가 정확하다.
      const reason = isNetworkError(error)
        ? "network_error"
        : error instanceof UploadSourceUnavailableError
          ? error.reason
          : failureReason;
      if (!isCreditBlocked) trackAnalyticsEvent("export_failed", { platform, export_mode: exportMode, failure_reason: reason });
      setNotice({ tone: "error", message: error instanceof Error ? error.message : `${platform === "android" ? "Android" : "iOS"} 내보내기 중 오류가 발생했습니다.` });
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      exportSubmittingRef.current = false;
      exportPollAbortRef.current = null;
      setIsExporting(false);
      setIsExportQueued(false);
      setExportJobId(null);
      setIsCancellingExport(false);
    }
  }, [
    accountState?.credits,
    accountState?.isAdmin,
    accountState?.signupBonus,
    accountState?.user,
    activeTemplate,
    bubbleGeometry,
    bubbleInsets,
    bubbleMarkers,
    bubbleStretch,
    bubbleFlipX,
    candidateSelections,
    colors,
    ensureSystemTemplateUploadsHydrated,
    exportMode,
    exportName,
    platform,
    refreshAccountState,
    onExportCompleted,
    onUnauthenticated,
    setNotice,
    slots,
    templateId,
  ]);

  const cancelExport = useCallback(async () => {
    if (!exportJobId || !isExportQueued || exportCancellingRef.current) return;
    exportCancellingRef.current = true;
    setIsCancellingExport(true);
    try {
      const result = await cancelAsyncExport(platform, exportJobId);
      if (result.cancelled) {
        exportPollAbortRef.current?.abort();
        if (result.status === "cancelled") {
          await refreshAccountState();
          setNotice({ tone: "info", message: "내보내기를 취소했고 크레딧을 환불했습니다." });
        } else {
          setNotice({ tone: "info", message: "내보내기 취소를 접수했습니다. 크레딧은 작업 종료 후 환불됩니다." });
        }
      } else if (result.status === "completed") {
        setNotice({ tone: "info", message: "내보내기가 이미 완료되어 취소할 수 없습니다." });
      } else {
        setNotice({ tone: "info", message: "내보내기가 이미 종료되어 취소할 수 없습니다." });
      }
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "내보내기 취소를 처리하지 못했습니다." });
    } finally {
      exportCancellingRef.current = false;
      setIsCancellingExport(false);
    }
  }, [exportJobId, isExportQueued, platform, refreshAccountState, setNotice]);

  return {
    accountState,
    exportDialogOpen,
    exportDownloadResult,
    exportElapsedSeconds,
    exportJobId,
    exportMode,
    exportName,
    exportProgressStep,
    isAccountLoading,
    isExporting,
    isExportQueued,
    isCancellingExport,
    isPreparingExport,
    openExportDialog,
    resumeExportDialog,
    exportPreparationError,
    refreshAccountState,
    setExportDialogOpen,
    setExportMode,
    setExportName,
    submitExport,
    cancelExport,
  };
}
