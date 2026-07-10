"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { persistEditorSession, takeTemplateStartPayload } from "@/components/project/editorSession";
import { ExitConfirmDialog } from "@/components/project/dialogs/ExitConfirmDialog";
import { ExportDialog } from "@/components/project/dialogs/ExportDialog";
import { InitialTemplateErrorPanel, InitialTemplateLoadingPanel } from "@/components/project/dialogs/InitialTemplatePanels";
import { SaveTemplateDialog } from "@/components/project/dialogs/SaveTemplateDialog";
import { SystemTemplateSaveDialog } from "@/components/project/dialogs/SystemTemplateSaveDialog";
import { getDefaultSlotCandidateId, getMissingRemoteUploadSlotIds, keepCurrentRemoteUploads, mergeSlotUploads } from "@/components/project/projectImporterHelpers";
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
import { useViewportMode } from "@/components/project/hooks/useViewportMode";
import { useProjectAutoColors } from "@/components/project/hooks/useProjectAutoColors";
import { useProjectAssetUploads } from "@/components/project/hooks/useProjectAssetUploads";
import { useProjectExport } from "@/components/project/hooks/useProjectExport";
import {
  bubbleSlotFromRole,
  getCompletion,
  getInitialSlotCandidateSelections,
  getResolvedColor,
  getSectionGroups,
  getSelectedCandidate,
  getSlotFile,
  groupLabels,
  isSlotVisibleInGroup,
  isSlotVisibleInSection,
  sectionLabels,
  type BubbleEditState,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/components/project/projectModel";
import { adminAssetToFile, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
import { normalizeLegacyColorOverrides } from "@/lib/theme/project/legacyOverrides";
import { getImageColorFallbackRole } from "@/lib/theme/project/state";
import { autoMainPaletteCandidateId } from "@/lib/theme/autoColor";
import type { ImageEditState, ImageEditTarget } from "@/lib/theme/imageEdit";
import { systemTemplateRepository, type RemoteSlotUploads, type SystemTemplatePricingType, type SystemTemplateStatus, type SystemTemplateVisibility } from "@/lib/theme/systemTemplates";
import { convertSystemTemplateOverridesByRole } from "@/lib/theme/systemTemplates/roleOverrides";
import { getUserTemplate, saveUserTemplate } from "@/lib/theme/userTemplates";
import {
  getThemeSlots,
  getThemeTemplate,
  type ThemeAssetSlot,
  type ThemeTemplate,
  type ThemeTemplateId,
} from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

type Notice = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
};

type ActiveUserTemplate = {
  id: string;
  name: string;
  createdAt: number;
};

type ActiveSystemTemplate = {
  id: string;
  bundleId?: string;
  title: string;
  description?: string;
  tags: string[];
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  pricingType: SystemTemplatePricingType;
  priceAmount?: number;
  creditCost?: number;
  createdAt: number;
};

type InitialLoadState = {
  status: "idle" | "ready" | "loading" | "error";
  message?: string;
  detail?: string;
  current?: number;
  total?: number;
};

type ProjectImporterClientProps = {
  mode?: "user" | "admin";
};

export default function ProjectImporterClient({ mode = "user" }: ProjectImporterClientProps) {
  const isAdminMode = mode === "admin";
  const router = useRouter();
  const [templateId, setTemplateId] = useState<ThemeTemplateId>("basic");
  const [initialLoadState, setInitialLoadState] = useState<InitialLoadState>({ status: "idle" });
  const [platform, setPlatform] = useState<ThemePlatform>("android");
  const [activeSection, setActiveSection] = useState<ThemeSection>("main");
  const [activeGroup, setActiveGroup] = useState<ThemeSlotGroup>("background");
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>();
  const [selectionPulseKey, setSelectionPulseKey] = useState(0);
  const [uploads, setUploads] = useState<SlotUploads>({});
  const [remoteUploadRefs, setRemoteUploadRefs] = useState<RemoteSlotUploads>({});
  const [colors, setColors] = useState<SlotColors>({});
  const [candidateSelections, setCandidateSelections] = useState<SlotCandidateSelections>({});
  const [candidateOpen, setCandidateOpen] = useState(true);
  const [mobileEditSheetOpen, setMobileEditSheetOpen] = useState(false);
  const [mobileSheetSnap, setMobileSheetSnap] = useState<MobileSheetSnap>("collapsed");
  const [mobileSheetLiveHeight, setMobileSheetLiveHeight] = useState<number | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
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
  const [isSavingSystemTemplate, setIsSavingSystemTemplate] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [bubbleMarkers, setBubbleMarkers] = useState<Partial<Record<string, Markers>>>({});
  const [bubbleInsets, setBubbleInsets] = useState<Partial<Record<string, Insets>>>({});
  const [bubbleStretch, setBubbleStretch] = useState<Partial<Record<string, StretchPoint>>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const skipDefaultSelectionResetRef = useRef(false);
  const uploadsRef = useRef<SlotUploads>({});
  const remoteUploadRefsRef = useRef<RemoteSlotUploads>({});
  const mobileEditSheetRef = useRef<HTMLDivElement | null>(null);
  const mobileEditTriggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileEditCloseButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => {
    remoteUploadRefsRef.current = remoteUploadRefs;
  }, [remoteUploadRefs]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.pushState({ kakaoThemeEditorExitGuard: true }, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState({ kakaoThemeEditorExitGuard: true }, "", window.location.href);
      setExitConfirmOpen(true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const requestExit = () => setExitConfirmOpen(true);
  const cancelExit = () => setExitConfirmOpen(false);
  const confirmExit = () => {
    setExitConfirmOpen(false);
    router.push("/template");
  };

  useEffect(() => {
    let active = true;
    const payload = takeTemplateStartPayload(mode);
    if (!payload) {
      setInitialLoadState({ status: "ready" });
      return () => {
        active = false;
      };
    }

    const requiresSystemTemplateLoad = Boolean(payload.systemTemplateId || (payload.sourceSystemTemplateId && payload.systemTemplateBundleId));
    setInitialLoadState(requiresSystemTemplateLoad ? createInitialLoadProgress("템플릿 정보를 확인하는 중입니다.", 0, 3) : { status: "ready" });

    const loadStartedTemplate = async () => {
      setTemplateId(payload.templateId);
      setPlatform(payload.platform);
      setActiveSection("main");
      setActiveGroup("background");
      setSelectedSlotId(undefined);
      setUploads({});
      remoteUploadRefsRef.current = {};
      setRemoteUploadRefs({});
      setColors({});
      setActiveUserTemplate(null);
      setActiveSystemTemplate(null);
      setSystemTemplateBundleId(payload.systemTemplateBundleId ?? null);

      if (payload.systemTemplateId) {
        try {
          setInitialLoadState(createInitialLoadProgress("템플릿 정보를 확인하는 중입니다.", 0, 3));
          const savedTemplate = await systemTemplateRepository.getMetadata(payload.systemTemplateId);
          if (!active) return;
          if (!savedTemplate) {
            setInitialLoadState({ status: "error", message: "시스템 템플릿을 찾을 수 없습니다." });
            return;
          }

          skipDefaultSelectionResetRef.current = true;
          const normalizedOverrides = normalizeLegacyColorOverrides(savedTemplate.platform, savedTemplate.overrides.colors, savedTemplate.overrides.candidateSelections);
          setTemplateId(savedTemplate.baseTemplateId);
          setPlatform(payload.platform);
          const previewSlotIds = getInitialPreviewSlotIds(savedTemplate.platform, savedTemplate.overrides.uploadRefs);
          const progressTotal = Math.max(3, previewSlotIds.length + 2);
          setInitialLoadState(
            createInitialLoadProgress("미리보기 에셋을 준비하는 중입니다.", 1, progressTotal, previewSlotIds.length ? `${previewSlotIds.length}개 핵심 에셋을 불러옵니다.` : "저장된 색상과 기본 에셋으로 미리보기를 준비합니다."),
          );
          const previewUploads = await hydrateUploadSlotsWithProgress(savedTemplate.overrides.uploadRefs, previewSlotIds, (completed, total) => {
            if (!active) return;
            setInitialLoadState(createInitialLoadProgress("미리보기 에셋을 준비하는 중입니다.", 1 + completed, Math.max(3, total + 2), `${completed}/${total}개 에셋 완료`));
          });
          if (!active) return;
          setInitialLoadState(createInitialLoadProgress("편집 화면을 구성하는 중입니다.", progressTotal - 1, progressTotal));
          remoteUploadRefsRef.current = savedTemplate.overrides.uploadRefs;
          setRemoteUploadRefs(savedTemplate.overrides.uploadRefs);
          setUploads(previewUploads);
          setColors(normalizedOverrides.colors);
          setCandidateSelections(normalizedOverrides.candidateSelections);
          setBubbleMarkers(savedTemplate.overrides.bubbleEdits.markers);
          setBubbleInsets(savedTemplate.overrides.bubbleEdits.insets);
          setBubbleStretch(savedTemplate.overrides.bubbleEdits.stretch);
          setActiveSystemTemplate({
            id: savedTemplate.id,
            bundleId: savedTemplate.bundleId ?? savedTemplate.id,
            title: savedTemplate.title,
            description: savedTemplate.description,
            tags: savedTemplate.tags,
            status: savedTemplate.status,
            visibility: savedTemplate.visibility,
            pricingType: savedTemplate.pricingType,
            priceAmount: savedTemplate.priceAmount,
            creditCost: savedTemplate.creditCost,
            createdAt: savedTemplate.createdAt,
          });
          setNotice({ tone: "success", message: `${savedTemplate.title} 시스템 템플릿을 불러왔습니다.` });
          setInitialLoadState({ status: "ready" });
          void hydrateSystemTemplateUploads(savedTemplate.overrides.uploadRefs);
        } catch (error) {
          console.error(error);
          setInitialLoadState({ status: "error", message: "시스템 템플릿 에셋을 불러오는 중 오류가 발생했습니다." });
        }
        return;
      }

      if (payload.sourceSystemTemplateId && payload.systemTemplateBundleId) {
        try {
          const sourceTemplate = await systemTemplateRepository.get(payload.sourceSystemTemplateId);
          if (!active) return;
          if (!sourceTemplate) {
            setInitialLoadState({ status: "error", message: "원본 시스템 템플릿을 찾을 수 없습니다." });
            return;
          }

          const baseTemplate = getThemeTemplate(sourceTemplate.baseTemplateId);
          const converted = convertSystemTemplateOverridesByRole({
            sourceOverrides: sourceTemplate.overrides,
            sourceSlots: getThemeSlots(sourceTemplate.platform),
            targetSlots: getThemeSlots(payload.platform),
            templateId: sourceTemplate.baseTemplateId,
            template: baseTemplate,
          });

          skipDefaultSelectionResetRef.current = true;
          setTemplateId(sourceTemplate.baseTemplateId);
          setPlatform(payload.platform);
          setUploads(converted.uploads);
          const normalizedOverrides = normalizeLegacyColorOverrides(payload.platform, converted.colors, converted.candidateSelections);
          setColors(normalizedOverrides.colors);
          setCandidateSelections(normalizedOverrides.candidateSelections);
          setBubbleMarkers(converted.bubbleEdits.markers);
          setBubbleInsets(converted.bubbleEdits.insets);
          setBubbleStretch(converted.bubbleEdits.stretch);
          setSystemTitle(sourceTemplate.title);
          setSystemDescription(sourceTemplate.description ?? "");
          setSystemTags(sourceTemplate.tags.join(", "));
          setSystemStatus(sourceTemplate.status);
          setSystemVisibility(sourceTemplate.visibility);
          setSystemPricingType(sourceTemplate.pricingType);
          setSystemPriceAmount(sourceTemplate.priceAmount ? String(sourceTemplate.priceAmount) : "");
          setSystemCreditCost(sourceTemplate.creditCost ? String(sourceTemplate.creditCost) : "");
          setNotice({ tone: "success", message: `${sourceTemplate.title} 시스템 템플릿을 ${payload.platform === "android" ? "Android" : "iOS"} 기준으로 변환했습니다.` });
          setInitialLoadState({ status: "ready" });
        } catch (error) {
          console.error(error);
          setInitialLoadState({ status: "error", message: "시스템 템플릿 변환 중 오류가 발생했습니다." });
        }
        return;
      }

      if (!payload.userTemplateId) return;

      try {
        const savedTemplate = await getUserTemplate(payload.userTemplateId);
        if (!active) return;
        if (!savedTemplate) {
          setNotice({ tone: "warning", message: "저장한 템플릿을 찾을 수 없어 기본 템플릿으로 시작합니다." });
          return;
        }

        skipDefaultSelectionResetRef.current = true;
        const normalizedOverrides = normalizeLegacyColorOverrides(savedTemplate.platform, savedTemplate.colors, savedTemplate.candidateSelections);
        setTemplateId(savedTemplate.templateId);
        setPlatform(savedTemplate.platform);
        setUploads(savedTemplate.uploads);
        setColors(normalizedOverrides.colors);
        setCandidateSelections(normalizedOverrides.candidateSelections);
        setBubbleMarkers(savedTemplate.bubbleEdits.markers);
        setBubbleInsets(savedTemplate.bubbleEdits.insets);
        setBubbleStretch(savedTemplate.bubbleEdits.stretch);
        setActiveUserTemplate({ id: savedTemplate.id, name: savedTemplate.name, createdAt: savedTemplate.createdAt });
        setNotice({ tone: "success", message: `${savedTemplate.name} 템플릿을 불러왔습니다.` });
      } catch (error) {
        console.error(error);
        setNotice({ tone: "error", message: "저장한 템플릿을 불러오는 중 오류가 발생했습니다." });
      }
    };

    void loadStartedTemplate();
    return () => {
      active = false;
    };
  }, []);

  const activeTemplate = getThemeTemplate(templateId);
  const displayTemplateName = activeUserTemplate?.name ?? activeSystemTemplate?.title ?? activeTemplate.name;
  const slots = useMemo(() => getThemeSlots(platform), [platform]);

  useEffect(() => {
    if (skipDefaultSelectionResetRef.current) {
      skipDefaultSelectionResetRef.current = false;
      return;
    }
    setCandidateSelections(getInitialSlotCandidateSelections(slots, templateId, activeTemplate));
  }, [activeTemplate, slots, templateId]);

  const viewportMode = useViewportMode();
  const groups = useMemo(() => getSectionGroups(activeSection, slots), [activeSection, slots]);
  const analysis = useMemo(
    () => createThemeProjectAnalysis(activeTemplate, platform, slots, uploads, colors, candidateSelections),
    [activeTemplate, platform, slots, uploads, colors, candidateSelections],
  );
  const previewBubbleEdits = useMemo(
    () => ({
      bubble_me_1: slotEditFromRole("bubble_me_1", slots, bubbleMarkers, bubbleInsets, bubbleStretch),
      bubble_me_2: slotEditFromRole("bubble_me_2", slots, bubbleMarkers, bubbleInsets, bubbleStretch),
      bubble_you_1: slotEditFromRole("bubble_you_1", slots, bubbleMarkers, bubbleInsets, bubbleStretch),
      bubble_you_2: slotEditFromRole("bubble_you_2", slots, bubbleMarkers, bubbleInsets, bubbleStretch),
    }),
    [slots, bubbleMarkers, bubbleInsets, bubbleStretch],
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
  const selectedFile = getSlotFile(selectedSlot, analysis.files);
  const selectedBubbleSlot = selectedSlot ? bubbleSlotFromRole(selectedSlot.role) : null;
  const canAdjustInline = Boolean(selectedSlot?.editableInBubbleEditor && selectedFile && selectedBubbleSlot);
  const completion = getCompletion(slots, uploads, colors, candidateSelections, templateId, activeTemplate);
  const {
    adminAssetCursor,
    adminAssetsWithPreview,
    isLoadingAdminAssets,
    loadMoreAdminAssets,
  } = useProjectAssetUploads({ platform, selectedSlot, setNotice });

  const hydrateSystemTemplateUploads = async (uploadRefs: RemoteSlotUploads = remoteUploadRefsRef.current, slotIds?: string[]) => {
    const targetSlotIds = getMissingRemoteUploadSlotIds(uploadRefs, uploadsRef.current, slotIds);
    if (!targetSlotIds.length) return uploadsRef.current;

    const hydrated = keepCurrentRemoteUploads(await systemTemplateRepository.hydrateUploads(uploadRefs, targetSlotIds), remoteUploadRefsRef.current);
    let nextUploads = uploadsRef.current;
    setUploads((current) => {
      nextUploads = mergeSlotUploads(current, hydrated);
      uploadsRef.current = nextUploads;
      return nextUploads;
    });
    return nextUploads;
  };

  const ensureSystemTemplateUploadsHydrated = () => hydrateSystemTemplateUploads(remoteUploadRefsRef.current);
  const {
    accountState,
    exportDialogOpen,
    exportElapsedSeconds,
    exportMode,
    exportName,
    exportProgressStep,
    exportVersionName,
    isAccountLoading,
    isExporting,
    isPreparingExport,
    openExportDialog,
    exportPreparationError,
    setExportDialogOpen,
    setExportMode,
    setExportName,
    setExportVersionName,
    submitExport,
  } = useProjectExport({
    activeTemplate,
    bubbleInsets,
    bubbleMarkers,
    bubbleStretch,
    candidateSelections,
    colors,
    displayTemplateName,
    ensureSystemTemplateUploadsHydrated,
    platform,
    setNotice,
    slots,
    templateId,
  });

  const hydrateUploadSlotsWithProgress = async (uploadRefs: RemoteSlotUploads, slotIds: string[], onProgress: (completed: number, total: number) => void) => {
    if (slotIds.length === 0) {
      return {};
    }

    let nextUploads: SlotUploads = {};
    let completed = 0;
    onProgress(completed, slotIds.length);
    for (const slotId of slotIds) {
      const hydrated = await systemTemplateRepository.hydrateUploads(uploadRefs, [slotId]);
      nextUploads = mergeSlotUploads(nextUploads, hydrated);
      completed += 1;
      onProgress(completed, slotIds.length);
    }
    return nextUploads;
  };

  useEffect(() => {
    if (initialLoadState.status !== "ready" || !selectedSlot) return;
    void hydrateSystemTemplateUploads(remoteUploadRefsRef.current, [selectedSlot.id]).catch((error) => console.error(error));
  }, [initialLoadState.status, selectedSlot?.id]);

  const startDefaultTemplate = () => {
    persistEditorSession(mode, { templateId: "basic", platform: "android", editMode: mode });
    skipDefaultSelectionResetRef.current = true;
    setTemplateId("basic");
    setPlatform("android");
    setActiveSection("main");
    setActiveGroup("background");
    setSelectedSlotId(undefined);
    setUploads({});
    remoteUploadRefsRef.current = {};
    setRemoteUploadRefs({});
    setColors({});
    setCandidateSelections(getInitialSlotCandidateSelections(getThemeSlots("android"), "basic", getThemeTemplate("basic")));
    setBubbleMarkers({});
    setBubbleInsets({});
    setBubbleStretch({});
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

  const dropRemoteUploadRef = (slotId: string) => {
    setRemoteUploadRefs((current) => {
      const next = { ...current };
      delete next[slotId];
      remoteUploadRefsRef.current = next;
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
    setCandidateSelections((current) => ({ ...current, [slot.id]: uploadId }));
    focusSlot(slot.id);
    revealSlot(slot);
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
  };

  const clearSlot = (slot: ThemeAssetSlot) => {
    setUploads((current) => {
      const next = { ...current };
      delete next[slot.id];
      return next;
    });
    dropRemoteUploadRef(slot.id);
    setCandidateSelections((current) => ({
      ...current,
      [slot.id]: getDefaultSlotCandidateId(slot, templateId, activeTemplate),
    }));
  };

  const removeUploadedSlotCandidate = (slot: ThemeAssetSlot, uploadId: string) => {
    setUploads((current) => {
      const nextEntries = (current[slot.id] ?? []).filter((entry) => entry.id !== uploadId);
      const next = { ...current };
      if (nextEntries.length > 0) {
        next[slot.id] = nextEntries;
      } else {
        delete next[slot.id];
      }
      return next;
    });
    setCandidateSelections((current) => {
      if (current[slot.id] !== uploadId) return current;
      return {
        ...current,
        [slot.id]: getDefaultSlotCandidateId(slot, templateId, activeTemplate),
      };
    });
    focusSlot(slot.id);
  };

  const changeColor = (slot: ThemeAssetSlot, value: string) => {
    setColors((current) => ({ ...current, [slot.id]: value }));
    if (candidateSelections[slot.id] === autoMainPaletteCandidateId) {
      setCandidateSelections((current) => ({ ...current, [slot.id]: getSelectedCandidate(slot, {}, templateId, activeTemplate)?.id }));
    }
    setSelectedSlotId(slot.id);
  };

  const applyAutoColor = (slot: ThemeAssetSlot) => {
    if (mainBackgroundFile && !activeImageColorPalette) return;
    const color = mainColorRecommendations[slot.id];
    if (!color) return;
    setColors((current) => ({ ...current, [slot.id]: color }));
    setCandidateSelections((current) => ({ ...current, [slot.id]: autoMainPaletteCandidateId }));
  };

  const applyAutoColorToAll = () => {
    if (mainBackgroundFile && !activeImageColorPalette) return;
    const linkedSlots = slots.filter((slot) => slot.autoColorRecipe && mainColorRecommendations[slot.id] && (mainBackgroundFile || slot.role !== "main_background_color"));
    setColors((current) => Object.fromEntries([...Object.entries(current), ...linkedSlots.map((slot) => [slot.id, mainColorRecommendations[slot.id]])]));
    setCandidateSelections((current) => Object.fromEntries([...Object.entries(current), ...linkedSlots.map((slot) => [slot.id, autoMainPaletteCandidateId])]));
  };

  const selectCandidate = (slot: ThemeAssetSlot, candidateId: string) => {
    setCandidateSelections((current) => ({ ...current, [slot.id]: candidateId }));
    focusSlot(slot.id);

    if (slot.kind === "color") {
      setColors((current) => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
    }
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
  };

  const openSaveDialog = () => {
    setSaveMode(activeUserTemplate ? "overwrite" : "saveAs");
    setSaveName(activeUserTemplate?.name ?? `${displayTemplateName} 복사본`);
    setSaveDialogOpen(true);
  };

  const saveCurrentTemplate = async () => {
    const name = saveMode === "overwrite" ? activeUserTemplate?.name ?? saveName.trim() : saveName.trim();
    if (!name) return;

    try {
      setIsSavingTemplate(true);
      setNotice({ tone: "info", message: "현재 편집 상태를 내 템플릿으로 저장하는 중입니다." });
      const hydratedUploads = await ensureSystemTemplateUploadsHydrated();
      const savedTemplate = await saveUserTemplate({
        id: saveMode === "overwrite" ? activeUserTemplate?.id : undefined,
        createdAt: saveMode === "overwrite" ? activeUserTemplate?.createdAt : undefined,
        name,
        templateId,
        platform,
        uploads: hydratedUploads,
        colors,
        candidateSelections,
        bubbleEdits: {
          markers: bubbleMarkers,
          insets: bubbleInsets,
          stretch: bubbleStretch,
        },
      });
      setActiveUserTemplate({ id: savedTemplate.id, name: savedTemplate.name, createdAt: savedTemplate.createdAt });
      persistEditorSession(mode, {
        templateId: savedTemplate.templateId,
        platform: savedTemplate.platform,
        userTemplateId: savedTemplate.id,
        editMode: mode,
      });
      setSaveDialogOpen(false);
      setNotice({ tone: "success", message: `${savedTemplate.name} 템플릿을 이 브라우저에 저장했습니다.` });
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: "내 템플릿 저장 중 오류가 발생했습니다. 브라우저 저장소 권한을 확인하세요." });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const openSystemSaveDialog = () => {
    if (!isAdminMode) {
      setNotice({ tone: "warning", message: "시스템 템플릿 저장은 관리자 화면에서만 사용할 수 있습니다." });
      return;
    }

    const currentSystemTitle = activeSystemTemplate?.title ?? (systemTitle.trim() || displayTemplateName);
    setSystemTitle(currentSystemTitle);
    setSystemDescription(activeSystemTemplate?.description ?? systemDescription);
    setSystemTags(activeSystemTemplate?.tags.join(", ") ?? systemTags);
    setSystemStatus(activeSystemTemplate?.status ?? systemStatus);
    setSystemVisibility(activeSystemTemplate?.visibility ?? systemVisibility);
    setSystemPricingType(activeSystemTemplate?.pricingType ?? systemPricingType);
    setSystemPriceAmount(activeSystemTemplate?.priceAmount ? String(activeSystemTemplate.priceAmount) : systemPriceAmount);
    setSystemCreditCost(activeSystemTemplate?.creditCost ? String(activeSystemTemplate.creditCost) : systemCreditCost);
    setSystemSaveDialogOpen(true);
  };

  const saveSystemTemplate = async () => {
    if (!isAdminMode) {
      setSystemSaveDialogOpen(false);
      setNotice({ tone: "warning", message: "일반 사용자 이미지는 브라우저 저장소에만 저장됩니다. 시스템 템플릿 저장은 관리자 전용입니다." });
      return;
    }

    const title = systemTitle.trim();
    if (!title) return;

    try {
      setIsSavingSystemTemplate(true);
      setNotice({ tone: "info", message: "시스템 템플릿을 저장하는 중입니다." });
      const hydratedUploads = await ensureSystemTemplateUploadsHydrated();
      const savedTemplate = await systemTemplateRepository.save({
        id: activeSystemTemplate?.id,
        bundleId: activeSystemTemplate?.bundleId ?? systemTemplateBundleId ?? undefined,
        createdAt: activeSystemTemplate?.createdAt,
        title,
        description: systemDescription.trim() || undefined,
        baseTemplateId: "basic",
        platform,
        status: systemStatus,
        visibility: systemVisibility,
        pricingType: systemPricingType,
        priceAmount: systemPricingType === "paid" ? Number(systemPriceAmount) || 0 : undefined,
        creditCost: systemPricingType === "credit" ? Number(systemCreditCost) || 0 : undefined,
        tags: systemTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        overrides: {
          colors,
          uploads: hydratedUploads,
          candidateSelections,
          bubbleEdits: {
            markers: bubbleMarkers,
            insets: bubbleInsets,
            stretch: bubbleStretch,
          },
        },
      });
      setActiveSystemTemplate({
        id: savedTemplate.id,
        bundleId: savedTemplate.bundleId ?? savedTemplate.id,
        title: savedTemplate.title,
        description: savedTemplate.description,
        tags: savedTemplate.tags,
        status: savedTemplate.status,
        visibility: savedTemplate.visibility,
        pricingType: savedTemplate.pricingType,
        priceAmount: savedTemplate.priceAmount,
        creditCost: savedTemplate.creditCost,
        createdAt: savedTemplate.createdAt,
      });
      setSystemTemplateBundleId(savedTemplate.bundleId ?? savedTemplate.id);
      persistEditorSession(mode, {
        templateId: savedTemplate.baseTemplateId,
        platform: savedTemplate.platform,
        systemTemplateId: savedTemplate.id,
        systemTemplateBundleId: savedTemplate.bundleId ?? savedTemplate.id,
        editMode: mode,
      });
      setSystemSaveDialogOpen(false);
      setNotice({ tone: "success", message: `${savedTemplate.title} 시스템 템플릿을 저장했습니다.` });
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: "시스템 템플릿 저장 중 오류가 발생했습니다." });
    } finally {
      setIsSavingSystemTemplate(false);
    }
  };

  const previewProps = {
    analysis,
    activeSection,
    template: activeTemplate,
    templateId,
    slots,
    colors,
    selections: candidateSelections,
    bubbleEdits: previewBubbleEdits,
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
      markers={selectedSlot ? bubbleMarkers[selectedSlot.id] : undefined}
      insets={selectedSlot ? bubbleInsets[selectedSlot.id] : undefined}
      stretch={selectedSlot ? bubbleStretch[selectedSlot.id] : undefined}
      fileInputRefs={fileInputRefs}
      onUpload={uploadSlot}
      onEditedUpload={uploadEditedSlot}
      onClear={clearSlot}
      onColorChange={changeColor}
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
      onMarkersChange={(markers) => selectedSlot && setBubbleMarkers((current) => ({ ...current, [selectedSlot.id]: markers }))}
      onInsetsChange={(insets) => selectedSlot && setBubbleInsets((current) => ({ ...current, [selectedSlot.id]: insets }))}
      onStretchChange={(stretch) => selectedSlot && setBubbleStretch((current) => ({ ...current, [selectedSlot.id]: stretch }))}
      canAdjustInline={canAdjustInline}
      candidateOpen={candidateOpen}
      onToggleCandidates={() => setCandidateOpen((current) => !current)}
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
      markers={selectedSlot ? bubbleMarkers[selectedSlot.id] : undefined}
      insets={selectedSlot ? bubbleInsets[selectedSlot.id] : undefined}
      stretch={selectedSlot ? bubbleStretch[selectedSlot.id] : undefined}
      contrastWarning={selectedSlot ? contrastWarnings[selectedSlot.id] : undefined}
      recommendedColor={selectedSlot ? mainColorRecommendations[selectedSlot.id] : undefined}
      isAutoColor={Boolean(selectedSlot && candidateSelections[selectedSlot.id] === autoMainPaletteCandidateId)}
      canApplyAutoColor={Boolean(selectedSlot?.autoColorRecipe && mainColorRecommendations[selectedSlot.id] && (!mainBackgroundFile || activeImageColorPalette) && (mainBackgroundFile || selectedSlot.role !== "main_background_color"))}
      fileInputRefs={fileInputRefs}
      onUpload={uploadSlot}
      onRemoveUpload={removeUploadedSlotCandidate}
      onColorChange={changeColor}
      onSelectCandidate={selectCandidate}
      onSelectAdminAsset={(slot, asset) => void selectAdminAsset(slot, asset)}
      onApplyAutoColor={() => selectedSlot && applyAutoColor(selectedSlot)}
      onMarkersChange={(markers) => selectedSlot && setBubbleMarkers((current) => ({ ...current, [selectedSlot.id]: markers }))}
      onInsetsChange={(insets) => selectedSlot && setBubbleInsets((current) => ({ ...current, [selectedSlot.id]: insets }))}
      onStretchChange={(stretch) => selectedSlot && setBubbleStretch((current) => ({ ...current, [selectedSlot.id]: stretch }))}
      onPullSheet={() => setMobileSheetSnap("full")}
    />
  );

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden overflow-y-auto px-3 py-3 text-[#111827] md:px-4 md:py-4 lg:h-[100dvh] lg:overflow-hidden">
      {notice ? <HeaderNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}
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
          preparationError={exportPreparationError}
          platform={platform}
          exportMode={exportMode}
          exportName={exportName}
          exportVersionName={exportVersionName}
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
          onVersionNameChange={setExportVersionName}
          onLogin={() => router.push(`/login?returnTo=${encodeURIComponent("/edit")}&reason=export`)}
          onBuyCredits={() => router.push("/credits")}
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
      {exitConfirmOpen ? <ExitConfirmDialog onCancel={cancelExit} onConfirm={confirmExit} /> : null}

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
                  {isExporting ? "내보내는 중.." : isPreparingExport ? "내보내기 준비 중…" : "내보내기"}
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
                        onSelectSlot={(slot) => {
                          focusSlot(slot.id);
                          revealSlot(slot);
                          setMobileSheetSnap("half");
                        }}
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
                bubbleEdits={previewBubbleEdits}
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

function createInitialLoadProgress(message: string, current: number, total: number, detail?: string): InitialLoadState {
  return {
    status: "loading",
    message,
    detail,
    current,
    total,
  };
}

function HeaderNotice({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 2500);
    return () => window.clearTimeout(timeout);
  }, [notice.message, notice.tone, onDismiss]);

  const noticeToneClass =
    notice.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : notice.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : notice.tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <div className={`pointer-events-auto fixed left-1/2 top-4 z-[90] flex w-[min(92vw,460px)] -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-sm ${noticeToneClass}`}>
      <span className="truncate">{notice.message}</span>
      <button type="button" className="shrink-0 text-current/70 hover:text-current" onClick={onDismiss} aria-label="알림 닫기">
        닫기
      </button>
    </div>
  );
}

function getInitialPreviewSlotIds(platform: ThemePlatform, uploadRefs: RemoteSlotUploads) {
  const slots = getThemeSlots(platform);
  const roleOrder: ThemeResourceRole[] = ["chat_background", "main_background", "tab_background_image", "bubble_me_1", "bubble_you_1", "profile_image_1"];
  return roleOrder.map((role) => slots.find((slot) => slot.role === role)?.id).filter((slotId): slotId is string => Boolean(slotId && uploadRefs[slotId]?.length));
}

function getBackgroundSourcePair(slot: ThemeAssetSlot, slots: ThemeAssetSlot[]) {
  const imageSlot =
    slot.kind === "color"
      ? slots.find((candidate) => candidate.kind !== "color" && getImageColorFallbackRole(candidate.role) === slot.role)
      : getImageColorFallbackRole(slot.role)
        ? slot
        : undefined;
  if (!imageSlot) return null;
  const colorRole = getImageColorFallbackRole(imageSlot.role);
  const colorSlot = slots.find((candidate) => candidate.kind === "color" && candidate.role === colorRole);
  return colorSlot ? { imageSlot, colorSlot } : null;
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
  bubbleMarkers: Partial<Record<string, Markers>>,
  bubbleInsets: Partial<Record<string, Insets>>,
  bubbleStretch: Partial<Record<string, StretchPoint>>,
): BubbleEditState | undefined {
  const slot = slots.find((item) => item.role === role);
  if (!slot) return undefined;

  const next = {
    markers: bubbleMarkers[slot.id],
    insets: bubbleInsets[slot.id],
    stretch: bubbleStretch[slot.id],
  };

  return next.markers || next.insets || next.stretch ? next : undefined;
}
