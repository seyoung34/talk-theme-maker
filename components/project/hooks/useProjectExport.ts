"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";
import { readJsonResponse } from "@/lib/shared/api/http";
import { createExportFormData, getDownloadFileName, getExportNotice, getExportProgressSteps, pollAndroidExportStatus, triggerDownload } from "@/components/project/exportClient";
import { getExportFailureReasonFromStatus, isNetworkError, toExportFailureReason, type ExportFailureReason } from "@/lib/theme/export/failureReason";
import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/components/project/projectModel";
import type { AccountState, ExportDownloadResult, ExportErrorResponse, ExportMode, ExportVersionResponse } from "@/components/project/exportModel";
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
  const [isPreparingExport, setIsPreparingExport] = useState(false);
  const [exportPreparationError, setExportPreparationError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDownloadResult, setExportDownloadResult] = useState<ExportDownloadResult | null>(null);
  const [exportMode, setExportMode] = useState<ExportMode>("apk");
  const [exportName, setExportName] = useState("");
  const [exportVersionName, setExportVersionName] = useState("");
  const [exportProgressStep, setExportProgressStep] = useState(0);
  const [exportElapsedSeconds, setExportElapsedSeconds] = useState(0);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [isAccountLoading, setIsAccountLoading] = useState(false);

  const refreshAccountState = useCallback(async () => {
    setIsAccountLoading(true);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const payload = await readJsonResponse<AccountState>(response);
      const next = { user: payload.user, credits: payload.credits ?? 0, isAdmin: payload.isAdmin ?? false };
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
    setExportName(displayTemplateName);
    setExportMode(platform === "android" ? "apk" : "ktheme");
    setExportProgressStep(0);
    setExportElapsedSeconds(0);

    try {
      if (!exportVersionName) {
        const response = await fetch(platform === "android" ? "/api/export/android" : "/api/export/ios");
        const payload = await readJsonResponse<ExportVersionResponse>(response);
        if (!response.ok) {
          throw new Error(payload.error ?? `${platform === "android" ? "Android" : "iOS"} 내보내기 설정을 불러오지 못했습니다.`);
        }
        setExportVersionName(payload.versionName ?? "1.0.0");
      }
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
  }, [displayTemplateName, exportVersionName, platform, refreshAccountState, setNotice]);

  const resumeExportDialog = useCallback(async (options: RecoveryExportOptions) => {
    if (exportPreparingRef.current) return;
    exportPreparingRef.current = true;
    setIsPreparingExport(true);
    setExportPreparationError(null);
    setExportDialogOpen(true);
    setExportDownloadResult(null);
    setExportName(options.name);
    setExportMode(options.exportMode);
    setExportVersionName(options.versionName);
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
        versionName: exportVersionName,
        mode: exportMode,
        slots,
        uploads: hydratedUploads,
        colors,
        selections: candidateSelections,
        bubbleGeometry,
        bubbleMarkers,
        bubbleInsets,
        bubbleStretch,
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
          await onUnauthenticated?.({ exportMode, name: exportName, versionName: exportVersionName });
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
        const stepLabels = getExportProgressSteps(exportMode);
        const outcome = await pollAndroidExportStatus(queued.exportJobId, () => {
          setExportProgressStep((current) => Math.min(current + 1, stepLabels.length - 2));
        });

        if (progressTimer) {
          window.clearInterval(progressTimer);
          progressTimer = null;
        }
        if (outcome.status === "failed") {
          failureReason = outcome.reason;
          await refreshAccountState();
          throw new Error(outcome.error);
        }

        setExportProgressStep(stepLabels.length - 1);
        failureReason = "download_failed";
        const downloadResponse = await fetch(outcome.downloadUrl);
        if (!downloadResponse.ok) throw new Error("빌드 결과 파일을 내려받지 못했습니다.");
        const asyncBlob = await downloadResponse.blob();
        failureReason = "unknown";
        triggerDownload(asyncBlob, outcome.fileName);
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
      }));
      const exportNumber = response.headers.get("X-Export-Number");
      await onExportCompleted?.();
      setExportDownloadResult({ platform, mode: exportMode, fileName });
      trackAnalyticsEvent("export_completed", { platform, export_mode: exportMode });
      setNotice({ tone: "success", message: `${exportNumber ? `내보내기 #${exportNumber} · ` : ""}${fileName} 파일을 생성했습니다.` });
    } catch (error) {
      console.error(error);
      // fetch 자체가 실패한 경우(오프라인·중단)는 단계별 사유보다 네트워크 오류가 정확하다.
      const reason = isNetworkError(error) ? "network_error" : failureReason;
      if (!isCreditBlocked) trackAnalyticsEvent("export_failed", { platform, export_mode: exportMode, failure_reason: reason });
      setNotice({ tone: "error", message: error instanceof Error ? error.message : `${platform === "android" ? "Android" : "iOS"} 내보내기 중 오류가 발생했습니다.` });
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      exportSubmittingRef.current = false;
      setIsExporting(false);
    }
  }, [
    accountState?.credits,
    accountState?.isAdmin,
    accountState?.user,
    activeTemplate,
    bubbleGeometry,
    bubbleInsets,
    bubbleMarkers,
    bubbleStretch,
    candidateSelections,
    colors,
    ensureSystemTemplateUploadsHydrated,
    exportMode,
    exportName,
    exportVersionName,
    platform,
    refreshAccountState,
    onExportCompleted,
    onUnauthenticated,
    setNotice,
    slots,
    templateId,
  ]);

  return {
    accountState,
    exportDialogOpen,
    exportDownloadResult,
    exportElapsedSeconds,
    exportMode,
    exportName,
    exportProgressStep,
    exportVersionName,
    isAccountLoading,
    isExporting,
    isPreparingExport,
    openExportDialog,
    resumeExportDialog,
    exportPreparationError,
    refreshAccountState,
    setExportDialogOpen,
    setExportMode,
    setExportName,
    setExportVersionName,
    submitExport,
  };
}
