"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { persistEditorSession } from "@/components/project/editorSession";
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";
import type { ActiveSystemTemplate, ActiveUserTemplate, ProjectNotice } from "@/components/project/editorTypes";
import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/components/project/projectModel";
import { systemTemplateRepository, type SystemTemplatePricingType, type SystemTemplateStatus, type SystemTemplateVisibility } from "@/lib/theme/systemTemplates";
import { saveUserTemplate } from "@/lib/theme/userTemplates";
import type { ThemeTemplateId } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import type { BubbleDecorationSources, BubbleDesigns } from "@/lib/theme/bubbleBuilder";
import { validateTemplateName } from "@/lib/theme/templateName";

type UseTemplatePersistenceOptions = {
  activeSystemTemplate: ActiveSystemTemplate | null;
  activeUserTemplate: ActiveUserTemplate | null;
  bubbleInsets: Partial<Record<string, Insets>>;
  bubbleMarkers: Partial<Record<string, Markers>>;
  bubbleStretch: Partial<Record<string, StretchPoint>>;
  bubbleDesigns: BubbleDesigns;
  bubbleDecorationSources: BubbleDecorationSources;
  candidateSelections: SlotCandidateSelections;
  colors: SlotColors;
  ensureSystemTemplateUploadsHydrated: () => Promise<SlotUploads>;
  isAdminMode: boolean;
  mode: "user" | "admin";
  platform: ThemePlatform;
  saveMode: "overwrite" | "saveAs";
  saveName: string;
  setActiveSystemTemplate: Dispatch<SetStateAction<ActiveSystemTemplate | null>>;
  setActiveUserTemplate: Dispatch<SetStateAction<ActiveUserTemplate | null>>;
  setNotice: Dispatch<SetStateAction<ProjectNotice | null>>;
  setSaveDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSystemSaveDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSystemTemplateBundleId: Dispatch<SetStateAction<string | null>>;
  systemCreditCost: string;
  systemDescription: string;
  systemPriceAmount: string;
  systemPricingType: SystemTemplatePricingType;
  systemStatus: SystemTemplateStatus;
  systemTags: string;
  systemTemplateBundleId: string | null;
  systemTitle: string;
  systemVisibility: SystemTemplateVisibility;
  templateId: ThemeTemplateId;
};

export function useTemplatePersistence(options: UseTemplatePersistenceOptions) {
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSavingSystemTemplate, setIsSavingSystemTemplate] = useState(false);

  const saveCurrentTemplate = useCallback(async () => {
    const name = options.saveMode === "overwrite" ? options.activeUserTemplate?.name ?? options.saveName.trim() : options.saveName.trim();
    const nameValidation = validateTemplateName(name);
    if (nameValidation.error && name !== options.activeUserTemplate?.name) {
      options.setNotice({ tone: "error", message: nameValidation.error });
      return;
    }

    try {
      setIsSavingTemplate(true);
      options.setNotice({ tone: "info", message: "현재 편집 상태를 내 템플릿으로 저장하는 중입니다." });
      const uploads = await options.ensureSystemTemplateUploadsHydrated();
      const savedTemplate = await saveUserTemplate({
        id: options.saveMode === "overwrite" ? options.activeUserTemplate?.id : undefined,
        createdAt: options.saveMode === "overwrite" ? options.activeUserTemplate?.createdAt : undefined,
        name: nameValidation.value,
        templateId: options.templateId,
        platform: options.platform,
        uploads,
        colors: options.colors,
        candidateSelections: options.candidateSelections,
        bubbleEdits: { markers: options.bubbleMarkers, insets: options.bubbleInsets, stretch: options.bubbleStretch },
        bubbleDesigns: options.bubbleDesigns,
        bubbleDecorationSources: options.bubbleDecorationSources,
      });
      options.setActiveUserTemplate({ id: savedTemplate.id, name: savedTemplate.name, createdAt: savedTemplate.createdAt });
      persistEditorSession(options.mode, { templateId: savedTemplate.templateId, platform: savedTemplate.platform, userTemplateId: savedTemplate.id, editMode: options.mode });
      options.setSaveDialogOpen(false);
      options.setNotice({ tone: "success", message: `${savedTemplate.name} 템플릿을 이 브라우저에 저장했습니다.` });
      trackAnalyticsEvent("template_save_completed", { save_mode: options.saveMode, platform: options.platform });
    } catch (error) {
      console.error(error);
      options.setNotice({ tone: "error", message: "내 템플릿 저장 중 오류가 발생했습니다. 브라우저 저장소 권한을 확인하세요." });
    } finally {
      setIsSavingTemplate(false);
    }
  }, [options]);

  const saveSystemTemplate = useCallback(async () => {
    if (!options.isAdminMode) {
      options.setSystemSaveDialogOpen(false);
      options.setNotice({ tone: "warning", message: "일반 사용자 이미지는 브라우저 저장소에만 저장됩니다. 시스템 템플릿 저장은 관리자 전용입니다." });
      return;
    }

    const title = options.systemTitle.trim();
    const titleValidation = validateTemplateName(title);
    if (titleValidation.error && title !== options.activeSystemTemplate?.title) {
      options.setNotice({ tone: "error", message: titleValidation.error });
      return;
    }

    try {
      setIsSavingSystemTemplate(true);
      options.setNotice({ tone: "info", message: "시스템 템플릿을 저장하는 중입니다." });
      const uploads = await options.ensureSystemTemplateUploadsHydrated();
      const savedTemplate = await systemTemplateRepository.save({
        id: options.activeSystemTemplate?.id,
        bundleId: options.activeSystemTemplate?.bundleId ?? options.systemTemplateBundleId ?? undefined,
        createdAt: options.activeSystemTemplate?.createdAt,
        title: titleValidation.value,
        legacyTitle: options.activeSystemTemplate?.title,
        description: options.systemDescription.trim() || undefined,
        baseTemplateId: "basic",
        platform: options.platform,
        status: options.systemStatus,
        visibility: options.systemVisibility,
        pricingType: options.systemPricingType,
        priceAmount: options.systemPricingType === "paid" ? Number(options.systemPriceAmount) || 0 : undefined,
        creditCost: options.systemPricingType === "credit" ? Number(options.systemCreditCost) || 0 : undefined,
        tags: options.systemTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        overrides: {
          colors: options.colors,
          uploads,
          candidateSelections: options.candidateSelections,
          bubbleEdits: { markers: options.bubbleMarkers, insets: options.bubbleInsets, stretch: options.bubbleStretch, designs: options.bubbleDesigns },
        },
      });
      options.setActiveSystemTemplate({
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
      options.setSystemTemplateBundleId(savedTemplate.bundleId ?? savedTemplate.id);
      persistEditorSession(options.mode, {
        templateId: savedTemplate.baseTemplateId,
        platform: savedTemplate.platform,
        systemTemplateId: savedTemplate.id,
        systemTemplateBundleId: savedTemplate.bundleId ?? savedTemplate.id,
        editMode: options.mode,
      });
      options.setSystemSaveDialogOpen(false);
      options.setNotice({ tone: "success", message: `${savedTemplate.title} 시스템 템플릿을 저장했습니다.` });
      trackAnalyticsEvent("template_save_completed", { save_mode: "system", platform: options.platform });
    } catch (error) {
      console.error(error);
      options.setNotice({ tone: "error", message: "시스템 템플릿 저장 중 오류가 발생했습니다." });
    } finally {
      setIsSavingSystemTemplate(false);
    }
  }, [options]);

  return { isSavingSystemTemplate, isSavingTemplate, saveCurrentTemplate, saveSystemTemplate };
}
