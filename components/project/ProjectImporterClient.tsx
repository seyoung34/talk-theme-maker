"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectGroupRail } from "@/components/project/ProjectGroupRail";
import { ProjectPreviewPanel } from "@/components/project/ProjectPreviewPanel";
import { ProjectQuickEditPanel } from "@/components/project/ProjectQuickEditPanel";
import { ProjectSectionRail } from "@/components/project/ProjectSectionRail";
import {
  bubbleSlotFromRole,
  getCompletion,
  getInitialSlotCandidateSelections,
  getSectionGroups,
  getSlotFile,
  sectionLabels,
  type BubbleEditState,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/components/project/projectModel";
import { dataUrlForThemeFile } from "@/components/preview/previewResourceUtils";
import { buildAndroidThemeExportFiles } from "@/lib/theme/android/export";
import { listAdminAssetCandidates, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { buildIosThemeExportFiles } from "@/lib/theme/ios/export";
import { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
import { readTemplateStartPayload } from "@/lib/theme/project/state";
import { localSystemTemplateRepository, type SystemTemplatePricingType, type SystemTemplateStatus, type SystemTemplateVisibility } from "@/lib/theme/systemTemplates";
import { getUserTemplate, saveUserTemplate } from "@/lib/theme/userTemplates";
import {
  getThemeSlots,
  getThemeTemplate,
  templateStartStorageKey,
  type ThemeAssetSlot,
  type ThemeTemplate,
  type ThemeTemplateId,
} from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

const editorHandoffKey = "kakaotalk-theme-maker:editor-handoff:v1";

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

type AndroidExportPayloadOptions = {
  analysis: ReturnType<typeof createThemeProjectAnalysis>;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  exportName: string;
  versionName: string;
  applicationId: string;
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
  const [platform, setPlatform] = useState<ThemePlatform>("android");
  const [activeSection, setActiveSection] = useState<ThemeSection>("chatroom");
  const [activeGroup, setActiveGroup] = useState<ThemeSlotGroup>("bubbles");
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>();
  const [uploads, setUploads] = useState<SlotUploads>({});
  const [colors, setColors] = useState<SlotColors>({});
  const [candidateSelections, setCandidateSelections] = useState<SlotCandidateSelections>({});
  const [screenRailOpen, setScreenRailOpen] = useState(true);
  const [candidateOpen, setCandidateOpen] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [activeUserTemplate, setActiveUserTemplate] = useState<ActiveUserTemplate | null>(null);
  const [activeSystemTemplate, setActiveSystemTemplate] = useState<ActiveSystemTemplate | null>(null);
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
  const [exportApplicationId, setExportApplicationId] = useState("");
  const [applicationIdEdited, setApplicationIdEdited] = useState(false);
  const [exportProgressStep, setExportProgressStep] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [bubbleMarkers, setBubbleMarkers] = useState<Partial<Record<string, Markers>>>({});
  const [bubbleInsets, setBubbleInsets] = useState<Partial<Record<string, Insets>>>({});
  const [bubbleStretch, setBubbleStretch] = useState<Partial<Record<string, StretchPoint>>>({});
  const [adminAssets, setAdminAssets] = useState<AdminAssetCandidate[]>([]);
  const [adminAssetsWithPreview, setAdminAssetsWithPreview] = useState<Array<AdminAssetCandidate & { previewUrl: string }>>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const skipDefaultSelectionResetRef = useRef(false);

  useEffect(() => {
    const payload = readTemplateStartPayload(templateStartStorageKey);
    if (!payload) return;

    const loadStartedTemplate = async () => {
      setTemplateId(payload.templateId);
      setPlatform(payload.platform);
      setActiveSection("chatroom");
      setActiveGroup("bubbles");
      setSelectedSlotId(undefined);
      setUploads({});
      setColors({});
      setActiveUserTemplate(null);
      setActiveSystemTemplate(null);

      if (payload.systemTemplateId) {
        try {
          const savedTemplate = await localSystemTemplateRepository.get(payload.systemTemplateId);
          if (!savedTemplate) {
            setNotice({ tone: "warning", message: "?쒖뒪???쒗뵆由우쓣 李얠쓣 ???놁뼱 湲곕낯 ?쒗뵆由우쑝濡??쒖옉?⑸땲??" });
            return;
          }

          skipDefaultSelectionResetRef.current = true;
          setTemplateId(savedTemplate.baseTemplateId);
          setPlatform(payload.platform);
          setUploads(savedTemplate.overrides.uploads);
          setColors(savedTemplate.overrides.colors);
          setCandidateSelections(savedTemplate.overrides.candidateSelections);
          setBubbleMarkers(savedTemplate.overrides.bubbleEdits.markers);
          setBubbleInsets(savedTemplate.overrides.bubbleEdits.insets);
          setBubbleStretch(savedTemplate.overrides.bubbleEdits.stretch);
          setActiveSystemTemplate({
            id: savedTemplate.id,
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
          setNotice({ tone: "success", message: `${savedTemplate.title} ?쒖뒪???쒗뵆由우쓣 遺덈윭?붿뒿?덈떎.` });
        } catch (error) {
          console.error(error);
          setNotice({ tone: "error", message: "?쒖뒪???쒗뵆由우쓣 遺덈윭?ㅻ뒗 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎." });
        }
        return;
      }

      if (!payload.userTemplateId) return;

      try {
        const savedTemplate = await getUserTemplate(payload.userTemplateId);
        if (!savedTemplate) {
          setNotice({ tone: "warning", message: "저장한 템플릿을 찾을 수 없어 기본 템플릿으로 시작합니다." });
          return;
        }

        skipDefaultSelectionResetRef.current = true;
        setTemplateId(savedTemplate.templateId);
        setPlatform(savedTemplate.platform);
        setUploads(savedTemplate.uploads);
        setColors(savedTemplate.colors);
        setCandidateSelections(savedTemplate.candidateSelections);
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
    localStorage.removeItem(templateStartStorageKey);
  }, []);

  useEffect(() => {
    let active = true;
    listAdminAssetCandidates()
      .then((records) => {
        if (active) setAdminAssets(records);
      })
      .catch((error) => console.error(error));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const next = adminAssets.map((asset) => ({ ...asset, previewUrl: URL.createObjectURL(asset.blob) }));
    setAdminAssetsWithPreview(next);
    return () => {
      next.forEach((asset) => URL.revokeObjectURL(asset.previewUrl));
    };
  }, [adminAssets]);

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

  useEffect(() => {
    if (!groups.includes(activeGroup)) {
      setActiveGroup(groups[0] ?? "background");
    }
  }, [activeGroup, groups]);

  const visibleSlots = useMemo(() => slots.filter((slot) => slot.section === activeSection && slot.group === activeGroup), [activeGroup, activeSection, slots]);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? visibleSlots[0] ?? slots[0];
  const selectedFile = getSlotFile(selectedSlot, analysis.files);
  const selectedBubbleSlot = selectedSlot ? bubbleSlotFromRole(selectedSlot.role) : null;
  const canAdjustInline = Boolean(selectedSlot?.editableInBubbleEditor && selectedFile && selectedBubbleSlot);
  const completion = getCompletion(slots, uploads, colors, candidateSelections, templateId, activeTemplate);

  const selectSection = (section: ThemeSection) => {
    setActiveSection(section);
    const nextGroups = getSectionGroups(section, slots);
    const nextGroup = nextGroups[0];
    if (nextGroup) setActiveGroup(nextGroup);
    const firstSlot = slots.find((slot) => slot.section === section && (!nextGroup || slot.group === nextGroup));
    setSelectedSlotId(firstSlot?.id);
  };

  const selectGroup = (group: ThemeSlotGroup) => {
    setActiveGroup(group);
    const firstSlot = slots.find((slot) => slot.section === activeSection && slot.group === group);
    setSelectedSlotId(firstSlot?.id);
  };

  const uploadSlot = (slot: ThemeAssetSlot, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const uploadId = `${slot.id}:upload:${Date.now()}`;
    setUploads((current) => ({
      ...current,
      [slot.id]: [...(current[slot.id] ?? []), { id: uploadId, file }],
    }));
    setCandidateSelections((current) => ({ ...current, [slot.id]: uploadId }));
    setSelectedSlotId(slot.id);
    setActiveSection(slot.section);
    setActiveGroup(slot.group);
  };

  const clearSlot = (slot: ThemeAssetSlot) => {
    setUploads((current) => {
      const next = { ...current };
      delete next[slot.id];
      return next;
    });
    setCandidateSelections((current) => ({
      ...current,
      [slot.id]: getInitialSlotCandidateSelections([slot], templateId, activeTemplate)[slot.id],
    }));
  };

  const changeColor = (slot: ThemeAssetSlot, value: string) => {
    setColors((current) => ({ ...current, [slot.id]: value }));
    setSelectedSlotId(slot.id);
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

  const selectAdminAsset = (slot: ThemeAssetSlot, asset: AdminAssetCandidate) => {
    const file = new File([asset.blob], asset.fileName, { type: asset.mimeType });
    setUploads((current) => {
      const entries = current[slot.id] ?? [];
      const nextEntries = entries.some((entry) => entry.id === asset.id) ? entries : [...entries, { id: asset.id, file }];
      return { ...current, [slot.id]: nextEntries };
    });
    setCandidateSelections((current) => ({ ...current, [slot.id]: asset.id }));
    setSelectedSlotId(slot.id);
    setActiveSection(slot.section);
    setActiveGroup(slot.group);
  };

  const openAdvancedBubbleEditor = async () => {
    if (!selectedSlot?.editableInBubbleEditor || !selectedFile) {
      router.push("/editor");
      return;
    }

    const bubbleSlot = bubbleSlotFromRole(selectedSlot.role);
    if (!bubbleSlot) {
      router.push("/editor");
      return;
    }

    const dataUrl = await dataUrlForThemeFile(selectedFile);
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
      const savedTemplate = await saveUserTemplate({
        id: saveMode === "overwrite" ? activeUserTemplate?.id : undefined,
        createdAt: saveMode === "overwrite" ? activeUserTemplate?.createdAt : undefined,
        name,
        templateId,
        platform,
        uploads,
        colors,
        candidateSelections,
        bubbleEdits: {
          markers: bubbleMarkers,
          insets: bubbleInsets,
          stretch: bubbleStretch,
        },
      });
      setActiveUserTemplate({ id: savedTemplate.id, name: savedTemplate.name, createdAt: savedTemplate.createdAt });
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
    setSystemTitle(displayTemplateName);
    setSystemDescription(activeSystemTemplate?.description ?? "");
    setSystemTags(activeSystemTemplate?.tags.join(", ") ?? "");
    setSystemStatus(activeSystemTemplate?.status ?? "draft");
    setSystemVisibility(activeSystemTemplate?.visibility ?? "private");
    setSystemPricingType(activeSystemTemplate?.pricingType ?? "free");
    setSystemPriceAmount(activeSystemTemplate?.priceAmount ? String(activeSystemTemplate.priceAmount) : "");
    setSystemCreditCost(activeSystemTemplate?.creditCost ? String(activeSystemTemplate.creditCost) : "");
    setSystemSaveDialogOpen(true);
  };

  const saveSystemTemplate = async () => {
    const title = systemTitle.trim();
    if (!title) return;

    try {
      setIsSavingSystemTemplate(true);
      setNotice({ tone: "info", message: "시스템 템플릿을 저장하는 중입니다." });
      const savedTemplate = await localSystemTemplateRepository.save({
        id: activeSystemTemplate?.id,
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
          uploads,
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
          throw new Error(payload.error ?? "Android sample config read failed.");
        }
        setExportVersionName(payload.versionName ?? "1.0.0");
      }
      setExportName(displayTemplateName);
      setExportApplicationId(createAndroidApplicationId(displayTemplateName));
      setApplicationIdEdited(false);
      setExportMode(platform === "android" ? "apk" : "ktheme");
      setExportProgressStep(0);
      setExportDialogOpen(true);
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Android export 설정을 불러오는 중 오류가 발생했습니다." });
    }
  };

  const submitExport = async () => {
    const progressSteps = getExportProgressSteps(exportMode);
    let progressTimer: number | null = null;

    try {
      setIsExporting(true);
      setExportProgressStep(0);
      setNotice({ tone: "info", message: getExportNotice(exportMode) });
      progressTimer = window.setInterval(() => {
        setExportProgressStep((current) => (current >= progressSteps.length - 2 ? current : current + 1));
      }, 850);

      const formData = await createExportFormData({
        analysis,
        template: activeTemplate,
        templateId,
        exportName,
        versionName: exportVersionName,
        applicationId: exportApplicationId,
        mode: exportMode,
        slots,
        uploads,
        colors,
        selections: candidateSelections,
        bubbleMarkers,
        bubbleInsets,
        bubbleStretch,
      });

      const response = await fetch(platform === "android" ? "/api/export/android" : "/api/export/ios", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? "Android export failed.");
      }

      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      setExportProgressStep(progressSteps.length - 1);
      const blob = await response.blob();
      const fileName = getDownloadFileName(response.headers.get("content-disposition")) ?? `${exportName}-android-export`;
      triggerDownload(blob, fileName);
      setExportDialogOpen(false);
      setNotice({ tone: "success", message: `${fileName} 파일을 생성했습니다.` });
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Android export 중 오류가 발생했습니다." });
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      setIsExporting(false);
    }
  };

  return (
    <main className="h-[100dvh] overflow-hidden px-3 py-3 text-[#111827] md:px-4 md:py-4">
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
          exportApplicationId={exportApplicationId}
          progressStep={exportProgressStep}
          onClose={() => {
            if (!isExporting) {
              setExportDialogOpen(false);
              setExportProgressStep(0);
            }
          }}
          onModeChange={setExportMode}
          onNameChange={(value) => {
            setExportName(value);
            if (platform === "android" && !applicationIdEdited) {
              setExportApplicationId(createAndroidApplicationId(value));
            }
          }}
          onVersionNameChange={setExportVersionName}
          onApplicationIdChange={(value) => {
            setApplicationIdEdited(true);
            setExportApplicationId(value);
          }}
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

      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3 md:gap-4">
        <header className="grid min-h-[56px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-[#e5e7eb] bg-white/95 px-4 py-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-4 justify-self-start">
            <Link href="/template" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e5e7eb] bg-[#f8fafc] text-xl font-bold leading-none text-[#111827] transition hover:bg-white">
              &larr;
            </Link>
            <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em] text-[#0f172a]">{displayTemplateName}</h1>
          </div>

          <div className="flex min-w-0 items-center gap-3 overflow-hidden justify-self-center">
            <div className="hidden shrink-0 rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-2.5 py-1 text-[11px] font-semibold text-[#475569] md:block">
              {platform === "android" ? "Android" : "iOS"}
            </div>
            <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[#e5e7eb]">
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

          <div className="flex min-w-0 items-center gap-2 shrink-0 justify-self-end">
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
              className={`${isAdminMode ? "hidden" : ""} rounded-xl border border-[#d1d5db] bg-white px-3.5 py-2 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-wait disabled:opacity-60`}
              onClick={openSaveDialog}
              disabled={isSavingTemplate}
            >
              {isSavingTemplate ? "저장 중.." : "내 템플릿으로 저장"}
            </button>
            <button
              type="button"
              className={`${isAdminMode ? "hidden" : ""} rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:bg-[#1e293b] disabled:cursor-wait disabled:opacity-60`}
              onClick={() => void openExportDialog()}
              disabled={isExporting}
            >
              {isExporting ? "내보내는 중.." : "내보내기"}
            </button>
          </div>
        </header>

        <section className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_300px] gap-3 lg:grid-cols-[auto_minmax(0,1fr)_280px] lg:grid-rows-1 xl:grid-cols-[auto_minmax(0,1fr)_300px] 2xl:grid-cols-[auto_minmax(0,1fr)_320px]">
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

          <section className="grid min-h-0 min-w-0 grid-cols-[172px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white/95 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm">
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
                setActiveSection(slot.section);
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
                onSelectCandidate={selectCandidate}
                onSelectAdminAsset={selectAdminAsset}
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
            className="col-span-2 lg:col-span-1 lg:row-start-auto"
            onSelectSlot={setSelectedSlotId}
          />
        </section>
      </div>
    </main>
  );
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
          <SelectField label="Status" value={status} options={["draft", "published", "archived"]} disabled={isSaving} onChange={(value) => onStatusChange(value as SystemTemplateStatus)} />
          <SelectField label="Visibility" value={visibility} options={["private", "public", "unlisted"]} disabled={isSaving} onChange={(value) => onVisibilityChange(value as SystemTemplateVisibility)} />
          <SelectField label="Pricing" value={pricingType} options={["free", "paid", "credit"]} disabled={isSaving} onChange={(value) => onPricingTypeChange(value as SystemTemplatePricingType)} />
          {pricingType === "paid" ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#0f172a]">Price</span>
              <input type="number" min="0" value={priceAmount} onChange={(event) => onPriceAmountChange(event.currentTarget.value)} disabled={isSaving} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" />
            </label>
          ) : null}
          {pricingType === "credit" ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#0f172a]">Credit cost</span>
              <input type="number" min="0" value={creditCost} onChange={(event) => onCreditCostChange(event.currentTarget.value)} disabled={isSaving} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" />
            </label>
          ) : null}
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

function SelectField({ label, value, options, disabled, onChange }: { label: string; value: string; options: string[]; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-[#0f172a]">{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
  exportApplicationId,
  progressStep,
  onClose,
  onModeChange,
  onNameChange,
  onVersionNameChange,
  onApplicationIdChange,
  onSubmit,
}: {
  isExporting: boolean;
  platform: ThemePlatform;
  exportMode: ExportMode;
  exportName: string;
  exportVersionName: string;
  exportApplicationId: string;
  progressStep: number;
  onClose: () => void;
  onModeChange: (mode: ExportMode) => void;
  onNameChange: (value: string) => void;
  onVersionNameChange: (value: string) => void;
  onApplicationIdChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const steps = getExportProgressSteps(exportMode);
  const applicationIdError = platform === "android" ? getAndroidApplicationIdError(exportApplicationId) : null;
  const canSubmit = exportName.trim().length > 0 && exportVersionName.trim().length > 0 && !applicationIdError;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="내보내기">
      <section className="grid w-full max-w-[520px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-[#0f172a]">내보내기</h2>
            <p className="text-sm text-[#64748b]">이름, 버전, 결과물을 설정합니다.</p>
          </div>
          <button type="button" className="rounded-full border border-[#e5e7eb] px-3 py-1 text-sm font-semibold text-[#475569]" onClick={onClose} disabled={isExporting}>
            닫기
          </button>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#0f172a]">이름</span>
            <input
              type="text"
              value={exportName}
              onChange={(event) => onNameChange(event.currentTarget.value)}
              disabled={isExporting}
              className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#0f172a]">versionName</span>
            <input
              type="text"
              value={exportVersionName}
              onChange={(event) => onVersionNameChange(event.currentTarget.value)}
              disabled={isExporting}
              className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]"
            />
          </label>
          {platform === "android" ? (
            <div className="grid gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3">
              <button
                type="button"
                className="flex items-center justify-between gap-3 text-left text-sm font-semibold text-[#0f172a]"
                onClick={() => setAdvancedOpen((current) => !current)}
                disabled={isExporting}
              >
                <span>Android 고급 옵션</span>
                <span className="text-xs text-[#64748b]">{advancedOpen ? "접기" : "열기"}</span>
              </button>
              {advancedOpen ? (
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#0f172a]">applicationId</span>
                  <input
                    type="text"
                    value={exportApplicationId}
                    onChange={(event) => onApplicationIdChange(event.currentTarget.value)}
                    disabled={isExporting}
                    spellCheck={false}
                    className={`h-11 rounded-xl border bg-white px-3 font-mono text-sm text-[#111827] outline-none transition focus:border-[#2563eb] ${
                      applicationIdError ? "border-[#ef4444]" : "border-[#d1d5db]"
                    }`}
                  />
                  {applicationIdError ? <span className="text-xs font-medium text-[#dc2626]">{applicationIdError}</span> : null}
                </label>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          {platform === "ios" ? (
            <>
              <button
                type="button"
                className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "ktheme" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
                onClick={() => onModeChange("ktheme")}
                disabled={isExporting}
              >
                <span className="block text-sm font-semibold text-[#0f172a]">iOS .ktheme</span>
              </button>
              <button
                type="button"
                className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "theme-zip" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
                onClick={() => onModeChange("theme-zip")}
                disabled={isExporting}
              >
                <span className="block text-sm font-semibold text-[#0f172a]">iOS 테마 ZIP</span>
              </button>
            </>
          ) : (
            <>
          <button
            type="button"
            className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "project" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
            onClick={() => onModeChange("project")}
            disabled={isExporting}
          >
            <span className="block text-sm font-semibold text-[#0f172a]">빌드 전 프로젝트 내보내기</span>
          </button>
          <button
            type="button"
            className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "apk" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
            onClick={() => onModeChange("apk")}
            disabled={isExporting}
          >
            <span className="block text-sm font-semibold text-[#0f172a]">Android APK로 내보내기</span>
          </button>
          <button
            type="button"
            className={`rounded-2xl border px-4 py-3 text-left ${exportMode === "apk-zip" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}
            onClick={() => onModeChange("apk-zip")}
            disabled={isExporting}
          >
            <span className="block text-sm font-semibold text-[#0f172a]">Android APK ZIP으로 내보내기</span>
          </button>
            </>
          )}
        </div>

        <div className="grid gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-4">
          <div className="h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
            <div className="h-full rounded-full bg-[#2563eb] transition-all" style={{ width: `${((progressStep + 1) / steps.length) * 100}%` }} />
          </div>
          <div className="grid gap-1">
            {steps.map((step, index) => (
              <div key={step} className={`text-sm ${index === progressStep ? "font-semibold text-[#0f172a]" : index < progressStep ? "text-[#2563eb]" : "text-[#94a3b8]"}`}>
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isExporting}>
            취소
          </button>
          <button
            type="button"
            className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onSubmit}
            disabled={!canSubmit || isExporting}
          >
            {isExporting ? "내보내는 중.." : "내보내기"}
          </button>
        </div>
      </section>
    </div>
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
  applicationId,
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
  formData.append("applicationId", applicationId);
  formData.append("mode", mode);

  return formData;
}

const androidPackageSegmentReservedWords = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "void",
  "volatile",
  "while",
]);

function createAndroidApplicationId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safeSlug = slug && /^[a-z_]/.test(slug) && !androidPackageSegmentReservedWords.has(slug) ? slug : "custom_theme";
  return `com.kakao.talk.theme.${safeSlug}`;
}

function getAndroidApplicationIdError(value: string) {
  const applicationId = value.trim();
  if (!applicationId) return "applicationId를 입력하세요.";
  if (!/^[a-z0-9_.]+$/.test(applicationId)) return "소문자 영문, 숫자, _, .만 사용할 수 있습니다.";

  const segments = applicationId.split(".");
  if (segments.length < 2) return "최소 2개 이상의 segment가 필요합니다.";

  for (const segment of segments) {
    if (!segment) return "빈 segment는 사용할 수 없습니다.";
    if (!/^[a-z_][a-z0-9_]*$/.test(segment)) return "각 segment는 소문자 영문 또는 _로 시작해야 합니다.";
    if (androidPackageSegmentReservedWords.has(segment)) return `예약어 '${segment}'는 사용할 수 없습니다.`;
  }

  return null;
}

function triggerDownload(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(href);
}
