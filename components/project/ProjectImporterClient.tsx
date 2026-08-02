"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { BubbleBuilderDialog } from "@/components/editor/BubbleBuilderDialog";
import { AutosaveResumeDialog } from "@/components/project/dialogs/AutosaveResumeDialog";
import { AutosaveStatusBadge } from "@/components/project/AutosaveStatusBadge";
import { createEditorSignature } from "@/components/project/draftSignature";
import { persistEditorSession } from "@/components/project/editorSession";
import type { ActiveSystemTemplate, ActiveUserTemplate, InitialLoadState, ProjectNotice as Notice } from "@/components/project/editorTypes";
import { ExitConfirmDialog } from "@/components/project/dialogs/ExitConfirmDialog";
import { ExportDialog } from "@/components/project/dialogs/ExportDialog";
import { InitialTemplateErrorPanel, InitialTemplateLoadingPanel } from "@/components/project/dialogs/InitialTemplatePanels";
import { SaveTemplateDialog } from "@/components/project/dialogs/SaveTemplateDialog";
import { SystemTemplateSaveDialog } from "@/components/project/dialogs/SystemTemplateSaveDialog";
import { HeaderNotice } from "@/components/project/HeaderNotice";
import { getBackgroundSourcePair, getDefaultSlotCandidateId } from "@/components/project/projectImporterHelpers";
import { ProjectGroupRail } from "@/components/project/ProjectGroupRail";
import { MobileEditActionBar } from "@/components/project/MobileEditActionBar";
import { ProjectPreviewPanel } from "@/components/project/ProjectPreviewPanel";
import { ProjectQuickEditPanel } from "@/components/project/ProjectQuickEditPanel";
import { ProjectSectionRail } from "@/components/project/ProjectSectionRail";
import { MobileEditSheet, mobileSheetHeight, type MobileSheetSnap } from "@/components/project/MobileEditSheet";
import { MobileQuickEditPanel } from "@/components/project/MobileQuickEditPanel";
import { MobileSectionNav } from "@/components/project/MobileSectionNav";
import { MobileGroupSlotList } from "@/components/project/MobileGroupSlotList";
import { MobileScaledPreview } from "@/components/project/MobileScaledPreview";
import {
  createDefaultSystemTemplateMetadata,
  getSystemTemplateDialogInitialization,
} from "@/components/project/systemTemplateMetadata";
import { useViewportMode } from "@/components/project/hooks/useViewportMode";
import { useProjectAutoColors } from "@/components/project/hooks/useProjectAutoColors";
import { useProjectAssetUploads } from "@/components/project/hooks/useProjectAssetUploads";
import { useProjectExport } from "@/components/project/hooks/useProjectExport";
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";
import { useEditorBootstrap } from "@/components/project/hooks/useEditorBootstrap";
import { useTemplatePersistence } from "@/components/project/hooks/useTemplatePersistence";
import { useThemeDraft } from "@/components/project/hooks/useThemeDraft";
import { useEditorAutosave, type AutosaveArm } from "@/components/project/hooks/useEditorAutosave";
import { useSingleEditorTab } from "@/components/project/hooks/useSingleEditorTab";
import { useUnsavedChangesWarning } from "@/components/project/hooks/useUnsavedChangesWarning";
import {
  bubbleSlotFromRole,
  getCompletion,
  getInitialSlotCandidateSelections,
  getSectionGroups,
  getSelectedCandidate,
  getSelectedUpload,
  getSharedBubbleUploadPeers,
  getSharedSlotUploadEntries,
  planUploadRemoval,
  getSlotFile,
  groupLabels,
  isSlotVisibleInGroup,
  isSlotVisibleInSection,
  sectionLabels,
  type BubbleEditState,
} from "@/components/project/projectModel";
import { adminAssetToFile, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
import { getBubblePairRole, getSlotCandidates } from "@/lib/theme/project/state";
import { autoMainPaletteCandidateId } from "@/lib/theme/autoColor";
import { clearRecoveryDraft, saveRecoveryDraft, type RecoveryExportOptions } from "@/lib/theme/project/recoveryDraft";
import type { EditorAutosaveDraft } from "@/lib/theme/project/autosaveDraft";
import { getBubbleDecorationLayers, getBubbleVariantGeometry, getIosBubbleGeometry } from "@/lib/theme/bubbleBuilder";
import type { BubbleBuilderSide, BubbleBuilderVariant, BubbleDesigns, BubbleFamilyDesignSpec, GeneratedBubbleDesign } from "@/lib/theme/bubbleBuilder";
import type { ImageEditState, ImageEditTarget } from "@/lib/theme/imageEdit";
import { type SystemTemplatePricingType, type SystemTemplateStatus, type SystemTemplateVisibility } from "@/lib/theme/systemTemplates";
import {
  getThemeSlots,
  getThemeTemplate,
  type ThemeAssetSlot,
  type ThemeTemplateId,
} from "@/lib/theme/templates";
import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

type ProjectImporterClientProps = {
  mode?: "user" | "admin";
};

type PendingBubbleCopy = {
  sourceSlot: ThemeAssetSlot;
  targetSlot: ThemeAssetSlot;
};

export default function ProjectImporterClient({ mode = "user" }: ProjectImporterClientProps) {
  const isAdminMode = mode === "admin";
  const exitDestination = isAdminMode ? "/admin" : "/template";
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeToken = searchParams.get("resume");
  const editorTabLockStatus = useSingleEditorTab(mode);
  const [templateId, setTemplateId] = useState<ThemeTemplateId>("basic");
  const [initialLoadState, setInitialLoadState] = useState<InitialLoadState>({ status: "idle" });
  const [platform, setPlatform] = useState<ThemePlatform>("android");
  const [activeSection, setActiveSection] = useState<ThemeSection>("main");
  const [activeGroup, setActiveGroup] = useState<ThemeSlotGroup>("background");
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>();
  const [selectionPulseKey, setSelectionPulseKey] = useState(0);
  const {
    clearBubbleEdits,
    draft,
    ensureSystemTemplateUploadsHydrated,
    hydratePreviewUploads,
    hydrateSystemTemplateUploads,
    removeUploadCandidate,
    replaceDraft,
    setBubbleGeometry,
    setBubbleFlipX,
    setBubbleInsets,
    setBubbleMarkers,
    setBubbleStretch,
    setCandidateSelections,
    setColors,
    setRemoteUploadRefs,
    setUploads,
  } = useThemeDraft();
  const { uploads, remoteUploadRefs, colors, candidateSelections, bubbleGeometry, bubbleMarkers, bubbleInsets, bubbleStretch, bubbleFlipX, bubbleDesigns, bubbleDecorationSources } = draft;
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [mobileEditSheetOpen, setMobileEditSheetOpen] = useState(false);
  const [mobileSheetSnap, setMobileSheetSnap] = useState<MobileSheetSnap>("collapsed");
  const [mobileSheetLiveHeight, setMobileSheetLiveHeight] = useState<number | null>(null);
  const [liveBubblePreview, setLiveBubblePreview] = useState<{ role: ThemeResourceRole; edit: BubbleEditState } | null>(null);
  const [pendingBubbleCopy, setPendingBubbleCopy] = useState<PendingBubbleCopy | null>(null);
  const [activeUserTemplate, setActiveUserTemplate] = useState<ActiveUserTemplate | null>(null);
  const [activeSystemTemplate, setActiveSystemTemplate] = useState<ActiveSystemTemplate | null>(null);
  const [systemTemplateBundleId, setSystemTemplateBundleId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<"overwrite" | "saveAs">("saveAs");
  const [saveName, setSaveName] = useState("");
  const [systemSaveDialogOpen, setSystemSaveDialogOpen] = useState(false);
  const [systemTitle, setSystemTitle] = useState("");
  const [systemDescription, setSystemDescription] = useState("");
  const [systemTags, setSystemTags] = useState("");
  const [systemStatus, setSystemStatus] = useState<SystemTemplateStatus>("draft");
  const [systemVisibility, setSystemVisibility] = useState<SystemTemplateVisibility>("private");
  const [systemPricingType, setSystemPricingType] = useState<SystemTemplatePricingType>("free");
  const [systemPriceAmount, setSystemPriceAmount] = useState("");
  const [systemCreditCost, setSystemCreditCost] = useState("");
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [exitSaveState, setExitSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [bubbleBuilderOpen, setBubbleBuilderOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const autosaveNoticeRef = useRef<Notice | null>(null);
  const shouldConfirmExitRef = useRef(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const skipDefaultSelectionResetRef = useRef(false);
  const mobileEditSheetRef = useRef<HTMLDivElement | null>(null);
  const mobileEditTriggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileEditCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const analyticsEditorReadyRef = useRef<string | null>(null);
  const analyticsInteractionTimerRef = useRef<number | null>(null);
  const firstValueReachedRef = useRef(false);
  // 자동 저장에서 복원한 폼과 한 번이라도 열었던 폼은 저장된 메타데이터로 다시 초기화하지 않는다.
  const systemTemplateMetadataInitializedRef = useRef(false);

  // 관리자 메타데이터는 초안 바깥의 폼 상태지만 저장 전까지 메모리에만 있으므로 함께 추적한다.
  const systemTemplateMetadata = useMemo(
    () =>
      isAdminMode
        ? {
            title: systemTitle,
            description: systemDescription,
            tags: systemTags,
            status: systemStatus,
            visibility: systemVisibility,
            pricingType: systemPricingType,
            priceAmount: systemPriceAmount,
            creditCost: systemCreditCost,
          }
        : null,
    [isAdminMode, systemCreditCost, systemDescription, systemPriceAmount, systemPricingType, systemStatus, systemTags, systemTitle, systemVisibility],
  );

  // 저장하지 않은 변경 추적. 부트스트랩이 끝난 시점을 기준선으로 잡고, 이후 내용이 달라지면
  // 이탈 경고를 켠다. 내 템플릿으로 저장하면 그 시점을 새 기준선으로 삼는다.
  const draftSignature = useMemo(() => createEditorSignature(draft, systemTemplateMetadata), [draft, systemTemplateMetadata]);
  const draftSignatureRef = useRef(draftSignature);
  draftSignatureRef.current = draftSignature;
  const savedSignatureRef = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 자동 저장은 부트스트랩이 시작 상태를 확정한 뒤에 켠다. 그 전에 쓰면 사용자가 이어할지
  // 답하기도 전에 기존 레코드를 덮어쓴다.
  const [autosaveArm, setAutosaveArm] = useState<AutosaveArm>({ state: "pending" });
  const [pendingAutosave, setPendingAutosave] = useState<EditorAutosaveDraft | null>(null);
  const autosaveDecisionRef = useRef<((decision: "resume" | "discard") => void) | null>(null);

  const armAutosave = useCallback((expectedUpdatedAt: number | null) => {
    setAutosaveArm({ state: "armed", expectedUpdatedAt });
  }, []);

  const requestAutosaveDecision = useCallback((record: EditorAutosaveDraft) => {
    setPendingAutosave(record);
    return new Promise<"resume" | "discard">((resolve) => {
      autosaveDecisionRef.current = resolve;
    });
  }, []);

  const answerAutosaveDecision = useCallback((decision: "resume" | "discard") => {
    if (decision === "resume" && isAdminMode && pendingAutosave?.editor.systemTemplateMetadata) {
      systemTemplateMetadataInitializedRef.current = true;
    }
    setPendingAutosave(null);
    const resolve = autosaveDecisionRef.current;
    autosaveDecisionRef.current = null;
    resolve?.(decision);
  }, [isAdminMode, pendingAutosave]);

  useEffect(() => {
    if (!mobileEditSheetOpen || typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    if (mediaQuery.matches) return;

    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.setTimeout(() => {
      mobileEditCloseButtonRef.current?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileEditSheetOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements(mobileEditSheetRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => {
        mobileEditTriggerButtonRef.current?.focus();
      }, 0);
    };
  }, [mobileEditSheetOpen]);

  const activeTemplate = getThemeTemplate(templateId);
  const displayTemplateName = activeUserTemplate?.name ?? activeSystemTemplate?.title ?? activeTemplate.name;
  const slots = useMemo(() => getThemeSlots(platform), [platform]);
  const handleAutosaveSaved = useCallback(() => {
    setNotice((current) => current?.message === "이 템플릿을 변경하면 기존 최근 작업이 새 작업으로 교체됩니다." ? null : current);
    persistEditorSession(mode, {
      templateId,
      platform,
      userTemplateId: activeUserTemplate?.id,
      systemTemplateId: activeSystemTemplate?.id,
      systemTemplateBundleId: systemTemplateBundleId ?? activeSystemTemplate?.bundleId,
      editMode: mode,
    });
  }, [activeSystemTemplate, activeUserTemplate, mode, platform, systemTemplateBundleId, templateId]);

  const { status: autosaveStatus, lastSavedAt: autosaveSavedAt, message: autosaveMessage, flushAutosave, resetAutosave } = useEditorAutosave({
    arm: autosaveArm,
    mode,
    draftSignature,
    getSnapshot: () => ({
      mode,
      source: {
        templateId,
        platform,
        templateName: displayTemplateName,
        activeUserTemplate: activeUserTemplate ?? undefined,
        // 편집기 상태에서는 bundleId가 선택이지만 저장 계약에서는 항상 필요하다.
        activeSystemTemplate: activeSystemTemplate
          ? { ...activeSystemTemplate, bundleId: activeSystemTemplate.bundleId ?? activeSystemTemplate.id }
          : undefined,
        systemTemplateBundleId: systemTemplateBundleId ?? undefined,
      },
      editor: { activeSection, activeGroup, selectedSlotId, systemTemplateMetadata: systemTemplateMetadata ?? undefined },
      draft,
    }),
    onSaved: handleAutosaveSaved,
  });

  // 저장 실패·다중 탭 충돌은 조용히 넘기면 사용자가 저장되고 있다고 오해한다.
  // 성공 알림과 같이 2.5초 만에 사라지면 자리를 비운 사이에 놓치므로 직접 닫을 때까지 남긴다.
  useEffect(() => {
    if (!autosaveMessage) return;
    const notice: Notice = { tone: autosaveStatus === "conflict" ? "warning" : "error", message: autosaveMessage, persistent: true };
    autosaveNoticeRef.current = notice;
    setNotice(notice);
  }, [autosaveMessage, autosaveStatus]);

  // 다시 저장에 성공하면 걷는다. 스스로 사라지지 않으므로 띄운 쪽이 지워야 한다.
  // 다른 알림이 이미 덮었으면 건드리지 않도록 객체 동일성으로 확인한다.
  // conflict는 새로고침 전까지 저장이 멈춘 상태라 여기서 해제되지 않는다.
  useEffect(() => {
    if (autosaveStatus !== "saved" || !autosaveNoticeRef.current) return;
    const restored = autosaveNoticeRef.current;
    autosaveNoticeRef.current = null;
    setNotice((current) => (current === restored ? null : current));
  }, [autosaveStatus]);

  const markDraftSaved = useCallback(() => {
    savedSignatureRef.current = draftSignatureRef.current;
    setHasUnsavedChanges(false);
    // 작업이 다른 곳에 안전하게 남았으므로 자동 저장 레코드는 더 들고 있을 이유가 없다.
    resetAutosave();
  }, [resetAutosave]);

  const persistRecoveryThenNavigate = useCallback(async (
    reason: "login_required" | "insufficient_credits",
    destination: "login" | "credits",
    exportOptions: RecoveryExportOptions,
  ) => {
    try {
      const recovery = await saveRecoveryDraft({
        resume: { reason },
        editor: {
          mode,
          templateId,
          platform,
          activeUserTemplate: activeUserTemplate ?? undefined,
          activeSystemTemplate: activeSystemTemplate ? { ...activeSystemTemplate, bundleId: activeSystemTemplate.bundleId ?? activeSystemTemplate.id } : undefined,
          systemTemplateBundleId: systemTemplateBundleId ?? undefined,
          activeSection,
          activeGroup,
          selectedSlotId,
        },
        draft: { uploads, remoteUploadRefs, colors, candidateSelections, bubbleGeometry, bubbleMarkers, bubbleInsets, bubbleStretch, bubbleFlipX, bubbleDesigns, bubbleDecorationSources },
        exportOptions,
      });
      const returnTo = `/edit?resume=${encodeURIComponent(recovery.resume.token)}`;
      router.push(destination === "login"
        ? `/login?returnTo=${encodeURIComponent(returnTo)}&reason=export`
        : `/credits?entry=export_block&returnTo=${encodeURIComponent(returnTo)}`);
    } catch (error) {
      console.error(error);
      const continueWithoutRecovery = window.confirm("편집 내용을 임시 저장하지 못했습니다. 작업 내용을 잃을 수 있습니다. 그래도 이동할까요?");
      if (!continueWithoutRecovery) return;
      router.push(destination === "login" ? "/login?returnTo=%2Fedit&reason=export" : "/credits?entry=export_block&returnTo=%2Fedit");
    }
  }, [activeGroup, activeSection, activeSystemTemplate, activeUserTemplate, bubbleDecorationSources, bubbleDesigns, bubbleFlipX, bubbleGeometry, bubbleInsets, bubbleMarkers, bubbleStretch, candidateSelections, colors, mode, platform, remoteUploadRefs, router, selectedSlotId, systemTemplateBundleId, templateId, uploads]);

  useEffect(() => {
    if (skipDefaultSelectionResetRef.current) {
      skipDefaultSelectionResetRef.current = false;
      return;
    }
    setCandidateSelections(getInitialSlotCandidateSelections(slots, templateId, activeTemplate));
  }, [activeTemplate, setCandidateSelections, slots, templateId]);

  const viewportMode = useViewportMode();
  const groups = useMemo(() => getSectionGroups(activeSection, slots), [activeSection, slots]);
  const analysis = useMemo(
    () => createThemeProjectAnalysis(activeTemplate, platform, slots, uploads, colors, candidateSelections),
    [activeTemplate, platform, slots, uploads, colors, candidateSelections],
  );
  const previewBubbleEdits = useMemo(
    () => ({
      bubble_me_1: slotEditFromRole("bubble_me_1", slots, bubbleGeometry, bubbleMarkers, bubbleInsets, bubbleStretch, bubbleFlipX),
      bubble_me_2: slotEditFromRole("bubble_me_2", slots, bubbleGeometry, bubbleMarkers, bubbleInsets, bubbleStretch, bubbleFlipX),
      bubble_you_1: slotEditFromRole("bubble_you_1", slots, bubbleGeometry, bubbleMarkers, bubbleInsets, bubbleStretch, bubbleFlipX),
      bubble_you_2: slotEditFromRole("bubble_you_2", slots, bubbleGeometry, bubbleMarkers, bubbleInsets, bubbleStretch, bubbleFlipX),
    }),
    [slots, bubbleGeometry, bubbleMarkers, bubbleInsets, bubbleStretch, bubbleFlipX],
  );
  const renderedPreviewBubbleEdits = useMemo(
    () => liveBubblePreview ? { ...previewBubbleEdits, [liveBubblePreview.role]: liveBubblePreview.edit } : previewBubbleEdits,
    [liveBubblePreview, previewBubbleEdits],
  );
  const {
    activeImageColorPalette,
    contrastWarnings,
    imageColorPaletteError,
    mainBackgroundFile,
    mainColorRecommendations,
  } = useProjectAutoColors({
    activeTemplate,
    analysis,
    candidateSelections,
    colors,
    platform,
    setCandidateSelections,
    setColors,
    slots,
    templateId,
  });

  useEffect(() => {
    if (!groups.includes(activeGroup)) {
      setActiveGroup(groups[0] ?? "background");
    }
  }, [activeGroup, groups]);

  const visibleSlots = useMemo(() => slots.filter((slot) => isSlotVisibleInSection(slot, activeSection) && isSlotVisibleInGroup(slot, activeGroup)), [activeGroup, activeSection, slots]);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? visibleSlots[0] ?? slots[0];

  useEffect(() => {
    setCandidateOpen(false);
  }, [selectedSlot?.id]);

  const selectedFile = getSlotFile(selectedSlot, analysis.files);
  const selectedBubbleSlot = selectedSlot ? bubbleSlotFromRole(selectedSlot.role) : null;
  const selectedBubblePairSlot = selectedSlot ? slots.find((slot) => slot.role === getBubblePairRole(selectedSlot.role)) : undefined;
  const selectedBubbleVariant = selectedSlot ? bubbleVariantFromRole(selectedSlot.role) : null;
  const selectedBubbleDesign = selectedSlot && selectedBubbleSlot ? getBubbleDesign(bubbleDesigns, selectedSlot.role, selectedBubbleSlot) : undefined;
  const completion = getCompletion(slots, uploads, colors, candidateSelections, templateId, activeTemplate);
  const {
    adminAssetCursor,
    adminAssetsWithPreview,
    isLoadingAdminAssets,
    loadMoreAdminAssets,
  } = useProjectAssetUploads({ platform, selectedSlot, setNotice });
  const skipDefaultSelectionReset = useCallback(() => {
    skipDefaultSelectionResetRef.current = true;
  }, []);

  const { isSavingSystemTemplate, isSavingTemplate, saveCurrentTemplate, saveSystemTemplate } = useTemplatePersistence({
    activeSystemTemplate,
    activeUserTemplate,
    bubbleGeometry,
    bubbleInsets,
    bubbleMarkers,
    bubbleStretch,
    bubbleFlipX,
    bubbleDesigns,
    bubbleDecorationSources,
    candidateSelections,
    colors,
    ensureSystemTemplateUploadsHydrated,
    isAdminMode,
    mode,
    onTemplateSaved: markDraftSaved,
    platform,
    saveMode,
    saveName,
    setActiveSystemTemplate,
    setActiveUserTemplate,
    setNotice,
    setSaveDialogOpen,
    setSystemSaveDialogOpen,
    setSystemTemplateBundleId,
    systemCreditCost,
    systemDescription,
    systemPriceAmount,
    systemPricingType,
    systemStatus,
    systemTags,
    systemTemplateBundleId,
    systemTitle,
    systemVisibility,
    templateId,
  });
  const {
    accountState,
    exportDialogOpen,
    exportDownloadResult,
    exportElapsedSeconds,
    exportMode,
    exportName,
    exportProgressStep,
    isAccountLoading,
    isExporting,
    isPreparingExport,
    openExportDialog,
    resumeExportDialog,
    exportPreparationError,
    setExportDialogOpen,
    setExportMode,
    setExportName,
    submitExport,
  } = useProjectExport({
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
    // 내보내기 결과물(APK·ktheme 등)로는 편집 상태를 되돌릴 수 없다. 사용자가 내 템플릿으로
    // 저장하지 않았다면 편집 원본은 여전히 저장되지 않은 상태이므로 자동 저장과 이탈 경고를 유지한다.
    // 복구 draft는 인증·충전 왕복 전용이라 목적을 다했으므로 여기서 정리한다.
    onExportCompleted: () => clearRecoveryDraft(mode),
    onUnauthenticated: (exportOptions) => persistRecoveryThenNavigate("login_required", "login", exportOptions),
    platform,
    setNotice,
    slots,
    templateId,
  });

  shouldConfirmExitRef.current = hasUnsavedChanges || isExporting;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.pushState({ kakaoThemeEditorExitGuard: true }, "", window.location.href);
    const handlePopState = () => {
      if (!shouldConfirmExitRef.current) {
        router.push(exitDestination);
        return;
      }
      window.history.pushState({ kakaoThemeEditorExitGuard: true }, "", window.location.href);
      setExitSaveState("idle");
      setExitConfirmOpen(true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [exitDestination, router]);

  const navigateAfterExit = () => {
    setExitConfirmOpen(false);
    setExitSaveState("idle");
    router.push(exitDestination);
  };
  const requestExit = () => {
    if (!shouldConfirmExitRef.current) {
      router.push(exitDestination);
      return;
    }
    setExitSaveState("idle");
    setExitConfirmOpen(true);
  };
  const cancelExit = () => {
    setExitConfirmOpen(false);
    setExitSaveState("idle");
  };
  const confirmExit = async () => {
    if (!hasUnsavedChanges) {
      navigateAfterExit();
      return;
    }

    setExitSaveState("saving");
    const result = await flushAutosave();
    if (result === "saved" || result === "unchanged") {
      navigateAfterExit();
      return;
    }
    setExitSaveState("error");
  };

  const handleRecoveryRestored = useCallback((exportOptions: RecoveryExportOptions) => {
    void resumeExportDialog(exportOptions);
  }, [resumeExportDialog]);
  const handleAutosaveRestored = useCallback(() => {
    trackAnalyticsEvent("autosave_recovered", { mode });
  }, [mode]);

  useEditorBootstrap({
    enabled: editorTabLockStatus === "acquired",
    hydratePreviewUploads,
    hydrateSystemTemplateUploads,
    mode,
    onAutosaveArmed: armAutosave,
    onAutosaveRestored: handleAutosaveRestored,
    onRecoveryRestored: handleRecoveryRestored,
    requestAutosaveDecision,
    resumeToken,
    setActiveGroup,
    setActiveSection,
    setActiveSystemTemplate,
    setActiveUserTemplate,
    setInitialLoadState,
    setNotice,
    setPlatform,
    setSelectedSlotId,
    setSystemCreditCost,
    setSystemDescription,
    setSystemPriceAmount,
    setSystemPricingType,
    setSystemStatus,
    setSystemTags,
    setSystemTemplateBundleId,
    setSystemTitle,
    setSystemVisibility,
    setTemplateId,
    replaceDraft,
    skipDefaultSelectionReset,
  });

  // 기준선은 부트스트랩이 끝난 뒤에 잡는다. 템플릿을 불러오는 동안의 초안 변경은 사용자 편집이 아니므로
  // 경고 대상이 아니다. useEditorBootstrap 뒤에 두어야 같은 커밋에서 복원된 초안을 기준선으로 읽는다.
  useEffect(() => {
    if (initialLoadState.status !== "ready") return;
    if (savedSignatureRef.current === null) {
      savedSignatureRef.current = draftSignature;
      return;
    }
    setHasUnsavedChanges(draftSignature !== savedSignatureRef.current);
  }, [draftSignature, initialLoadState.status]);

  // 내보내기 중 이탈하면 크레딧은 차감된 채 결과물을 놓칠 수 있어 변경 여부와 무관하게 경고한다.
  useUnsavedChangesWarning(hasUnsavedChanges || isExporting);

  useEffect(() => {
    if (initialLoadState.status !== "ready" || !selectedSlot) return;
    // 말풍선은 공유 풀이라 선택한 업로드의 owner가 다른 슬롯일 수 있다. 네 peer를 함께 받는다.
    const hydrationSlotIds = [selectedSlot, ...getSharedBubbleUploadPeers(selectedSlot, slots)].map((slot) => slot.id);
    void hydrateSystemTemplateUploads(remoteUploadRefs, hydrationSlotIds).catch((error) => console.error(error));
  }, [hydrateSystemTemplateUploads, initialLoadState.status, remoteUploadRefs, selectedSlot?.id]);

  useEffect(() => {
    if (initialLoadState.status !== "ready") return;
    const templateSource = activeSystemTemplate ? "system" : activeUserTemplate ? "user" : "base";
    const templateKey = activeSystemTemplate ? `system:${activeSystemTemplate.bundleId ?? activeSystemTemplate.id}` : activeUserTemplate ? "user_template" : templateId;
    const key = `${templateSource}:${templateKey}:${platform}`;
    if (analyticsEditorReadyRef.current === key) return;
    analyticsEditorReadyRef.current = key;
    trackAnalyticsEvent("editor_ready", { template_key: templateKey, template_source: templateSource, platform });
  }, [activeSystemTemplate, activeUserTemplate, initialLoadState.status, platform, templateId]);

  useEffect(() => () => {
    if (analyticsInteractionTimerRef.current) window.clearTimeout(analyticsInteractionTimerRef.current);
  }, []);

  const scheduleInteractionEvent = useCallback((name: "color_changed" | "bubble_edit_completed", slot: ThemeAssetSlot, extra: Record<string, string> = {}) => {
    if (analyticsInteractionTimerRef.current) window.clearTimeout(analyticsInteractionTimerRef.current);
    analyticsInteractionTimerRef.current = window.setTimeout(() => {
      trackAnalyticsEvent(name, { slot_role: slot.role, section: slot.section, ...extra });
      analyticsInteractionTimerRef.current = null;
    }, 500);
  }, []);

  const trackFirstValueReached = useCallback((action: "upload" | "candidate" | "color") => {
    if (firstValueReachedRef.current) return;
    firstValueReachedRef.current = true;
    trackAnalyticsEvent("first_value_reached", { action });
  }, []);

  const startDefaultTemplate = () => {
    void clearRecoveryDraft(mode).catch((error) => console.error(error));
    persistEditorSession(mode, { templateId: "basic", platform: "android", editMode: mode });
    skipDefaultSelectionResetRef.current = true;
    setTemplateId("basic");
    setPlatform("android");
    setActiveSection("main");
    setActiveGroup("background");
    setSelectedSlotId(undefined);
    const defaultDraft = {
      uploads: {},
      remoteUploadRefs: {},
      colors: {},
      candidateSelections: getInitialSlotCandidateSelections(getThemeSlots("android"), "basic", getThemeTemplate("basic")),
      bubbleGeometry: {},
      bubbleMarkers: {},
      bubbleInsets: {},
      bubbleStretch: {},
      bubbleFlipX: {},
      bubbleDesigns: {},
      bubbleDecorationSources: {},
    };
    replaceDraft(defaultDraft);
    const defaultSystemMetadata = isAdminMode
      ? createDefaultSystemTemplateMetadata(getThemeTemplate("basic").name)
      : null;
    if (defaultSystemMetadata) {
      setSystemTitle(defaultSystemMetadata.title);
      setSystemDescription(defaultSystemMetadata.description);
      setSystemTags(defaultSystemMetadata.tags);
      setSystemStatus(defaultSystemMetadata.status);
      setSystemVisibility(defaultSystemMetadata.visibility);
      setSystemPricingType(defaultSystemMetadata.pricingType);
      setSystemPriceAmount(defaultSystemMetadata.priceAmount);
      setSystemCreditCost(defaultSystemMetadata.creditCost);
      systemTemplateMetadataInitializedRef.current = true;
    } else {
      systemTemplateMetadataInitializedRef.current = false;
    }
    // 새 작업이므로 잃을 것이 없다. 상태가 반영되기를 기다리지 않고 이 초안을 바로 기준선으로 삼는다.
    savedSignatureRef.current = createEditorSignature(defaultDraft, defaultSystemMetadata);
    setHasUnsavedChanges(false);
    resetAutosave();
    setActiveUserTemplate(null);
    setActiveSystemTemplate(null);
    setSystemTemplateBundleId(null);
    setInitialLoadState({ status: "ready" });
  };

  const selectSection = (section: ThemeSection) => {
    setActiveSection(section);
    const nextGroups = getSectionGroups(section, slots);
    const nextGroup = nextGroups[0];
    if (nextGroup) setActiveGroup(nextGroup);
    const firstSlot = slots.find((slot) => isSlotVisibleInSection(slot, section) && (!nextGroup || isSlotVisibleInGroup(slot, nextGroup)));
    setSelectedSlotId(firstSlot?.id);
    if (firstSlot) setSelectionPulseKey((current) => current + 1);
    if (viewportMode !== "mobile") {
      setMobileEditSheetOpen(true);
    }
  };

  const selectGroup = (group: ThemeSlotGroup) => {
    setActiveGroup(group);
    const firstSlot = slots.find((slot) => isSlotVisibleInSection(slot, activeSection) && isSlotVisibleInGroup(slot, group));
    setSelectedSlotId(firstSlot?.id);
    if (firstSlot) setSelectionPulseKey((current) => current + 1);
    if (viewportMode === "mobile") {
      setMobileSheetSnap("half");
    } else {
      setMobileEditSheetOpen(true);
    }
  };

  const selectPreviewSlot = (slotId: string | undefined) => {
    focusSlot(slotId);
    const slot = slots.find((item) => item.id === slotId);
    if (!slot) return;
    revealSlot(slot);
    if (viewportMode === "mobile") {
      setMobileSheetSnap("half");
    } else {
      setMobileEditSheetOpen(true);
    }
  };

  const revealSlot = (slot: ThemeAssetSlot) => {
    if (!isSlotVisibleInSection(slot, activeSection)) setActiveSection(slot.section);
    if (!isSlotVisibleInGroup(slot, activeGroup)) setActiveGroup(slot.group);
  };

  const focusSlot = (slotId: string | undefined) => {
    setSelectedSlotId(slotId);
    if (slotId) setSelectionPulseKey((current) => current + 1);
  };

  const applyMobileSlotChange = (slot: ThemeAssetSlot) => {
    focusSlot(slot.id);
    revealSlot(slot);
    setMobileSheetSnap("full");
  };

  const requestMobileSlotChange = (slot: ThemeAssetSlot) => {
    if (slot.id === selectedSlot?.id) return;
    applyMobileSlotChange(slot);
  };

  const dropRemoteUploadRef = (slotId: string) => {
    setRemoteUploadRefs((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
  };

  const uploadSlot = (slot: ThemeAssetSlot, fileList: FileList | readonly File[] | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const uploadId = `${slot.id}:upload:${Date.now()}`;
    setUploads((current) => ({
      ...current,
      [slot.id]: [...(current[slot.id] ?? []), { id: uploadId, file, source: "user" as const }],
    }));
    dropRemoteUploadRef(slot.id);
    // 말풍선 편집값은 이전 이미지의 픽셀 좌표라 새 그림에는 의미가 없다. 지우지 않으면
    // 편집창이 저장값을 그대로 복원해서 텍스트 상자와 stretch 선이 엉뚱한 곳에 놓인다.
    clearBubbleEdits(slot.id);
    setCandidateSelections((current) => ({ ...current, [slot.id]: uploadId }));
    focusSlot(slot.id);
    revealSlot(slot);
    trackAnalyticsEvent("slot_upload_completed", { slot_role: slot.role, section: slot.section, asset_source: "user" });
    trackFirstValueReached("upload");
  };

  const uploadEditedSlot = (slot: ThemeAssetSlot, file: File, editState: ImageEditState, sourceFile: File, target?: ImageEditTarget) => {
    const uploadId = `${slot.id}:edited:${Date.now()}`;
    setUploads((current) => ({
      ...current,
      [slot.id]: [
        ...(current[slot.id] ?? []),
        {
          id: uploadId,
          file,
          source: "user" as const,
          imageEdit: {
            originalName: sourceFile.name,
            originalSize: sourceFile.size,
            originalFile: sourceFile,
            editedAt: Date.now(),
            state: editState,
            ...(target ? { target } : {}),
          },
        },
      ],
    }));
    dropRemoteUploadRef(slot.id);
    setCandidateSelections((current) => ({ ...current, [slot.id]: uploadId }));
    focusSlot(slot.id);
    revealSlot(slot);
    trackAnalyticsEvent("slot_upload_completed", { slot_role: slot.role, section: slot.section, asset_source: "user" });
    trackFirstValueReached("upload");
  };

  /**
   * 업로드 삭제. 말풍선 네 슬롯은 업로드를 공유하므로 두 가지를 먼저 가른다.
   *
   * 1. 이 업로드가 실제로 어느 bucket에 있는가(owner) — 지금 보고 있는 슬롯이 아닐 수 있다.
   * 2. 다른 슬롯이 쓰고 있지는 않은가 — 쓰고 있으면 지우지 않고 어디서 쓰는지 알려 준다.
   *    조용히 지우면 사용자가 손대지 않은 슬롯의 선택이 기본값으로 되돌아간다.
   */
  const removeUploadedSlotCandidate = (slot: ThemeAssetSlot, uploadId: string) => {
    const owner = getSharedSlotUploadEntries(slot, uploads, slots).find((resolved) => resolved.entry.id === uploadId);
    if (!owner) return;

    const plan = planUploadRemoval(uploadId, owner.ownerSlotId, slot.id, candidateSelections, slots);
    if (plan.kind === "blocked") {
      const labels = plan.blockingSlots.map((blocking) => blocking.label).join(", ");
      setNotice({ tone: "warning", message: `${labels}에서 사용 중이라 지울 수 없습니다. 해당 슬롯에서 다른 이미지를 먼저 고르세요.` });
      return;
    }

    const sourceChanged = removeUploadCandidate(
      slot.id,
      plan.ownerSlotId,
      uploadId,
      getDefaultSlotCandidateId(slot, templateId, activeTemplate),
    );
    if (sourceChanged) setLiveBubblePreview(null);
    focusSlot(slot.id);
  };

  /**
   * 눌림·선택 색의 직접 지정을 해제해 기준 색 연동으로 되돌린다.
   *
   * 피커를 한 번 만지면 `colors[slot.id]`에 값이 써져 연동이 끊긴다. 이 경로가 없으면
   * 실수로 만진 사용자가 원래 상태로 돌아올 방법이 없다.
   */
  const unlinkColor = (slot: ThemeAssetSlot) => {
    setColors((current) => omitBubbleEditValue(current, slot.id));
    setCandidateSelections((current) => omitBubbleEditValue(current, slot.id));
    setSelectedSlotId(slot.id);
  };

  const changeColor = (slot: ThemeAssetSlot, value: string) => {
    setColors((current) => ({ ...current, [slot.id]: value }));
    if (candidateSelections[slot.id] === autoMainPaletteCandidateId) {
      setCandidateSelections((current) => ({ ...current, [slot.id]: getSelectedCandidate(slot, {}, templateId, activeTemplate)?.id }));
    }
    setSelectedSlotId(slot.id);
    scheduleInteractionEvent("color_changed", slot);
    trackFirstValueReached("color");
  };

  const applyAutoColor = (slot: ThemeAssetSlot) => {
    if (mainBackgroundFile && !activeImageColorPalette) return;
    const color = mainColorRecommendations[slot.id];
    if (!color) return;
    setColors((current) => ({ ...current, [slot.id]: color }));
    setCandidateSelections((current) => ({ ...current, [slot.id]: autoMainPaletteCandidateId }));
    scheduleInteractionEvent("color_changed", slot, { asset_source: "auto" });
    trackFirstValueReached("color");
  };

  const applyAutoColorToAll = () => {
    if (mainBackgroundFile && !activeImageColorPalette) return;
    const linkedSlots = slots.filter((slot) => slot.autoColorRecipe && mainColorRecommendations[slot.id] && (mainBackgroundFile || slot.role !== "main_background_color"));
    setColors((current) => Object.fromEntries([...Object.entries(current), ...linkedSlots.map((slot) => [slot.id, mainColorRecommendations[slot.id]])]));
    setCandidateSelections((current) => Object.fromEntries([...Object.entries(current), ...linkedSlots.map((slot) => [slot.id, autoMainPaletteCandidateId])]));
  };

  const selectCandidate = (slot: ThemeAssetSlot, candidateId: string) => {
    const candidateChanged = candidateSelections[slot.id] !== candidateId;
    setCandidateSelections((current) => ({ ...current, [slot.id]: candidateId }));
    focusSlot(slot.id);
    trackFirstValueReached("candidate");

    if (slot.kind === "color") {
      setColors((current) => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
    } else if (candidateChanged) {
      // geometry/markers/inset/stretch는 이미지 픽셀 좌표다. 다른 후보를 고르면
      // 이전 이미지의 좌표를 새 이미지에 재사용하지 않고 기본 marker에서 다시 시작한다.
      clearBubbleEdits(slot.id);
      setLiveBubblePreview(null);
    }
    const assetSource = candidateId.startsWith(`${slot.id}:`) ? "user" : adminAssetsWithPreview.some((asset) => asset.id === candidateId) ? "admin" : "template";
    trackAnalyticsEvent("candidate_selected", { slot_role: slot.role, section: slot.section, asset_source: assetSource });
  };

  const copyBubbleToPair = async (sourceSlot: ThemeAssetSlot, targetSlot: ThemeAssetSlot) => {

    const sourceUpload = getSelectedUpload(sourceSlot, uploads, candidateSelections, slots);
    const sourceCandidate = getSelectedCandidate(sourceSlot, candidateSelections, templateId, activeTemplate);
    const copiedAt = Date.now();

    try {
      if (sourceUpload) {
        // 말풍선 슬롯은 업로드를 공유하므로 target bucket에 사본을 만들지 않는다. 사본을 만들면
        // 원본과 별개 항목이 되어 저장·내보내기에서 두 번 취급되고, 한쪽만 지워도 다른 쪽이 남는다.
        // 같은 업로드 ID를 target의 선택으로 기록하는 것이 곧 "같은 말풍선"이다.
        setCandidateSelections((current) => ({ ...current, [targetSlot.id]: sourceUpload.id }));
      } else if (sourceCandidate?.assetUrl) {
        const matchingTargetCandidate = getSlotCandidates(targetSlot, templateId, activeTemplate).find((candidate) => candidate.assetUrl === sourceCandidate.assetUrl);
        if (matchingTargetCandidate) {
          setCandidateSelections((current) => ({ ...current, [targetSlot.id]: matchingTargetCandidate.id }));
        } else {
          const response = await fetch(sourceCandidate.assetUrl);
          if (!response.ok) throw new Error("선택한 말풍선 이미지를 복사하지 못했습니다.");
          const blob = await response.blob();
          const copiedId = `${targetSlot.id}:bubble-copy:${copiedAt}`;
          const file = new File([blob], targetSlot.fileName ?? `${targetSlot.id}.png`, { type: blob.type || "image/png" });
          setUploads((current) => ({ ...current, [targetSlot.id]: [...(current[targetSlot.id] ?? []), { id: copiedId, file, source: "user" }] }));
          setCandidateSelections((current) => ({ ...current, [targetSlot.id]: copiedId }));
        }
      } else {
        throw new Error("복사할 말풍선 후보를 찾지 못했습니다.");
      }

      setBubbleMarkers((current) => copyBubbleEditValue(current, sourceSlot.id, targetSlot.id));
      setBubbleInsets((current) => copyBubbleEditValue(current, sourceSlot.id, targetSlot.id));
      setBubbleStretch((current) => copyBubbleEditValue(current, sourceSlot.id, targetSlot.id));
      setBubbleGeometry((current) => copyBubbleEditValue(current, sourceSlot.id, targetSlot.id));
      setBubbleFlipX((current) => copyBubbleEditValue(current, sourceSlot.id, targetSlot.id));
      setNotice({ tone: "success", message: `${targetSlot.label}에 같은 말풍선과 편집값을 적용했습니다.` });
      scheduleInteractionEvent("bubble_edit_completed", sourceSlot, { edit_type: "copy_to_pair" });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "말풍선을 복사하지 못했습니다." });
    }
  };

  const requestBubbleCopyToPair = (sourceSlot: ThemeAssetSlot) => {
    const targetSlot = slots.find((slot) => slot.role === getBubblePairRole(sourceSlot.role));
    if (!targetSlot) return;
    const targetHasOverrides = Boolean(
      (uploads[targetSlot.id]?.length ?? 0) ||
      bubbleGeometry[targetSlot.id] ||
      bubbleMarkers[targetSlot.id] ||
      bubbleInsets[targetSlot.id] ||
      bubbleStretch[targetSlot.id] ||
      bubbleFlipX[targetSlot.id],
    );
    if (targetHasOverrides) {
      setPendingBubbleCopy({ sourceSlot, targetSlot });
      return;
    }
    void copyBubbleToPair(sourceSlot, targetSlot);
  };

  const selectAdminAsset = async (slot: ThemeAssetSlot, asset: AdminAssetCandidate) => {
    const file = await adminAssetToFile(asset);
    setUploads((current) => {
      const entries = current[slot.id] ?? [];
      const nextEntries = entries.some((entry) => entry.id === asset.id) ? entries : [...entries, { id: asset.id, file, source: "admin" as const }];
      return { ...current, [slot.id]: nextEntries };
    });
    dropRemoteUploadRef(slot.id);
    if (asset.bubbleAdjustment) {
      setBubbleGeometry((current) => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
      // 관리자 에셋은 자체 조정값을 들고 온다. 이전 그림의 반전을 남기면 그 조정값과 어긋난다.
      setBubbleFlipX((current) => omitBubbleEditValue(current, slot.id));
      if (asset.bubbleAdjustment.markers) {
        setBubbleMarkers((current) => ({ ...current, [slot.id]: asset.bubbleAdjustment?.markers }));
      }
      if (asset.bubbleAdjustment.insets) {
        setBubbleInsets((current) => ({ ...current, [slot.id]: asset.bubbleAdjustment?.insets }));
      }
      if (asset.bubbleAdjustment.stretch) {
        setBubbleStretch((current) => ({ ...current, [slot.id]: asset.bubbleAdjustment?.stretch }));
      }
    }
    setCandidateSelections((current) => ({ ...current, [slot.id]: asset.id }));
    focusSlot(slot.id);
    revealSlot(slot);
    trackAnalyticsEvent("candidate_selected", { slot_role: slot.role, section: slot.section, asset_source: "admin" });
  };

  const applyBubbleDesign = (result: GeneratedBubbleDesign, decorationFiles: Partial<Record<string, File>>) => {
    if (!selectedSlot || !selectedBubbleSlot || result.asset.role !== selectedSlot.role) {
      setNotice({ tone: "error", message: "선택한 말풍선 슬롯과 생성 결과가 일치하지 않습니다." });
      return;
    }
    const generatedAt = Date.now();
    const uploadId = `${selectedSlot.id}:bubble-builder:${result.spec.familyId}:${generatedAt}:${result.asset.variant}`;

    const nextDraft = {
      ...draft,
      uploads: { ...uploads },
      remoteUploadRefs: { ...remoteUploadRefs },
      candidateSelections: { ...candidateSelections },
      bubbleGeometry: { ...bubbleGeometry },
      bubbleMarkers: { ...bubbleMarkers },
      bubbleInsets: { ...bubbleInsets },
      bubbleStretch: { ...bubbleStretch },
      bubbleFlipX: { ...bubbleFlipX },
      bubbleDesigns: { ...bubbleDesigns, [selectedSlot.role]: result.spec },
      bubbleDecorationSources: { ...bubbleDecorationSources },
      colors: { ...colors },
    };
    nextDraft.uploads[selectedSlot.id] = [...(nextDraft.uploads[selectedSlot.id] ?? []), { id: uploadId, file: result.asset.file, source: "user" as const }];
    delete nextDraft.remoteUploadRefs[selectedSlot.id];
    nextDraft.candidateSelections[selectedSlot.id] = uploadId;
    delete nextDraft.bubbleMarkers[selectedSlot.id];
    delete nextDraft.bubbleInsets[selectedSlot.id];
    delete nextDraft.bubbleStretch[selectedSlot.id];
    delete nextDraft.bubbleGeometry[selectedSlot.id];
    // 빌더가 만든 그림은 이미 원하는 방향으로 그려져 있다. 이전 그림의 반전을 물려받지 않는다.
    delete nextDraft.bubbleFlipX[selectedSlot.id];
    if (result.asset.markers) nextDraft.bubbleMarkers[selectedSlot.id] = result.asset.markers;
    if (result.asset.insets) nextDraft.bubbleInsets[selectedSlot.id] = result.asset.insets;
    if (result.asset.stretch) nextDraft.bubbleStretch[selectedSlot.id] = result.asset.stretch;
    const generatedGeometry = getIosBubbleGeometry(getBubbleVariantGeometry(result.spec.design, result.asset.variant));
    nextDraft.bubbleGeometry[selectedSlot.id] = { stretch: generatedGeometry.stretch, contentInsets: generatedGeometry.insets };
    if (result.spec.design.syncTextColorOnApply) {
      const colorRole = result.spec.side === "me" ? "chat_bubble_me_color" : "chat_bubble_you_color";
      const colorSlot = slots.find((slot) => slot.role === colorRole);
      if (colorSlot) nextDraft.colors[colorSlot.id] = result.spec.design.textColor;
    }
    // 장식 원본은 레이어 id를 key로 보관한다. 제거된 레이어와 단일 장식 시절 key는 함께 정리한다.
    const previousDesign = bubbleDesigns[selectedSlot.role];
    const nextLayers = result.spec.design.decorations ?? [];
    const nextLayerIds = new Set(nextLayers.map((layer) => layer.id));
    if (previousDesign) {
      for (const previousLayer of getBubbleDecorationLayers(previousDesign)) {
        if (!nextLayerIds.has(previousLayer.id)) delete nextDraft.bubbleDecorationSources[previousLayer.id];
      }
    }
    delete nextDraft.bubbleDecorationSources[result.spec.familyId];
    for (const layer of nextLayers) {
      const file = decorationFiles[layer.id];
      if (file) nextDraft.bubbleDecorationSources[layer.id] = file;
    }
    replaceDraft(nextDraft);
    const warningSuffix = result.warnings.length ? ` ${result.warnings[0].message}` : "";
    setNotice({ tone: result.warnings.length ? "warning" : "success", message: `${selectedSlot.label} 슬롯에 말풍선을 적용했습니다.${warningSuffix}` });
    if (selectedSlot) scheduleInteractionEvent("bubble_edit_completed", selectedSlot, { edit_type: "builder" });
  };

  const openSaveDialog = () => {
    setSaveMode(activeUserTemplate ? "overwrite" : "saveAs");
    setSaveName(activeUserTemplate?.name ?? `${displayTemplateName} 복사본`);
    setSaveDialogOpen(true);
  };

  const openSystemSaveDialog = () => {
    if (!isAdminMode) {
      setNotice({ tone: "warning", message: "시스템 템플릿 저장은 관리자 화면에서만 사용할 수 있습니다." });
      return;
    }

    const initialMetadata = getSystemTemplateDialogInitialization({
      activeSystemTemplate,
      current: {
        title: systemTitle,
        description: systemDescription,
        tags: systemTags,
        status: systemStatus,
        visibility: systemVisibility,
        pricingType: systemPricingType,
        priceAmount: systemPriceAmount,
        creditCost: systemCreditCost,
      },
      fallbackTitle: displayTemplateName,
      initialized: systemTemplateMetadataInitializedRef.current,
    });
    if (initialMetadata) {
      setSystemTitle(initialMetadata.title);
      setSystemDescription(initialMetadata.description);
      setSystemTags(initialMetadata.tags);
      setSystemStatus(initialMetadata.status);
      setSystemVisibility(initialMetadata.visibility);
      setSystemPricingType(initialMetadata.pricingType);
      setSystemPriceAmount(initialMetadata.priceAmount);
      setSystemCreditCost(initialMetadata.creditCost);
      systemTemplateMetadataInitializedRef.current = true;
    }
    setSystemSaveDialogOpen(true);
  };

  const previewProps = {
    analysis,
    activeSection,
    template: activeTemplate,
    templateId,
    slots,
    colors,
    selections: candidateSelections,
    bubbleEdits: renderedPreviewBubbleEdits,
    selectedSlotId: selectedSlot?.id,
    selectionPulseKey,
    onSelectSlot: selectPreviewSlot,
  };

  const mobilePreviewClearance = mobileSheetLiveHeight != null ? `min(${Math.round(mobileSheetLiveHeight)}px, ${mobileSheetHeight.half})` : mobileSheetSnap === "collapsed" ? mobileSheetHeight.collapsed : mobileSheetHeight.half;
  const mobileActionBarVisible = mobileSheetSnap === "collapsed" && mobileSheetLiveHeight == null;
  const mobileUsesSourceToggle = Boolean(selectedSlot && getBackgroundSourcePair(selectedSlot, slots));

  const quickEditPanel = (
    <ProjectQuickEditPanel
      slot={selectedSlot}
      slots={slots}
      file={selectedFile}
      uploads={uploads}
      colors={colors}
      selections={candidateSelections}
      adminAssets={adminAssetsWithPreview}
      hasMoreAdminAssets={Boolean(adminAssetCursor)}
      isLoadingAdminAssets={isLoadingAdminAssets}
      templateId={templateId}
      template={activeTemplate}
      platform={platform}
      selectedBubbleSlot={selectedBubbleSlot}
      pairedBubbleSlot={selectedBubblePairSlot}
      geometry={selectedSlot ? bubbleGeometry[selectedSlot.id] : undefined}
      markers={selectedSlot ? bubbleMarkers[selectedSlot.id] : undefined}
      insets={selectedSlot ? bubbleInsets[selectedSlot.id] : undefined}
      stretch={selectedSlot ? bubbleStretch[selectedSlot.id] : undefined}
      flipX={selectedSlot ? bubbleFlipX[selectedSlot.id] : undefined}
      onFlipXChange={(next) => {
        if (!selectedSlot) return;
        setBubbleFlipX((current) => (next ? { ...current, [selectedSlot.id]: true } : omitBubbleEditValue(current, selectedSlot.id)));
        scheduleInteractionEvent("bubble_edit_completed", selectedSlot, { edit_type: "flip" });
      }}
      fileInputRefs={fileInputRefs}
      onUpload={uploadSlot}
      onRemoveUpload={removeUploadedSlotCandidate}
      onEditedUpload={uploadEditedSlot}
      onColorChange={changeColor}
      onUnlinkColor={unlinkColor}
      imageColorPalette={activeImageColorPalette}
      imageColorPaletteError={imageColorPaletteError}
      recommendedColor={selectedSlot ? mainColorRecommendations[selectedSlot.id] : undefined}
      contrastWarning={selectedSlot ? contrastWarnings[selectedSlot.id] : undefined}
      isAutoColor={Boolean(selectedSlot && candidateSelections[selectedSlot.id] === autoMainPaletteCandidateId)}
      canApplyAutoColor={Boolean(selectedSlot?.autoColorRecipe && mainColorRecommendations[selectedSlot.id] && (!mainBackgroundFile || activeImageColorPalette) && (mainBackgroundFile || selectedSlot.role !== "main_background_color"))}
      canApplyAutoColorToAll={Boolean((!mainBackgroundFile || activeImageColorPalette) && Object.keys(mainColorRecommendations).length)}
      onApplyAutoColor={() => selectedSlot && applyAutoColor(selectedSlot)}
      onApplyAutoColorToAll={applyAutoColorToAll}
      onSelectCandidate={selectCandidate}
      onSelectAdminAsset={(slot, asset) => void selectAdminAsset(slot, asset)}
      onLoadMoreAdminAssets={() => void loadMoreAdminAssets()}
      onGeometryChange={(geometry) => { if (!selectedSlot) return; setBubbleGeometry((current) => ({ ...current, [selectedSlot.id]: geometry })); setLiveBubblePreview(null); }}
      onMarkersChange={(markers) => { if (!selectedSlot) return; setBubbleGeometry((current) => omitBubbleEditValue(current, selectedSlot.id)); setBubbleMarkers((current) => ({ ...current, [selectedSlot.id]: markers })); scheduleInteractionEvent("bubble_edit_completed", selectedSlot, { edit_type: "markers" }); }}
      onInsetsChange={(insets) => { if (!selectedSlot) return; setBubbleGeometry((current) => omitBubbleEditValue(current, selectedSlot.id)); setBubbleInsets((current) => ({ ...current, [selectedSlot.id]: insets })); scheduleInteractionEvent("bubble_edit_completed", selectedSlot, { edit_type: "insets" }); }}
      onStretchChange={(stretch) => { if (!selectedSlot) return; setBubbleGeometry((current) => omitBubbleEditValue(current, selectedSlot.id)); setBubbleStretch((current) => ({ ...current, [selectedSlot.id]: stretch })); scheduleInteractionEvent("bubble_edit_completed", selectedSlot, { edit_type: "stretch" }); }}
      candidateOpen={candidateOpen}
      onToggleCandidates={() => setCandidateOpen((current) => !current)}
      onOpenBubbleBuilder={() => setBubbleBuilderOpen(true)}
      onCopyBubbleToPair={requestBubbleCopyToPair}
      onBubblePreviewChange={(edit) => { if (selectedSlot) setLiveBubblePreview({ role: selectedSlot.role, edit }); }}
    />
  );

  const mobileEditPanel = (
    <MobileQuickEditPanel
      slot={selectedSlot}
      slots={slots}
      file={selectedFile}
      uploads={uploads}
      colors={colors}
      selections={candidateSelections}
      adminAssets={adminAssetsWithPreview}
      templateId={templateId}
      template={activeTemplate}
      platform={platform}
      selectedBubbleSlot={selectedBubbleSlot}
      pairedBubbleSlot={selectedBubblePairSlot}
      geometry={selectedSlot ? bubbleGeometry[selectedSlot.id] : undefined}
      markers={selectedSlot ? bubbleMarkers[selectedSlot.id] : undefined}
      insets={selectedSlot ? bubbleInsets[selectedSlot.id] : undefined}
      stretch={selectedSlot ? bubbleStretch[selectedSlot.id] : undefined}
      flipX={selectedSlot ? bubbleFlipX[selectedSlot.id] : undefined}
      onFlipXChange={(next) => {
        if (!selectedSlot) return;
        setBubbleFlipX((current) => (next ? { ...current, [selectedSlot.id]: true } : omitBubbleEditValue(current, selectedSlot.id)));
        scheduleInteractionEvent("bubble_edit_completed", selectedSlot, { edit_type: "flip" });
      }}
      contrastWarning={selectedSlot ? contrastWarnings[selectedSlot.id] : undefined}
      recommendedColor={selectedSlot ? mainColorRecommendations[selectedSlot.id] : undefined}
      isAutoColor={Boolean(selectedSlot && candidateSelections[selectedSlot.id] === autoMainPaletteCandidateId)}
      canApplyAutoColor={Boolean(selectedSlot?.autoColorRecipe && mainColorRecommendations[selectedSlot.id] && (!mainBackgroundFile || activeImageColorPalette) && (mainBackgroundFile || selectedSlot.role !== "main_background_color"))}
      fileInputRefs={fileInputRefs}
      onUpload={uploadSlot}
      onEditedUpload={uploadEditedSlot}
      onRemoveUpload={removeUploadedSlotCandidate}
      onColorChange={changeColor}
      onUnlinkColor={unlinkColor}
      onSelectCandidate={selectCandidate}
      onSelectAdminAsset={(slot, asset) => void selectAdminAsset(slot, asset)}
      onApplyAutoColor={() => selectedSlot && applyAutoColor(selectedSlot)}
      onGeometryChange={(geometry) => { if (!selectedSlot) return; setBubbleGeometry((current) => ({ ...current, [selectedSlot.id]: geometry })); setLiveBubblePreview(null); }}
      onMarkersChange={(markers) => { if (!selectedSlot) return; setBubbleMarkers((current) => ({ ...current, [selectedSlot.id]: markers })); }}
      onInsetsChange={(insets) => { if (!selectedSlot) return; setBubbleInsets((current) => ({ ...current, [selectedSlot.id]: insets })); }}
      onStretchChange={(stretch) => { if (!selectedSlot) return; setBubbleStretch((current) => ({ ...current, [selectedSlot.id]: stretch })); scheduleInteractionEvent("bubble_edit_completed", selectedSlot, { edit_type: "geometry" }); }}
      onOpenBubbleBuilder={() => setBubbleBuilderOpen(true)}
      onCopyBubbleToPair={requestBubbleCopyToPair}
      onBubblePreviewChange={(edit) => { if (selectedSlot) setLiveBubblePreview({ role: selectedSlot.role, edit }); }}
      candidateGridExpanded={mobileSheetSnap === "full"}
      onToggleCandidateGrid={() => setMobileSheetSnap((current) => (current === "full" ? "half" : "full"))}
    />
  );

  if (editorTabLockStatus === "blocked") {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f8fafc] p-5 text-[#0f172a]">
        <section className="w-full max-w-md rounded-[28px] border border-[#dbe3ed] bg-white p-6 text-center shadow-[0_24px_72px_rgba(15,23,42,0.12)]">
          <h1 className="text-xl font-black">다른 탭에서 편집 중입니다.</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#64748b]">
            작업 충돌을 막기 위해 편집기는 한 탭에서만 사용할 수 있습니다. 기존 편집 탭을 종료한 뒤 다시 열어 주세요.
          </p>
          <button type="button" className="mt-6 min-h-11 w-full rounded-xl bg-[#0f172a] px-4 text-sm font-black text-white" onClick={() => router.push(exitDestination)}>
            {isAdminMode ? "관리자 페이지로 돌아가기" : "템플릿 갤러리로 돌아가기"}
          </button>
        </section>
      </main>
    );
  }

  if (editorTabLockStatus === "pending") {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f8fafc] p-5 text-[#0f172a]">
        <p className="text-sm font-bold text-[#64748b]">편집기를 준비하는 중입니다.</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden overflow-y-auto px-3 py-3 text-[#111827] md:px-4 md:py-4 lg:h-[100dvh] lg:overflow-hidden">
      {selectedSlot && selectedBubbleSlot && selectedBubbleVariant ? <BubbleBuilderDialog open={bubbleBuilderOpen} side={selectedBubbleSlot} variant={selectedBubbleVariant} slotLabel={selectedSlot.label} platform={platform} initialSpec={selectedBubbleDesign} initialDecorationFiles={bubbleDecorationSources} onOpenChange={setBubbleBuilderOpen} onApply={applyBubbleDesign} /> : null}
      {notice ? <HeaderNotice notice={notice} onDismiss={dismissNotice} /> : null}
      {pendingAutosave ? (
        <AutosaveResumeDialog
          record={pendingAutosave}
          onResume={() => answerAutosaveDecision("resume")}
          onDiscard={() => answerAutosaveDecision("discard")}
        />
      ) : null}
      <Dialog.Root open={Boolean(pendingBubbleCopy)} onOpenChange={(open) => { if (!open) setPendingBubbleCopy(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[110] bg-slate-950/40 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[111] w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-[#dbe3ed] bg-white p-5 shadow-[0_24px_72px_rgba(15,23,42,0.24)] outline-none">
            <Dialog.Title className="text-lg font-black text-[#0f172a]">말풍선 설정을 덮어쓸까요?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">
              {pendingBubbleCopy ? <><strong className="font-black text-[#334155]">{pendingBubbleCopy.targetSlot.label}</strong>에 선택한 말풍선 이미지와 조절값을 적용합니다. 기존 설정은 바뀝니다.</> : null}
            </Dialog.Description>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Dialog.Close asChild><button type="button" className="min-h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-black text-[#475569] transition hover:bg-[#f8fafc]">취소</button></Dialog.Close>
              <button type="button" className="min-h-11 rounded-xl bg-[#0f172a] px-3 text-sm font-black text-white transition hover:bg-[#1e293b]" onClick={() => { if (!pendingBubbleCopy) return; const copy = pendingBubbleCopy; setPendingBubbleCopy(null); void copyBubbleToPair(copy.sourceSlot, copy.targetSlot); }}>적용하기</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {saveDialogOpen ? (
        <SaveTemplateDialog
          activeUserTemplate={activeUserTemplate}
          isSaving={isSavingTemplate}
          mode={saveMode}
          name={saveName}
          onClose={() => {
            if (!isSavingTemplate) setSaveDialogOpen(false);
          }}
          onModeChange={setSaveMode}
          onNameChange={setSaveName}
          onSubmit={() => void saveCurrentTemplate()}
        />
      ) : null}
      {exportDialogOpen ? (
        <ExportDialog
          isExporting={isExporting}
          isPreparingExport={isPreparingExport}
          downloadResult={exportDownloadResult}
          preparationError={exportPreparationError}
          platform={platform}
          exportMode={exportMode}
          exportName={exportName}
          progressStep={exportProgressStep}
          elapsedSeconds={exportElapsedSeconds}
          accountState={accountState}
          isAccountLoading={isAccountLoading}
          onClose={() => {
            if (!isExporting) {
              setExportDialogOpen(false);
            }
          }}
          onModeChange={setExportMode}
          onNameChange={(value) => {
            setExportName(value);
          }}
          onLogin={() => void persistRecoveryThenNavigate("login_required", "login", { exportMode, name: exportName })}
          onBuyCredits={() => {
            trackAnalyticsEvent("export_blocked_insufficient_credits", { platform, export_mode: exportMode, credits_remaining: accountState?.credits ?? 0 });
            void persistRecoveryThenNavigate("insufficient_credits", "credits", { exportMode, name: exportName });
          }}
          onRetryPreparation={() => void openExportDialog()}
          onSubmit={() => void submitExport()}
        />
      ) : null}
      {isAdminMode && systemSaveDialogOpen ? (
        <SystemTemplateSaveDialog
          isSaving={isSavingSystemTemplate}
          title={systemTitle}
          description={systemDescription}
          tags={systemTags}
          status={systemStatus}
          visibility={systemVisibility}
          pricingType={systemPricingType}
          priceAmount={systemPriceAmount}
          creditCost={systemCreditCost}
          onClose={() => {
            if (!isSavingSystemTemplate) setSystemSaveDialogOpen(false);
          }}
          onTitleChange={setSystemTitle}
          onDescriptionChange={setSystemDescription}
          onTagsChange={setSystemTags}
          onStatusChange={setSystemStatus}
          onVisibilityChange={setSystemVisibility}
          onPricingTypeChange={setSystemPricingType}
          onPriceAmountChange={setSystemPriceAmount}
          onCreditCostChange={setSystemCreditCost}
          onSubmit={() => void saveSystemTemplate()}
        />
      ) : null}
      {exitConfirmOpen ? (
        <ExitConfirmDialog
          hasUnsavedChanges={hasUnsavedChanges}
          isExporting={isExporting}
          isSaving={exitSaveState === "saving"}
          saveFailed={exitSaveState === "error"}
          onCancel={cancelExit}
          onConfirm={() => void confirmExit()}
          onDiscard={navigateAfterExit}
        />
      ) : null}

      {initialLoadState.status === "loading" ? (
        <InitialTemplateLoadingPanel
          message={initialLoadState.message ?? "템플릿을 불러오는 중입니다."}
          detail={initialLoadState.detail}
          current={initialLoadState.current}
          total={initialLoadState.total}
        />
      ) : null}
      {initialLoadState.status === "error" ? <InitialTemplateErrorPanel message={initialLoadState.message ?? "템플릿을 불러오지 못했습니다."} onStartDefault={startDefaultTemplate} /> : null}

      {initialLoadState.status === "ready" ? (
        <div className={viewportMode === "mobile" ? "flex h-[calc(100dvh-1.5rem)] min-h-0 min-w-0 w-full flex-col overflow-hidden" : "grid h-[calc(100dvh-1.5rem)] min-h-full min-w-0 w-full grid-rows-[auto_1fr] gap-3 md:h-[calc(100dvh-2rem)] md:gap-4 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)]"}>
          {viewportMode === "desktop" ? (
            <header className="grid min-h-[56px] min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white/95 px-3 py-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-4 md:px-4">
              <div className="flex items-center min-w-0 gap-2 justify-self-start md:gap-4">
                <button
                  type="button"
                  onClick={requestExit}
                  aria-label="편집 종료"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e5e7eb] bg-[#f8fafc] text-xl font-bold leading-none text-[#111827] transition hover:bg-white"
                >
                  &larr;
                </button>
                <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-[#0f172a] md:text-[22px]">{displayTemplateName}</h1>
              </div>

              <div className="flex items-center min-w-0 col-span-2 row-start-3 gap-2 overflow-hidden justify-self-stretch md:col-span-1 md:row-auto md:gap-3 md:justify-self-center">
                <div className="hidden shrink-0 rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-2.5 py-1 text-[11px] font-semibold text-[#475569] md:block">
                  {platform === "android" ? "Android" : "iOS"}
                </div>
                <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-[#e5e7eb] md:w-24 md:flex-none">
                  <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${completion.total > 0 ? Math.round((completion.ready / completion.total) * 100) : 0}%` }} />
                </div>
                <span className="shrink-0 text-xs font-semibold text-[#64748b]">
                  {completion.ready}/{completion.total} 준비
                </span>
                <AutosaveStatusBadge status={autosaveStatus} savedAt={autosaveSavedAt} className="hidden shrink-0 md:inline-flex" />
                <span className={`hidden shrink-0 text-xs font-semibold lg:inline ${analysis.diagnostics.length > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {analysis.diagnostics.length > 0 ? `${analysis.diagnostics.length}개 확인 필요` : "문제 없음"}
                </span>
                <span className="hidden min-w-0 truncate text-xs font-medium text-[#64748b] xl:block">
                  {sectionLabels[activeSection]} / {selectedSlot?.label ?? "선택된 요소 없음"}
                </span>
              </div>

              <div className="col-span-2 row-start-2 flex max-w-full min-w-0 flex-wrap items-center justify-end gap-1.5 justify-self-stretch md:col-span-1 md:row-auto md:flex-nowrap md:gap-2 md:justify-self-end">
                {isAdminMode ? (
                  <button
                    type="button"
                    className="rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:bg-[#1e293b] disabled:cursor-wait disabled:opacity-60"
                    onClick={openSystemSaveDialog}
                    disabled={isSavingSystemTemplate}
                  >
                    {isSavingSystemTemplate ? "저장 중.." : "시스템 템플릿으로 저장"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${isAdminMode ? "hidden" : ""} rounded-xl border border-[#d1d5db] bg-white px-2.5 py-2 text-[11px] font-semibold text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-wait disabled:opacity-60 md:px-3.5 md:text-xs`}
                  onClick={openSaveDialog}
                  disabled={isSavingTemplate}
                >
                  {isSavingTemplate ? "저장 중.." : <><span className="md:hidden">저장</span><span className="hidden md:inline">내 템플릿으로 저장</span></>}
                </button>
                <button
                  type="button"
                  className={`${isAdminMode ? "hidden" : ""} rounded-xl bg-[#0f172a] px-3 py-2.5 text-xs font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:bg-[#1e293b] disabled:cursor-wait disabled:opacity-60 md:px-4 md:text-sm`}
                  onClick={() => void openExportDialog()}
                  disabled={isPreparingExport || isExporting}
                >
                  {isExporting ? "다운로드 준비 중.." : isPreparingExport ? "다운로드 준비 중…" : "다운로드"}
                </button>
              </div>
            </header>
          ) : null}

          {viewportMode === "mobile" ? (
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              <MobileEditActionBar
                visible={mobileActionBarVisible}
                isAdminMode={isAdminMode}
                isSaving={isAdminMode ? isSavingSystemTemplate : isSavingTemplate}
                isExporting={isExporting}
                isPreparingExport={isPreparingExport}
                templateName={displayTemplateName}
                autosaveStatus={autosaveStatus}
                autosaveSavedAt={autosaveSavedAt}
                onBack={requestExit}
                onSave={isAdminMode ? openSystemSaveDialog : openSaveDialog}
                onExport={() => void openExportDialog()}
              />
              <div
                className="relative flex-1 min-h-0 overflow-hidden"
                style={{
                  paddingBottom: mobilePreviewClearance,
                  transition: mobileSheetLiveHeight != null ? "none" : "padding-bottom 360ms cubic-bezier(0.22,1,0.36,1)",
                }}
              >
                <MobileScaledPreview section={activeSection} placement={mobileSheetSnap === "collapsed" ? "center" : "raised"} isResizing={mobileSheetLiveHeight != null}>
                  <ProjectPreviewPanel {...previewProps} className="w-full h-full" />
                </MobileScaledPreview>
              </div>
              <MobileEditSheet
                snap={mobileSheetSnap}
                onSnapChange={setMobileSheetSnap}
                onLiveHeightChange={setMobileSheetLiveHeight}
                ariaLabel={selectedSlot ? `${selectedSlot.label} 편집 패널` : "요소 편집 패널"}
              >
                <div className="shrink-0">
                  <MobileSectionNav activeSection={activeSection} slots={slots} onSelectSection={selectSection} />
                </div>
                {mobileSheetSnap !== "collapsed" ? (
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1]">
                    <div className="grid gap-3 pb-2">
                      <MobileGroupSlotList
                        groups={groups}
                        activeGroup={activeGroup}
                        onSelectGroup={selectGroup}
                        slots={visibleSlots}
                        selectedSlotId={selectedSlot?.id}
                        uploads={uploads}
                        colors={colors}
                        selections={candidateSelections}
                        templateId={templateId}
                        template={activeTemplate}
                        adminAssets={adminAssetsWithPreview}
                        contrastWarnings={contrastWarnings}
                        hideSlotPicker={mobileUsesSourceToggle}
                        onSelectSlot={requestMobileSlotChange}
                      />
                      {selectedSlot ? (
                        <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">{mobileEditPanel}</div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="sr-only" aria-live="polite">
                    편집 패널이 섹션 선택 상태로 접혔습니다.
                  </div>
                )}
              </MobileEditSheet>
            </div>
          ) : viewportMode === "pending" ? (
            <div className="min-h-0" />
          ) : (
            // 섹션레일,편집창,프리뷰
            <section className="grid min-h-0 min-w-0 w-full grid-cols-1 content-start gap-3 lg:grid-cols-[auto_minmax(0,1fr)_280px] lg:grid-rows-1 xl:grid-cols-[auto_minmax(0,1fr)_300px] 2xl:grid-cols-[auto_minmax(0,1fr)_320px]">
              <div className="order-1 h-full min-w-0 lg:order-none">
                <ProjectSectionRail
                  activeSection={activeSection}
                  slots={slots}
                  onSelectSection={selectSection}
                />
              </div>

              <section className="order-3 grid min-h-0 min-w-0 grid-cols-1 gap-3 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white/95 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm md:grid-cols-[224px_minmax(0,1fr)] md:gap-0 lg:order-none xl:grid-cols-[248px_minmax(0,1fr)]">
                <ProjectGroupRail
                  groups={groups}
                  activeGroup={activeGroup}
                  onSelectGroup={selectGroup}
                  slots={visibleSlots}
                  selectedSlotId={selectedSlot?.id}
                  uploads={uploads}
                  colors={colors}
                  selections={candidateSelections}
                  templateId={templateId}
                  template={activeTemplate}
                  contrastWarnings={contrastWarnings}
                  onSelectSlot={(slot) => {
                    focusSlot(slot.id);
                    revealSlot(slot);
                    setMobileEditSheetOpen(true);
                  }}
                />

                <button
                  ref={mobileEditTriggerButtonRef}
                  type="button"
                  className="inline-flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-4 text-left text-sm font-bold text-[#1d4ed8] shadow-sm lg:hidden"
                  onClick={() => setMobileEditSheetOpen(true)}
                >
                  <span className="min-w-0 truncate">{selectedSlot ? `${selectedSlot.label} 편집` : "선택한 요소 편집"}</span>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-black">열기</span>
                </button>

                {mobileEditSheetOpen ? (
                  <button
                    type="button"
                    className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] lg:hidden"
                    aria-label="편집 패널 닫기"
                    onClick={() => setMobileEditSheetOpen(false)}
                  />
                ) : null}

                <div
                  ref={mobileEditSheetRef}
                  role={mobileEditSheetOpen ? "dialog" : undefined}
                  aria-modal={mobileEditSheetOpen ? "true" : undefined}
                  aria-label={selectedSlot ? `${selectedSlot.label} 편집 패널` : "요소 편집 패널"}
                  className={`${mobileEditSheetOpen ? "fixed inset-x-3 bottom-3 z-50 grid max-h-[82dvh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[28px] border border-[#dbe3ed] bg-white p-3 shadow-[0_28px_80px_rgba(15,23,42,0.28)]" : "hidden"} min-h-0 min-w-0 lg:static lg:z-auto lg:grid lg:h-full lg:max-h-full lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:px-3 lg:shadow-none`}
                >
                  <div className="mb-2 grid gap-2 rounded-2xl bg-[#f8fafc] px-3 py-2 lg:hidden">
                    <span className="mx-auto h-1 w-10 rounded-full bg-[#cbd5e1]" aria-hidden="true" />
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#2563eb]">Quick edit</p>
                        <strong className="block truncate text-sm font-black text-[#0f172a]">{selectedSlot?.label ?? "선택한 요소"}</strong>
                        <span className="mt-0.5 block truncate text-[11px] font-bold text-[#64748b]">
                          {sectionLabels[activeSection]} · {groupLabels[activeGroup] ?? activeGroup}
                          {selectedSlot?.fileName ? ` · ${selectedSlot.fileName}` : ""}
                        </span>
                      </div>
                      <button
                        ref={mobileEditCloseButtonRef}
                        type="button"
                        className="grid size-9 shrink-0 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#475569] transition hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                        aria-label="편집 패널 닫기"
                        onClick={() => setMobileEditSheetOpen(false)}
                      >
                        <X size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 overflow-y-auto pr-1 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1] lg:h-full">
                    {quickEditPanel}
                  </div>
                </div>
              </section>

              {/* 프리뷰섹션 */}
              <ProjectPreviewPanel
                analysis={analysis}
                activeSection={activeSection}
                template={activeTemplate}
                templateId={templateId}
                slots={slots}
                colors={colors}
                selections={candidateSelections}
                bubbleEdits={renderedPreviewBubbleEdits}
                selectedSlotId={selectedSlot?.id}
                selectionPulseKey={selectionPulseKey}
                className="order-2 min-h-[420px] lg:order-none lg:min-h-0"
                onSelectSlot={selectPreviewSlot}
              />
            </section>
          )}
        </div>
      ) : null}
    </main>
  );
}


// flipX(boolean)까지 같은 helper로 복사하므로 원시값도 받는다. 복제는 객체일 때만 의미가 있다.
function copyBubbleEditValue<T>(current: Partial<Record<string, T>>, sourceSlotId: string, targetSlotId: string) {
  const next = { ...current };
  const value = current[sourceSlotId];
  if (value === undefined) {
    delete next[targetSlotId];
  } else {
    next[targetSlotId] = typeof value === "object" && value !== null && typeof structuredClone === "function" ? structuredClone(value) : value;
  }
  return next;
}

function bubbleVariantFromRole(role: ThemeResourceRole): BubbleBuilderVariant | null {
  if (role === "bubble_me_1" || role === "bubble_you_1") return "first";
  if (role === "bubble_me_2" || role === "bubble_you_2") return "group";
  return null;
}

function getBubbleDesign(designs: BubbleDesigns, role: ThemeResourceRole, legacySide: BubbleBuilderSide): BubbleFamilyDesignSpec | undefined {
  return designs[role] ?? (designs as Record<string, BubbleFamilyDesignSpec | undefined>)[legacySide];
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true" && element.offsetParent !== null);
}

function slotEditFromRole(
  role: ThemeResourceRole,
  slots: ThemeAssetSlot[],
  bubbleGeometry: Partial<Record<string, BubbleGeometry>>,
  bubbleMarkers: Partial<Record<string, Markers>>,
  bubbleInsets: Partial<Record<string, Insets>>,
  bubbleStretch: Partial<Record<string, StretchPoint>>,
  bubbleFlipX: Partial<Record<string, boolean>>,
): BubbleEditState | undefined {
  const slot = slots.find((item) => item.role === role);
  if (!slot) return undefined;

  const next = {
    geometry: bubbleGeometry[slot.id],
    markers: bubbleMarkers[slot.id],
    insets: bubbleInsets[slot.id],
    stretch: bubbleStretch[slot.id],
    flipX: bubbleFlipX[slot.id],
  };

  // 반전만 있고 좌표 편집이 없는 슬롯도 편집 상태다. flipX를 빼면 하류가 반전을 못 본다.
  return next.geometry || next.markers || next.insets || next.stretch || next.flipX ? next : undefined;
}

function omitBubbleEditValue<T>(values: Partial<Record<string, T>>, slotId: string) {
  if (!(slotId in values)) return values;
  const next = { ...values };
  delete next[slotId];
  return next;
}
