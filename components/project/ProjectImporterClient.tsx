"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Archive, Download, Package, ShieldCheck, Wrench, X } from "lucide-react";
import { ProjectGroupRail } from "@/components/project/ProjectGroupRail";
import { ProjectPreviewPanel } from "@/components/project/ProjectPreviewPanel";
import { ProjectQuickEditPanel } from "@/components/project/ProjectQuickEditPanel";
import { ProjectSectionRail } from "@/components/project/ProjectSectionRail";
import {
  bubbleSlotFromRole,
  getCompletion,
  getInitialSlotCandidateSelections,
  getResolvedColor,
  getSectionGroups,
  getSelectedCandidate,
  getSlotFile,
  isSlotVisibleInSection,
  sectionLabels,
  type BubbleEditState,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/components/project/projectModel";
import { dataUrlForThemeFile, findBestFile } from "@/components/preview/previewResourceUtils";
import { extractThemeImagePalette, type ImageColorPalette } from "@/lib/theme/colorPalette";
import { buildAndroidThemeExportFiles } from "@/lib/theme/android/export";
import { adminAssetToFile, inferAdminAssetKind, listRecommendedAssetCandidatePage, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { buildIosThemeExportFiles } from "@/lib/theme/ios/export";
import { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import { normalizeLegacyColorOverrides } from "@/lib/theme/project/legacyOverrides";
import { readTemplateStartPayload } from "@/lib/theme/project/state";
import { autoMainPaletteCandidateId, buildMainPaletteRecommendations } from "@/lib/theme/autoColor";
import { systemTemplateRepository, type RemoteSlotUploads, type SystemTemplatePricingType, type SystemTemplateStatus, type SystemTemplateVisibility } from "@/lib/theme/systemTemplates";
import { convertSystemTemplateOverridesByRole } from "@/lib/theme/systemTemplates/roleOverrides";
import { getUserTemplate, saveUserTemplate } from "@/lib/theme/userTemplates";
import {
  getThemeSlots,
  getThemeTemplate,
  templateStartStorageKey,
  type ThemeAssetSlot,
  type ThemeStartPayload,
  type ThemeTemplate,
  type ThemeTemplateId,
} from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

const editorHandoffKey = "kakaotalk-theme-maker:editor-handoff:v1";
const editorSessionStorageKey = (mode: "user" | "admin") => `kakaotalk-theme-maker:editor-session:${mode}:v1`;

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

type ExportMode = "project" | "apk" | "apk-zip" | "theme-zip" | "ktheme";
type InitialLoadState = {
  status: "idle" | "ready" | "loading" | "error";
  message?: string;
  detail?: string;
  current?: number;
  total?: number;
};

type AccountState = {
  user: { id: string; email?: string } | null;
  credits: number;
  isAdmin: boolean;
};

type AndroidExportPayloadOptions = {
  analysis: ReturnType<typeof createThemeProjectAnalysis>;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  exportName: string;
  versionName: string;
  mode: "project" | "apk" | "apk-zip";
  slots: ThemeAssetSlot[];
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  bubbleMarkers: Partial<Record<string, Markers>>;
  bubbleInsets: Partial<Record<string, Insets>>;
  bubbleStretch: Partial<Record<string, StretchPoint>>;
};

type IosExportPayloadOptions = Omit<AndroidExportPayloadOptions, "mode"> & {
  mode: "theme-zip" | "ktheme";
};

type ExportPayloadOptions = Omit<AndroidExportPayloadOptions, "mode"> & {
  mode: ExportMode;
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
  const [uploads, setUploads] = useState<SlotUploads>({});
  const [remoteUploadRefs, setRemoteUploadRefs] = useState<RemoteSlotUploads>({});
  const [colors, setColors] = useState<SlotColors>({});
  const [candidateSelections, setCandidateSelections] = useState<SlotCandidateSelections>({});
  const [screenRailOpen, setScreenRailOpen] = useState(true);
  const [candidateOpen, setCandidateOpen] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
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
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("apk");
  const [exportName, setExportName] = useState("");
  const [exportVersionName, setExportVersionName] = useState("");
  const [exportProgressStep, setExportProgressStep] = useState(0);
  const [exportElapsedSeconds, setExportElapsedSeconds] = useState(0);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [isAccountLoading, setIsAccountLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [bubbleMarkers, setBubbleMarkers] = useState<Partial<Record<string, Markers>>>({});
  const [bubbleInsets, setBubbleInsets] = useState<Partial<Record<string, Insets>>>({});
  const [bubbleStretch, setBubbleStretch] = useState<Partial<Record<string, StretchPoint>>>({});
  const [adminAssets, setAdminAssets] = useState<AdminAssetCandidate[]>([]);
  const [adminAssetsWithPreview, setAdminAssetsWithPreview] = useState<Array<AdminAssetCandidate & { previewUrl: string }>>([]);
  const [adminAssetCursor, setAdminAssetCursor] = useState<string>();
  const [isLoadingAdminAssets, setIsLoadingAdminAssets] = useState(false);
  const [imageColorPalette, setImageColorPalette] = useState<ImageColorPalette | null>(null);
  const [imageColorPaletteSourceKey, setImageColorPaletteSourceKey] = useState<string | null>(null);
  const [imageColorPaletteError, setImageColorPaletteError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const skipDefaultSelectionResetRef = useRef(false);
  const uploadsRef = useRef<SlotUploads>({});
  const remoteUploadRefsRef = useRef<RemoteSlotUploads>({});
  const exportSubmittingRef = useRef(false);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => {
    remoteUploadRefsRef.current = remoteUploadRefs;
  }, [remoteUploadRefs]);

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

  useEffect(() => {
    setAdminAssetsWithPreview(adminAssets.map((asset) => ({ ...asset, previewUrl: asset.previewUrl ?? "" })));
  }, [adminAssets]);

  const refreshAccountState = async () => {
    setIsAccountLoading(true);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const payload = (await response.json()) as AccountState;
      const next = { user: payload.user, credits: payload.credits ?? 0, isAdmin: payload.isAdmin ?? false };
      setAccountState(next);
      return next;
    } finally {
      setIsAccountLoading(false);
    }
  };

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

  const groups = useMemo(() => getSectionGroups(activeSection, slots), [activeSection, slots]);
  const analysis = useMemo(
    () => createThemeProjectAnalysis(activeTemplate, platform, slots, uploads, colors, candidateSelections),
    [activeTemplate, platform, slots, uploads, colors, candidateSelections],
  );
  const mainBackgroundFile = useMemo(() => platform === "android" ? findBestFile(analysis, "main_background") : undefined, [analysis, platform]);
  const mainBackgroundPaletteKey = mainBackgroundFile ? getThemeFilePaletteKey(mainBackgroundFile) : null;
  const activeImageColorPalette = mainBackgroundPaletteKey && imageColorPaletteSourceKey === mainBackgroundPaletteKey ? imageColorPalette : null;
  const mainBackgroundColorSlot = useMemo(() => slots.find((slot) => slot.role === "main_background_color"), [slots]);
  const resolvedMainBackground = mainBackgroundColorSlot
    ? getResolvedColor(mainBackgroundColorSlot, colors, candidateSelections, templateId, activeTemplate) ?? activeTemplate.defaults.mainBackground
    : activeTemplate.defaults.mainBackground;

  useEffect(() => {
    let active = true;
    if (platform !== "android" || !mainBackgroundFile) {
      setImageColorPalette(null);
      setImageColorPaletteSourceKey(null);
      setImageColorPaletteError(null);
      return () => { active = false; };
    }
    setImageColorPalette(null);
    setImageColorPaletteSourceKey(null);
    setImageColorPaletteError(null);
    extractThemeImagePalette(mainBackgroundFile)
      .then((palette) => {
        if (!active) return;
        setImageColorPalette(palette);
        setImageColorPaletteSourceKey(mainBackgroundPaletteKey);
        setImageColorPaletteError(null);
      })
      .catch((error) => {
        if (!active) return;
        setImageColorPalette(null);
        setImageColorPaletteError(error instanceof Error ? error.message : "배경 이미지 색상을 분석하지 못했습니다.");
      });
    return () => { active = false; };
  }, [mainBackgroundPaletteKey, platform]);

  const mainColorRecommendations = useMemo(
    () => buildMainPaletteRecommendations(slots, {
      imageActive: Boolean(mainBackgroundFile),
      palette: activeImageColorPalette,
      currentBackground: resolvedMainBackground,
      backgroundIsAuto: Boolean(mainBackgroundColorSlot && candidateSelections[mainBackgroundColorSlot.id] === autoMainPaletteCandidateId),
      templateAccent: activeTemplate.accent,
    }),
    [activeImageColorPalette, activeTemplate.accent, candidateSelections, mainBackgroundColorSlot, mainBackgroundFile, resolvedMainBackground, slots],
  );

  useEffect(() => {
    if (platform !== "android") return;
    if (mainBackgroundFile && !activeImageColorPalette) return;
    const linkedSlots = slots.filter((slot) => slot.autoColorRecipe && candidateSelections[slot.id] === autoMainPaletteCandidateId && mainColorRecommendations[slot.id]);
    if (!linkedSlots.length) return;
    setColors((current) => {
      if (linkedSlots.every((slot) => current[slot.id]?.toUpperCase() === mainColorRecommendations[slot.id]?.toUpperCase())) return current;
      const next = { ...current };
      for (const slot of linkedSlots) next[slot.id] = mainColorRecommendations[slot.id];
      return next;
    });
  }, [activeImageColorPalette, candidateSelections, mainBackgroundFile, mainColorRecommendations, platform, slots]);

  useEffect(() => {
    if (platform !== "android" || mainBackgroundFile || !mainBackgroundColorSlot) return;
    if (candidateSelections[mainBackgroundColorSlot.id] !== autoMainPaletteCandidateId) return;
    setColors((current) => current[mainBackgroundColorSlot.id] ? current : { ...current, [mainBackgroundColorSlot.id]: resolvedMainBackground });
    setCandidateSelections((current) => {
      const next = { ...current };
      delete next[mainBackgroundColorSlot.id];
      return next;
    });
  }, [candidateSelections, mainBackgroundColorSlot, mainBackgroundFile, platform, resolvedMainBackground]);

  useEffect(() => {
    if (!groups.includes(activeGroup)) {
      setActiveGroup(groups[0] ?? "background");
    }
  }, [activeGroup, groups]);

  const visibleSlots = useMemo(() => slots.filter((slot) => isSlotVisibleInSection(slot, activeSection) && slot.group === activeGroup), [activeGroup, activeSection, slots]);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? visibleSlots[0] ?? slots[0];
  const selectedFile = getSlotFile(selectedSlot, analysis.files);
  const selectedBubbleSlot = selectedSlot ? bubbleSlotFromRole(selectedSlot.role) : null;
  const canAdjustInline = Boolean(selectedSlot?.editableInBubbleEditor && selectedFile && selectedBubbleSlot);
  const completion = getCompletion(slots, uploads, colors, candidateSelections, templateId, activeTemplate);

  useEffect(() => {
    let active = true;
    if (!selectedSlot || selectedSlot.kind === "color") {
      setAdminAssets([]);
      setAdminAssetCursor(undefined);
      return () => { active = false; };
    }
    setIsLoadingAdminAssets(true);
    listRecommendedAssetCandidatePage({ platform, assetKind: inferAdminAssetKind(selectedSlot), limit: 24, enabledOnly: true })
      .then((page) => {
        if (!active) return;
        setAdminAssets(page.items);
        setAdminAssetCursor(page.nextCursor);
      })
      .catch((error) => console.error(error))
      .finally(() => { if (active) setIsLoadingAdminAssets(false); });
    return () => { active = false; };
  }, [platform, selectedSlot?.id]);

  const loadMoreAdminAssets = async () => {
    if (!selectedSlot || !adminAssetCursor || isLoadingAdminAssets) return;
    try {
      setIsLoadingAdminAssets(true);
      const page = await listRecommendedAssetCandidatePage({ platform, assetKind: inferAdminAssetKind(selectedSlot), cursor: adminAssetCursor, limit: 24, enabledOnly: true });
      setAdminAssets((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setAdminAssetCursor(page.nextCursor);
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: "추천 에셋을 더 불러오지 못했습니다." });
    } finally {
      setIsLoadingAdminAssets(false);
    }
  };

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
    const firstSlot = slots.find((slot) => isSlotVisibleInSection(slot, section) && (!nextGroup || slot.group === nextGroup));
    setSelectedSlotId(firstSlot?.id);
  };

  const selectGroup = (group: ThemeSlotGroup) => {
    setActiveGroup(group);
    const firstSlot = slots.find((slot) => isSlotVisibleInSection(slot, activeSection) && slot.group === group);
    setSelectedSlotId(firstSlot?.id);
  };

  const selectPreviewSlot = (slotId: string | undefined) => {
    setSelectedSlotId(slotId);
    const slot = slots.find((item) => item.id === slotId);
    if (!slot) return;
    if (!isSlotVisibleInSection(slot, activeSection)) setActiveSection(slot.section);
    setActiveGroup(slot.group);
  };

  const uploadSlot = (slot: ThemeAssetSlot, fileList: FileList | readonly File[] | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const uploadId = `${slot.id}:upload:${Date.now()}`;
    setUploads((current) => ({
      ...current,
      [slot.id]: [...(current[slot.id] ?? []), { id: uploadId, file, source: "user" as const }],
    }));
    setRemoteUploadRefs((current) => {
      const next = { ...current };
      delete next[slot.id];
      remoteUploadRefsRef.current = next;
      return next;
    });
    setCandidateSelections((current) => ({ ...current, [slot.id]: uploadId }));
    setSelectedSlotId(slot.id);
    if (!isSlotVisibleInSection(slot, activeSection)) setActiveSection(slot.section);
    setActiveGroup(slot.group);
  };

  const clearSlot = (slot: ThemeAssetSlot) => {
    setUploads((current) => {
      const next = { ...current };
      delete next[slot.id];
      return next;
    });
    setRemoteUploadRefs((current) => {
      const next = { ...current };
      delete next[slot.id];
      remoteUploadRefsRef.current = next;
      return next;
    });
    setCandidateSelections((current) => ({
      ...current,
      [slot.id]: getInitialSlotCandidateSelections([slot], templateId, activeTemplate)[slot.id],
    }));
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
    setSelectedSlotId(slot.id);

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
    setRemoteUploadRefs((current) => {
      const next = { ...current };
      delete next[slot.id];
      remoteUploadRefsRef.current = next;
      return next;
    });
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
    setSelectedSlotId(slot.id);
    if (!isSlotVisibleInSection(slot, activeSection)) setActiveSection(slot.section);
    setActiveGroup(slot.group);
  };

  const openAdvancedBubbleEditor = async () => {
    let fileForEditor = selectedFile;
    if (selectedSlot?.editableInBubbleEditor && !fileForEditor) {
      const hydratedUploads = await hydrateSystemTemplateUploads(remoteUploadRefsRef.current, [selectedSlot.id]);
      const hydratedAnalysis = createThemeProjectAnalysis(activeTemplate, platform, slots, hydratedUploads, colors, candidateSelections);
      fileForEditor = getSlotFile(selectedSlot, hydratedAnalysis.files);
    }

    if (!selectedSlot?.editableInBubbleEditor || !fileForEditor) {
      router.push("/editor");
      return;
    }

    const bubbleSlot = bubbleSlotFromRole(selectedSlot.role);
    if (!bubbleSlot) {
      router.push("/editor");
      return;
    }

    const dataUrl = await dataUrlForThemeFile(fileForEditor);
    if (!dataUrl) {
      router.push("/editor");
      return;
    }

    localStorage.setItem(
      editorHandoffKey,
      JSON.stringify({
        slot: bubbleSlot,
        platform,
        name: selectedSlot.fileName,
        path: selectedSlot.path,
        dataUrl,
        markers: bubbleMarkers[selectedSlot.id],
        insets: bubbleInsets[selectedSlot.id],
        stretch: bubbleStretch[selectedSlot.id],
        createdAt: Date.now(),
      }),
    );
    router.push("/editor");
  };

  const openSaveDialog = () => {
    const fallbackName = `${activeTemplate.name} 복사본`;
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
      setNotice({ tone: "success", message: `${savedTemplate.name} 템플릿을 저장했습니다.` });
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: "내 템플릿 저장 중 오류가 발생했습니다. 브라우저 저장소 권한을 확인하세요." });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const openSystemSaveDialog = () => {
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

  const openExportDialog = async () => {
    try {
      if (!exportVersionName) {
        const response = await fetch(platform === "android" ? "/api/export/android" : "/api/export/ios");
        const payload = (await response.json()) as { versionName?: string; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `${platform === "android" ? "Android" : "iOS"} 내보내기 설정을 불러오지 못했습니다.`);
        }
        setExportVersionName(payload.versionName ?? "1.0.0");
      }
      setExportName(displayTemplateName);
      setExportMode(platform === "android" ? "apk" : "ktheme");
      setExportProgressStep(0);
      await refreshAccountState();
      setExportDialogOpen(true);
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Android export 설정을 불러오는 중 오류가 발생했습니다." });
    }
  };

  const submitExport = async () => {
    if (exportSubmittingRef.current) return;
    exportSubmittingRef.current = true;
    const progressSteps = getExportProgressSteps(exportMode);
    let progressTimer: number | null = null;

    try {
      setIsExporting(true);
      setExportProgressStep(0);
      setExportElapsedSeconds(0);
      setNotice({ tone: "info", message: getExportNotice(exportMode) });
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
        bubbleMarkers,
        bubbleInsets,
        bubbleStretch,
      });
      setExportProgressStep(platform === "ios" ? 2 : 1);

      const response = await fetch(platform === "android" ? "/api/export/android" : "/api/export/ios", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string; reason?: string; refunded?: boolean } | null;
        if (response.status === 401 || errorBody?.reason === "unauthenticated") {
          router.push(`/login?returnTo=${encodeURIComponent("/edit")}&reason=export`);
          return;
        }
        if (response.status === 402 || errorBody?.reason === "insufficient_credits") {
          await refreshAccountState();
          throw new Error("크레딧이 부족합니다. 크레딧 충전 후 다시 시도해 주세요.");
        }
        if (errorBody?.refunded) await refreshAccountState();
        throw new Error(errorBody?.error ?? "내보내기에 실패했습니다.");
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
      setExportDialogOpen(false);
      setNotice({ tone: "success", message: `${exportNumber ? `내보내기 #${exportNumber} · ` : ""}${fileName} 파일을 생성했습니다.` });
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: error instanceof Error ? error.message : `${platform === "android" ? "Android" : "iOS"} 내보내기 중 오류가 발생했습니다.` });
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      exportSubmittingRef.current = false;
      setIsExporting(false);
    }
  };

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
              setExportProgressStep(0);
              setExportElapsedSeconds(0);
            }
          }}
          onModeChange={setExportMode}
          onNameChange={(value) => {
            setExportName(value);
          }}
          onVersionNameChange={setExportVersionName}
          onLogin={() => router.push(`/login?returnTo=${encodeURIComponent("/edit")}&reason=export`)}
          onBuyCredits={() => router.push("/credits")}
          onSubmit={() => void submitExport()}
        />
      ) : null}
      {systemSaveDialogOpen ? (
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
        <div className="grid min-h-full min-w-0 w-full grid-rows-[auto_1fr] gap-3 md:gap-4 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)]">
          <header className="grid min-h-[56px] min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white/95 px-3 py-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-4 md:px-4">
            <div className="flex min-w-0 items-center gap-2 justify-self-start md:gap-4">
              <Link href="/template" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e5e7eb] bg-[#f8fafc] text-xl font-bold leading-none text-[#111827] transition hover:bg-white">
                &larr;
              </Link>
              <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-[#0f172a] md:text-[22px]">{displayTemplateName}</h1>
            </div>

            <div className="col-span-2 row-start-3 flex min-w-0 items-center gap-2 overflow-hidden justify-self-stretch md:col-span-1 md:row-auto md:gap-3 md:justify-self-center">
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
                disabled={isExporting}
              >
                {isExporting ? "내보내는 중.." : "내보내기"}
              </button>
            </div>
          </header>

          <section className="grid min-h-0 min-w-0 w-full grid-cols-1 content-start gap-3 lg:grid-cols-[auto_minmax(0,1fr)_280px] lg:grid-rows-1 xl:grid-cols-[auto_minmax(0,1fr)_300px] 2xl:grid-cols-[auto_minmax(0,1fr)_320px]">
            <ProjectSectionRail
              activeSection={activeSection}
              slots={slots}
              uploads={uploads}
              colors={colors}
              selections={candidateSelections}
              templateId={templateId}
              template={activeTemplate}
              isOpen={screenRailOpen}
              onToggle={() => setScreenRailOpen((current) => !current)}
              onSelectSection={selectSection}
            />

            <section className="grid min-h-0 min-w-0 grid-cols-1 gap-3 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white/95 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm md:grid-cols-[196px_minmax(0,1fr)] md:gap-0 xl:grid-cols-[220px_minmax(0,1fr)]">
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
                onSelectSlot={(slot) => {
                  setSelectedSlotId(slot.id);
                  if (!isSlotVisibleInSection(slot, activeSection)) setActiveSection(slot.section);
                  setActiveGroup(slot.group);
                }}
              />

              <div className="grid min-h-0 min-w-0 px-3">
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
                  onClear={clearSlot}
                  onColorChange={changeColor}
                  imageColorPalette={activeImageColorPalette}
                  imageColorPaletteError={imageColorPaletteError}
                  recommendedColor={selectedSlot ? mainColorRecommendations[selectedSlot.id] : undefined}
                  isAutoColor={Boolean(selectedSlot && candidateSelections[selectedSlot.id] === autoMainPaletteCandidateId)}
                  canApplyAutoColor={Boolean(selectedSlot?.autoColorRecipe && mainColorRecommendations[selectedSlot.id] && (!mainBackgroundFile || activeImageColorPalette) && (mainBackgroundFile || selectedSlot.role !== "main_background_color"))}
                  canApplyAutoColorToAll={Boolean((!mainBackgroundFile || activeImageColorPalette) && Object.keys(mainColorRecommendations).length)}
                  onApplyAutoColor={() => selectedSlot && applyAutoColor(selectedSlot)}
                  onApplyAutoColorToAll={applyAutoColorToAll}
                  onSelectCandidate={selectCandidate}
                  onSelectAdminAsset={(slot, asset) => void selectAdminAsset(slot, asset)}
                  onLoadMoreAdminAssets={() => void loadMoreAdminAssets()}
                  onOpenAdvanced={openAdvancedBubbleEditor}
                  onMarkersChange={(markers) => selectedSlot && setBubbleMarkers((current) => ({ ...current, [selectedSlot.id]: markers }))}
                  onInsetsChange={(insets) => selectedSlot && setBubbleInsets((current) => ({ ...current, [selectedSlot.id]: insets }))}
                  onStretchChange={(stretch) => selectedSlot && setBubbleStretch((current) => ({ ...current, [selectedSlot.id]: stretch }))}
                  canAdjustInline={canAdjustInline}
                  candidateOpen={candidateOpen}
                  onToggleCandidates={() => setCandidateOpen((current) => !current)}
                />
              </div>
            </section>

            <ProjectPreviewPanel
              analysis={analysis}
              activeSection={activeSection}
              template={activeTemplate}
              templateId={templateId}
              slots={slots}
              colors={colors}
              selections={candidateSelections}
              bubbleEdits={{
                bubble_me_1: slotEditFromRole("bubble_me_1", slots, bubbleMarkers, bubbleInsets, bubbleStretch),
                bubble_me_2: slotEditFromRole("bubble_me_2", slots, bubbleMarkers, bubbleInsets, bubbleStretch),
                bubble_you_1: slotEditFromRole("bubble_you_1", slots, bubbleMarkers, bubbleInsets, bubbleStretch),
                bubble_you_2: slotEditFromRole("bubble_you_2", slots, bubbleMarkers, bubbleInsets, bubbleStretch),
              }}
              selectedSlotId={selectedSlot?.id}
              className="min-h-[520px] lg:min-h-0"
              onSelectSlot={selectPreviewSlot}
            />
          </section>
        </div>
      ) : null}
    </main>
  );
}

function InitialTemplateLoadingPanel({
  message,
  detail,
  current,
  total,
}: {
  message: string;
  detail?: string;
  current?: number;
  total?: number;
}) {
  const hasProgress = typeof current === "number" && typeof total === "number" && total > 0;
  const progressValue = hasProgress ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 18;

  return (
    <div className="grid h-full place-items-center px-5">
      <section className="grid w-full max-w-3xl gap-5 rounded-[28px] border border-[#e5e7eb] bg-white/95 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748b]">Loading template</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#0f172a]">{message}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">{detail ?? "미리보기에 필요한 에셋을 먼저 준비한 뒤 편집 화면을 엽니다."}</p>
          <div className="mt-5 grid gap-2">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#64748b]">
              <span>초기 준비</span>
              <span>{hasProgress ? `${progressValue}%` : "준비 중"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
              <div className="h-full rounded-full bg-[#2563eb] transition-all duration-300" style={{ width: `${progressValue}%` }} />
            </div>
            {hasProgress ? (
              <p className="text-[11px] font-semibold text-[#94a3b8]">
                {current}/{total} 단계 완료
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="aspect-[9/16] animate-pulse rounded-[28px] bg-[#f1f5f9]" />
          <div className="grid content-start gap-3">
            <span className="h-10 animate-pulse rounded-2xl bg-[#f1f5f9]" />
            <span className="h-24 animate-pulse rounded-2xl bg-[#f1f5f9]" />
            <span className="h-24 animate-pulse rounded-2xl bg-[#f1f5f9]" />
          </div>
        </div>
      </section>
    </div>
  );
}

function InitialTemplateErrorPanel({ message, onStartDefault }: { message: string; onStartDefault: () => void }) {
  return (
    <div className="grid h-full place-items-center px-5">
      <section className="grid w-full max-w-xl gap-4 rounded-[28px] border border-rose-100 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">Template load failed</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#0f172a]">{message}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">네트워크 또는 Storage 권한을 확인한 뒤 다시 시도하거나 기본 템플릿으로 시작할 수 있습니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/template" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fafc]">
            템플릿으로 돌아가기
          </Link>
          <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1e293b]" onClick={onStartDefault}>
            기본 템플릿으로 시작
          </button>
        </div>
      </section>
    </div>
  );
}

function takeTemplateStartPayload(mode: "user" | "admin") {
  const pendingPayload = readTemplateStartPayload(templateStartStorageKey);
  if (pendingPayload && (!pendingPayload.editMode || pendingPayload.editMode === mode)) {
    persistEditorSession(mode, { ...pendingPayload, editMode: mode });
    localStorage.removeItem(templateStartStorageKey);
    return pendingPayload;
  }

  return readTemplateStartPayload(editorSessionStorageKey(mode));
}

function persistEditorSession(mode: "user" | "admin", payload: ThemeStartPayload) {
  localStorage.setItem(editorSessionStorageKey(mode), JSON.stringify(payload));
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
    const timeout = window.setTimeout(onDismiss, 3200);
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

function SaveTemplateDialog({
  activeUserTemplate,
  isSaving,
  mode,
  name,
  onClose,
  onModeChange,
  onNameChange,
  onSubmit,
}: {
  activeUserTemplate: ActiveUserTemplate | null;
  isSaving: boolean;
  mode: "overwrite" | "saveAs";
  name: string;
  onClose: () => void;
  onModeChange: (mode: "overwrite" | "saveAs") => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canOverwrite = Boolean(activeUserTemplate);
  const canSubmit = mode === "overwrite" ? canOverwrite : name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="내 템플릿 저장">
      <section className="grid w-full max-w-[420px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-[#0f172a]">내 템플릿 저장</h2>
            <p className="text-sm text-[#64748b]">현재 편집 상태를 저장합니다.</p>
          </div>
          <button type="button" className="rounded-full border border-[#e5e7eb] px-3 py-1 text-sm font-semibold text-[#475569]" onClick={onClose} disabled={isSaving}>
            닫기
          </button>
        </div>

        <div className="grid gap-3">
          {canOverwrite ? (
            <label className={`grid gap-2 rounded-2xl border px-4 py-3 ${mode === "overwrite" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}>
              <div className="flex items-center gap-3">
                <input type="radio" name="save-mode" checked={mode === "overwrite"} onChange={() => onModeChange("overwrite")} />
                <div className="grid gap-0.5">
                  <span className="text-sm font-semibold text-[#0f172a]">기존 템플릿에 저장</span>
                  <span className="text-xs text-[#64748b]">{activeUserTemplate?.name}</span>
                </div>
              </div>
            </label>
          ) : null}

          <label className={`grid gap-3 rounded-2xl border px-4 py-3 ${mode === "saveAs" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}>
            <div className="flex items-center gap-3">
              <input type="radio" name="save-mode" checked={mode === "saveAs"} onChange={() => onModeChange("saveAs")} />
              <span className="text-sm font-semibold text-[#0f172a]">다른 이름으로 저장</span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.currentTarget.value)}
              disabled={mode !== "saveAs" || isSaving}
              placeholder="템플릿 이름"
              className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isSaving}>
            취소
          </button>
          <button
            type="button"
            className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onSubmit}
            disabled={!canSubmit || isSaving}
          >
            {isSaving ? "저장 중.." : "저장"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SystemTemplateSaveDialog({
  isSaving,
  title,
  description,
  tags,
  status,
  visibility,
  pricingType,
  priceAmount,
  creditCost,
  onClose,
  onTitleChange,
  onDescriptionChange,
  onTagsChange,
  onStatusChange,
  onVisibilityChange,
  onPricingTypeChange,
  onPriceAmountChange,
  onCreditCostChange,
  onSubmit,
}: {
  isSaving: boolean;
  title: string;
  description: string;
  tags: string;
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  pricingType: SystemTemplatePricingType;
  priceAmount: string;
  creditCost: string;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onStatusChange: (value: SystemTemplateStatus) => void;
  onVisibilityChange: (value: SystemTemplateVisibility) => void;
  onPricingTypeChange: (value: SystemTemplatePricingType) => void;
  onPriceAmountChange: (value: string) => void;
  onCreditCostChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = title.trim().length > 0;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="시스템 템플릿 저장">
      <section className="grid w-full max-w-[560px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-[#0f172a]">시스템 템플릿으로 저장</h2>
            <p className="text-sm text-[#64748b]">현재 편집 상태를 basic 기반 overrides로 저장합니다.</p>
          </div>
          <button type="button" className="rounded-full border border-[#e5e7eb] px-3 py-1 text-sm font-semibold text-[#475569]" onClick={onClose} disabled={isSaving}>
            닫기
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-semibold text-[#0f172a]">Title</span>
            <input type="text" value={title} onChange={(event) => onTitleChange(event.currentTarget.value)} disabled={isSaving} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-semibold text-[#0f172a]">Description</span>
            <textarea value={description} onChange={(event) => onDescriptionChange(event.currentTarget.value)} disabled={isSaving} className="min-h-20 rounded-xl border border-[#d1d5db] bg-white px-3 py-2 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-semibold text-[#0f172a]">Tags</span>
            <input type="text" value={tags} onChange={(event) => onTagsChange(event.currentTarget.value)} disabled={isSaving} placeholder="쉼표로 구분" className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" />
          </label>
          <div className="grid gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 md:col-span-2">
            <button type="button" className="flex items-center justify-between gap-3 text-left text-sm font-semibold text-[#0f172a]" onClick={() => setAdvancedOpen((current) => !current)} disabled={isSaving}>
              <span>고급 설정</span>
              <span className="text-xs text-[#64748b]">{advancedOpen ? "접기" : "열기"}</span>
            </button>
            {advancedOpen ? (
              <div className="grid gap-3 md:grid-cols-2">
                <SelectField label="상태" value={status} options={["draft", "published", "archived"]} optionLabels={systemTemplateStatusLabels} disabled={isSaving} onChange={(value) => onStatusChange(value as SystemTemplateStatus)} />
                <SelectField label="공개 범위" value={visibility} options={["private", "public", "unlisted"]} optionLabels={systemTemplateVisibilityLabels} disabled={isSaving} onChange={(value) => onVisibilityChange(value as SystemTemplateVisibility)} />
                <SelectField label="가격 정책" value={pricingType} options={["free", "paid", "credit"]} optionLabels={systemTemplatePricingLabels} disabled={isSaving} onChange={(value) => onPricingTypeChange(value as SystemTemplatePricingType)} />
                {pricingType === "paid" ? (
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#0f172a]">판매 가격</span>
                    <input type="number" min="0" value={priceAmount} onChange={(event) => onPriceAmountChange(event.currentTarget.value)} disabled={isSaving} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" />
                  </label>
                ) : null}
                {pricingType === "credit" ? (
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#0f172a]">필요 크레딧</span>
                    <input type="number" min="0" value={creditCost} onChange={(event) => onCreditCostChange(event.currentTarget.value)} disabled={isSaving} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" />
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isSaving}>
            취소
          </button>
          <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={onSubmit} disabled={!canSubmit || isSaving}>
            {isSaving ? "저장 중.." : "저장"}
          </button>
        </div>
      </section>
    </div>
  );
}

const systemTemplateStatusLabels: Record<SystemTemplateStatus, string> = {
  draft: "초안",
  published: "게시됨",
  archived: "보관됨",
};

const systemTemplateVisibilityLabels: Record<SystemTemplateVisibility, string> = {
  private: "비공개",
  public: "공개",
  unlisted: "일부 공개",
};

const systemTemplatePricingLabels: Record<SystemTemplatePricingType, string> = {
  free: "무료",
  paid: "유료 결제",
  credit: "크레딧",
};

function SelectField({
  label,
  value,
  options,
  optionLabels,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-[#0f172a]">{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]">
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExportDialog({
  isExporting,
  platform,
  exportMode,
  exportName,
  exportVersionName,
  progressStep,
  elapsedSeconds,
  accountState,
  isAccountLoading,
  onClose,
  onModeChange,
  onNameChange,
  onVersionNameChange,
  onLogin,
  onBuyCredits,
  onSubmit,
}: {
  isExporting: boolean;
  platform: ThemePlatform;
  exportMode: ExportMode;
  exportName: string;
  exportVersionName: string;
  progressStep: number;
  elapsedSeconds: number;
  accountState: AccountState | null;
  isAccountLoading: boolean;
  onClose: () => void;
  onModeChange: (mode: ExportMode) => void;
  onNameChange: (value: string) => void;
  onVersionNameChange: (value: string) => void;
  onLogin: () => void;
  onBuyCredits: () => void;
  onSubmit: () => void;
}) {
  const steps = getExportProgressSteps(exportMode);
  const exportNameError = platform === "ios" && (exportName.trim().length === 0 || exportName.trim().length > 80) ? "테마 이름은 1~80자로 입력해 주세요." : null;
  const versionNameError = platform === "ios" && !/^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/.test(exportVersionName.trim()) ? "영문, 숫자, 점, 밑줄, 하이픈으로 32자 이하로 입력해 주세요." : null;
  const canSubmit = exportName.trim().length > 0 && exportVersionName.trim().length > 0 && !exportNameError && !versionNameError;
  const isLoggedIn = Boolean(accountState?.user);
  const credits = accountState?.credits ?? 0;
  const hasCredits = credits >= 1;
  const isAdmin = accountState?.isAdmin ?? false;
  const ctaLabel = !isLoggedIn
    ? "로그인 후 내보내기"
    : !hasCredits
      ? "크레딧 충전"
      : exportMode === "apk"
        ? "APK 내보내기"
        : exportMode === "apk-zip"
          ? "APK ZIP 내보내기"
          : exportMode === "project"
            ? "프로젝트 ZIP 내보내기"
            : "내보내기";

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !isExporting) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-[rgba(15,23,42,0.48)] backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[101] grid max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[22px] border border-[#e2e8f0] bg-white shadow-[0_24px_72px_rgba(15,23,42,0.24)] focus:outline-none"
          onEscapeKeyDown={(event) => { if (isExporting) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (isExporting) event.preventDefault(); }}
        >
        <div className="flex items-start justify-between gap-4 border-b border-[#e2e8f0] px-5 py-4">
          <div className="grid gap-1">
            <Dialog.Title className="text-lg font-bold text-[#0f172a]">{platform === "android" ? "Android 내보내기" : "iOS 내보내기"}</Dialog.Title>
            <Dialog.Description className="text-xs font-medium text-[#64748b]">완성된 테마를 설치하거나 보관할 파일로 만듭니다.</Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40" disabled={isExporting} aria-label="내보내기 창 닫기"><X size={18} /></button>
          </Dialog.Close>
        </div>

        <div className="overflow-y-auto px-5 py-4 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cbd5e1]">
        {isExporting ? (
          <div className="grid min-h-56 place-content-center gap-5 py-4 text-center" role="status" aria-live="polite">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><Download className="animate-pulse" size={22} aria-hidden="true" /></span>
            <div><p className="text-base font-bold text-[#0f172a]">{getExportNotice(exportMode)}</p><p className="mt-2 text-sm font-medium text-[#64748b]">{steps[Math.min(progressStep, steps.length - 1)]} · {formatElapsedTime(elapsedSeconds)}</p></div>
            <div className="mx-auto h-2 w-56 max-w-full overflow-hidden rounded-full bg-[#e2e8f0]"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#2563eb]" /></div>
            <p className="text-xs font-medium text-[#64748b]">완료될 때까지 이 창을 유지해 주세요.</p>
          </div>
        ) : <>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#0f172a]">{platform === "android" ? "앱 이름" : "테마 이름"}</span>
            <input
              type="text"
              value={exportName}
              onChange={(event) => onNameChange(event.currentTarget.value)}
              disabled={isExporting}
              aria-invalid={Boolean(exportNameError)}
              className={`h-11 rounded-xl border bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb] ${exportNameError ? "border-[#ef4444]" : "border-[#d1d5db]"}`}
            />
            {exportNameError ? <span className="text-xs font-medium text-[#dc2626]">{exportNameError}</span> : null}
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#0f172a]">{platform === "android" ? "앱 버전" : "테마 버전"}</span>
            <input
              type="text"
              value={exportVersionName}
              onChange={(event) => onVersionNameChange(event.currentTarget.value)}
              disabled={isExporting}
              aria-invalid={Boolean(versionNameError)}
              className={`h-11 rounded-xl border bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb] ${versionNameError ? "border-[#ef4444]" : "border-[#d1d5db]"}`}
            />
            {versionNameError ? <span className="text-xs font-medium text-[#dc2626]">{versionNameError}</span> : null}
          </label>
          {platform === "android" ? (
            <div className="flex items-start gap-3 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-3.5 py-3 text-[#1e3a8a] sm:col-span-2">
              <ShieldCheck className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
              <div><p className="text-sm font-bold">고유 앱 ID 자동 발급</p><p className="mt-0.5 text-xs font-medium leading-5 text-[#475569]">내보낼 때마다 계정과 요청 번호를 조합한 비식별 applicationId를 서버에서 생성합니다.</p></div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-3.5 py-3 text-[#1e3a8a] sm:col-span-2">
              <ShieldCheck className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
              <div><p className="text-sm font-bold">고유 테마 identifier 자동 발급</p><p className="mt-0.5 text-xs font-medium leading-5 text-[#475569]">내보낼 때마다 계정과 요청 번호를 조합한 비식별 identifier를 서버에서 생성하고 CSS에 적용합니다.</p></div>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="출력 형식">
          {platform === "ios" ? (
            <>
              <button
                type="button"
                role="radio"
                aria-checked={exportMode === "ktheme"}
                className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "ktheme" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
                onClick={() => onModeChange("ktheme")}
                disabled={isExporting}
              >
                <span className="block text-sm font-semibold text-[#0f172a]">iOS .ktheme</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={exportMode === "theme-zip"}
                className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "theme-zip" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
                onClick={() => onModeChange("theme-zip")}
                disabled={isExporting}
              >
                <span className="block text-sm font-semibold text-[#0f172a]">iOS 테마 ZIP</span>
              </button>
            </>
          ) : (
            <>
              {isAdmin ? <button
                type="button"
                role="radio"
                aria-checked={exportMode === "project"}
                className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "project" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
                onClick={() => onModeChange("project")}
                disabled={isExporting}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]"><Wrench size={16} aria-hidden="true" />프로젝트 ZIP</span>
                <span className="mt-1 block text-xs font-medium text-[#64748b]">관리자 디버깅용 빌드 전 소스</span>
              </button> : null}
              <button
                type="button"
                role="radio"
                aria-checked={exportMode === "apk"}
                className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "apk" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
                onClick={() => onModeChange("apk")}
                disabled={isExporting}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]"><Package size={16} aria-hidden="true" />Android APK</span>
                <span className="mt-1 block text-xs font-medium text-[#64748b]">기기에 바로 설치할 파일</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={exportMode === "apk-zip"}
                className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "apk-zip" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
                onClick={() => onModeChange("apk-zip")}
                disabled={isExporting}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]"><Archive size={16} aria-hidden="true" />APK ZIP</span>
                <span className="mt-1 block text-xs font-medium text-[#64748b]">공유하거나 보관하기 좋은 압축 파일</span>
              </button>
            </>
          )}
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-[#475569]">비용 <strong className="ml-1 text-[#0f172a]">1크레딧</strong></span>
            <span className="font-semibold text-[#475569]">보유 <strong className={`ml-1 ${hasCredits ? "text-emerald-700" : "text-rose-700"}`}>{isAccountLoading ? "확인 중" : `${credits}크레딧`}</strong></span>
          </div>
        </div>

        </>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e2e8f0] bg-white px-5 py-4">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isExporting}>
            취소
          </button>
          <button
            type="button"
            className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={!isLoggedIn ? onLogin : !hasCredits ? onBuyCredits : onSubmit}
            disabled={isExporting || isAccountLoading || (isLoggedIn && hasCredits && !canSubmit)}
          >
            {isExporting ? "내보내는 중…" : ctaLabel}
          </button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function getExportProgressSteps(mode: ExportMode) {
  if (mode === "ktheme") {
    return ["CSS 생성", "이미지 정리", ".ktheme 패키징", "다운로드 준비"];
  }
  if (mode === "theme-zip") {
    return ["CSS 생성", "이미지 정리", "ZIP 패키징", "다운로드 준비"];
  }
  if (mode === "project") {
    return ["리소스 준비", "프로젝트 생성", "메타데이터 반영", "압축 정리", "다운로드 준비"];
  }
  if (mode === "apk-zip") {
    return ["리소스 준비", "프로젝트 생성", "APK 빌드", "ZIP 압축", "다운로드 준비"];
  }
  return ["리소스 준비", "프로젝트 생성", "APK 빌드", "결과물 정리", "다운로드 준비"];
}

function getExportNotice(mode: ExportMode) {
  if (mode === "ktheme") return "iOS .ktheme 파일을 생성하는 중입니다.";
  if (mode === "theme-zip") return "iOS 테마 ZIP 파일을 생성하는 중입니다.";
  if (mode === "project") return "Android 프로젝트 ZIP을 생성하는 중입니다.";
  if (mode === "apk-zip") return "Android APK ZIP을 생성하는 중입니다.";
  return "Android APK를 빌드하는 중입니다.";
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getInitialPreviewSlotIds(platform: ThemePlatform, uploadRefs: RemoteSlotUploads) {
  const slots = getThemeSlots(platform);
  const roleOrder: ThemeResourceRole[] = ["chat_background", "main_background", "tab_background_image", "bubble_me_1", "bubble_you_1", "profile_image_1"];
  return roleOrder.map((role) => slots.find((slot) => slot.role === role)?.id).filter((slotId): slotId is string => Boolean(slotId && uploadRefs[slotId]?.length));
}

function getMissingRemoteUploadSlotIds(uploadRefs: RemoteSlotUploads, uploads: SlotUploads, slotIds?: string[]) {
  const targetSlotIds = slotIds?.length ? slotIds : Object.keys(uploadRefs);
  return targetSlotIds.filter((slotId) => {
    const refs = uploadRefs[slotId] ?? [];
    if (!refs.length) return false;
    const currentIds = new Set((uploads[slotId] ?? []).map((entry) => entry.id));
    return refs.some((entry) => !currentIds.has(entry.id));
  });
}

function keepCurrentRemoteUploads(uploads: SlotUploads, uploadRefs: RemoteSlotUploads): SlotUploads {
  const next: SlotUploads = {};
  for (const [slotId, entries] of Object.entries(uploads)) {
    if (!entries?.length) continue;
    const currentRefIds = new Set((uploadRefs[slotId] ?? []).map((entry) => entry.id));
    const currentEntries = entries.filter((entry) => currentRefIds.has(entry.id));
    if (currentEntries.length) next[slotId] = currentEntries;
  }
  return next;
}

function mergeSlotUploads(current: SlotUploads, incoming: SlotUploads): SlotUploads {
  const next: SlotUploads = { ...current };
  for (const [slotId, entries] of Object.entries(incoming)) {
    if (!entries?.length) continue;
    const currentEntries = next[slotId] ?? [];
    const currentIds = new Set(currentEntries.map((entry) => entry.id));
    next[slotId] = [...currentEntries, ...entries.filter((entry) => !currentIds.has(entry.id))];
  }
  return next;
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

function getDownloadFileName(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      // Fall back to the ASCII filename below.
    }
  }
  const match = /filename="([^"]+)"/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

async function createExportFormData(options: ExportPayloadOptions) {
  if (isIosExportMode(options.mode)) {
    return createIosExportFormData({ ...options, mode: options.mode });
  }
  return createAndroidExportFormData({ ...options, mode: isAndroidExportMode(options.mode) ? options.mode : "apk" });
}

function isAndroidExportMode(mode: ExportMode): mode is "project" | "apk" | "apk-zip" {
  return mode === "project" || mode === "apk" || mode === "apk-zip";
}

function isIosExportMode(mode: ExportMode): mode is "theme-zip" | "ktheme" {
  return mode === "theme-zip" || mode === "ktheme";
}

async function createIosExportFormData({
  analysis,
  template,
  templateId,
  exportName,
  versionName,
  mode,
  slots,
  uploads,
  colors,
  selections,
  bubbleMarkers,
  bubbleInsets,
  bubbleStretch,
}: IosExportPayloadOptions) {
  const bubbleEditsBySlotId = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      {
        markers: bubbleMarkers[slot.id],
        insets: bubbleInsets[slot.id],
        stretch: bubbleStretch[slot.id],
      },
    ]),
  );

  const exportFiles = await buildIosThemeExportFiles({
    analysis,
    template,
    templateId,
    exportName,
    versionName,
    slots,
    uploads,
    colors,
    selections,
    bubbleEditsBySlotId,
  });

  const formData = new FormData();
  const manifest = exportFiles.map((file, index) => {
    const field = `file-${index}`;
    formData.append(field, new File([file.blob], file.path.split("/").at(-1) ?? `export-${index}`));
    return { field, path: file.path };
  });

  formData.append("manifest", JSON.stringify(manifest));
  formData.append("exportName", exportName);
  formData.append("versionName", versionName);
  formData.append("mode", mode);

  return formData;
}

async function createAndroidExportFormData({
  analysis,
  template,
  templateId,
  exportName,
  versionName,
  mode,
  slots,
  uploads,
  colors,
  selections,
  bubbleMarkers,
  bubbleInsets,
  bubbleStretch,
}: AndroidExportPayloadOptions) {
  const bubbleEditsBySlotId = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      {
        markers: bubbleMarkers[slot.id],
        insets: bubbleInsets[slot.id],
        stretch: bubbleStretch[slot.id],
      },
    ]),
  );

  const exportFiles = await buildAndroidThemeExportFiles({
    analysis,
    template,
    templateId,
    exportName,
    slots,
    uploads,
    colors,
    selections,
    bubbleEditsBySlotId,
  });

  const formData = new FormData();
  const manifest = exportFiles.map((file, index) => {
    const field = `file-${index}`;
    formData.append(field, new File([file.blob], file.path.split("/").at(-1) ?? `export-${index}`));
    return { field, path: file.path };
  });

  formData.append("manifest", JSON.stringify(manifest));
  formData.append("exportName", exportName);
  formData.append("versionName", versionName);
  formData.append("mode", mode);

  return formData;
}

function triggerDownload(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(href);
}

function getThemeFilePaletteKey(file: ThemeProjectFile) {
  if (file.file) return `${file.path}:${file.file.name}:${file.file.size}:${file.file.lastModified}`;
  return `${file.path}:${file.sourceUrl ?? "embedded"}:${file.size}`;
}
