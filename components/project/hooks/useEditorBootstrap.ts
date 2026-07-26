"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { takeTemplateStartPayload } from "@/components/project/editorSession";
import type { ActiveSystemTemplate, ActiveUserTemplate, InitialLoadState, ProjectNotice } from "@/components/project/editorTypes";
import { createEmptyThemeDraft, type ThemeDraft } from "@/lib/theme/project/draft";
import type { SlotUploads } from "@/components/project/projectModel";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import { systemTemplateRepository } from "@/lib/theme/systemTemplates";
import { convertSystemTemplateOverridesByRole } from "@/lib/theme/systemTemplates/roleOverrides";
import { normalizeLegacyColorOverrides } from "@/lib/theme/project/legacyOverrides";
import { clearRecoveryDraft, readRecoveryDraft, type RecoveryExportOptions } from "@/lib/theme/project/recoveryDraft";
import { getUserTemplate } from "@/lib/theme/userTemplates";
import { getThemeSlots, getThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

type UseEditorBootstrapOptions = {
  hydratePreviewUploads: (uploadRefs: RemoteSlotUploads, slotIds: string[], onProgress: (completed: number, total: number) => void) => Promise<SlotUploads>;
  hydrateSystemTemplateUploads: (uploadRefs: RemoteSlotUploads) => Promise<SlotUploads>;
  mode: "user" | "admin";
  onRecoveryRestored: (options: RecoveryExportOptions) => void;
  resumeToken: string | null;
  setActiveGroup: Dispatch<SetStateAction<ThemeSlotGroup>>;
  setActiveSection: Dispatch<SetStateAction<ThemeSection>>;
  setActiveSystemTemplate: Dispatch<SetStateAction<ActiveSystemTemplate | null>>;
  setActiveUserTemplate: Dispatch<SetStateAction<ActiveUserTemplate | null>>;
  setInitialLoadState: Dispatch<SetStateAction<InitialLoadState>>;
  setNotice: Dispatch<SetStateAction<ProjectNotice | null>>;
  setPlatform: Dispatch<SetStateAction<ThemePlatform>>;
  setSelectedSlotId: Dispatch<SetStateAction<string | undefined>>;
  setSystemCreditCost: Dispatch<SetStateAction<string>>;
  setSystemDescription: Dispatch<SetStateAction<string>>;
  setSystemPriceAmount: Dispatch<SetStateAction<string>>;
  setSystemPricingType: Dispatch<SetStateAction<"free" | "paid" | "credit">>;
  setSystemStatus: Dispatch<SetStateAction<"draft" | "published" | "archived">>;
  setSystemTags: Dispatch<SetStateAction<string>>;
  setSystemTemplateBundleId: Dispatch<SetStateAction<string | null>>;
  setSystemTitle: Dispatch<SetStateAction<string>>;
  setSystemVisibility: Dispatch<SetStateAction<"private" | "public">>;
  setTemplateId: Dispatch<SetStateAction<ThemeTemplateId>>;
  replaceDraft: (draft: ThemeDraft) => void;
  skipDefaultSelectionReset: () => void;
};

export function useEditorBootstrap({
  hydratePreviewUploads,
  hydrateSystemTemplateUploads,
  mode,
  onRecoveryRestored,
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
}: UseEditorBootstrapOptions) {
  useEffect(() => {
    let active = true;
    const payload = takeTemplateStartPayload(mode);

    const loadStartedTemplate = async () => {
      if (resumeToken) {
        try {
          const recovery = await readRecoveryDraft(mode, resumeToken);
          if (!active) return;
          if (recovery) {
            setTemplateId(recovery.editor.templateId);
            setPlatform(recovery.editor.platform);
            setActiveSection(recovery.editor.activeSection);
            setActiveGroup(recovery.editor.activeGroup);
            setSelectedSlotId(recovery.editor.selectedSlotId);
            replaceDraft({ ...recovery.draft, bubbleGeometry: recovery.draft.bubbleGeometry ?? {}, bubbleDesigns: recovery.draft.bubbleDesigns ?? {}, bubbleDecorationSources: recovery.draft.bubbleDecorationSources ?? {} });
            setActiveUserTemplate(recovery.editor.activeUserTemplate ?? null);
            setActiveSystemTemplate(recovery.editor.activeSystemTemplate ?? null);
            setSystemTemplateBundleId(recovery.editor.systemTemplateBundleId ?? recovery.editor.activeSystemTemplate?.bundleId ?? null);
            if (recovery.editor.activeSystemTemplate) {
              const systemTemplate = recovery.editor.activeSystemTemplate;
              setSystemTitle(systemTemplate.title);
              setSystemDescription(systemTemplate.description ?? "");
              setSystemTags(systemTemplate.tags.join(", "));
              setSystemStatus(systemTemplate.status);
              setSystemVisibility(systemTemplate.visibility);
              setSystemPricingType(systemTemplate.pricingType);
              setSystemPriceAmount(systemTemplate.priceAmount ? String(systemTemplate.priceAmount) : "");
              setSystemCreditCost(systemTemplate.creditCost ? String(systemTemplate.creditCost) : "");
            }
            setInitialLoadState({ status: "ready" });
            setNotice({ tone: "success", message: "이전 내보내기 준비 작업을 복원했어요. 내용을 확인한 뒤 내보내세요." });
            onRecoveryRestored(recovery.exportOptions);
            return;
          }
        } catch (error) {
          console.error(error);
          if (!active) return;
          setNotice({ tone: "warning", message: "이전 내보내기 준비 작업을 복원하지 못했습니다. 현재 템플릿으로 계속할 수 있습니다." });
        }
      }

      if (!payload) {
        setInitialLoadState({ status: "ready" });
        return;
      }

      if (!resumeToken) void clearRecoveryDraft(mode).catch((error) => console.error(error));
      const requiresSystemTemplateLoad = Boolean(payload.systemTemplateId || (payload.sourceSystemTemplateId && payload.systemTemplateBundleId));
      setInitialLoadState(requiresSystemTemplateLoad ? createInitialLoadProgress("템플릿 정보를 확인하는 중입니다.", 0, 3) : { status: "ready" });
      setTemplateId(payload.templateId);
      setPlatform(payload.platform);
      setActiveSection("main");
      setActiveGroup("background");
      setSelectedSlotId(undefined);
      replaceDraft(createEmptyThemeDraft());
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

          skipDefaultSelectionReset();
          const normalizedOverrides = normalizeLegacyColorOverrides(savedTemplate.platform, savedTemplate.overrides.colors, savedTemplate.overrides.candidateSelections);
          setTemplateId(savedTemplate.baseTemplateId);
          setPlatform(payload.platform);
          const previewSlotIds = getInitialPreviewSlotIds(savedTemplate.platform, savedTemplate.overrides.uploadRefs);
          const progressTotal = Math.max(3, previewSlotIds.length + 2);
          setInitialLoadState(createInitialLoadProgress("미리보기 에셋을 준비하는 중입니다.", 1, progressTotal, previewSlotIds.length ? `${previewSlotIds.length}개 핵심 에셋을 불러옵니다.` : "저장된 색상과 기본 에셋으로 미리보기를 준비합니다."));
          const previewUploads = await hydratePreviewUploads(savedTemplate.overrides.uploadRefs, previewSlotIds, (completed, total) => {
            if (!active) return;
            setInitialLoadState(createInitialLoadProgress("미리보기 에셋을 준비하는 중입니다.", 1 + completed, Math.max(3, total + 2), `${completed}/${total}개 에셋 완료`));
          });
          if (!active) return;
          setInitialLoadState(createInitialLoadProgress("편집 화면을 구성하는 중입니다.", progressTotal - 1, progressTotal));
          replaceDraft({
            uploads: previewUploads,
            remoteUploadRefs: savedTemplate.overrides.uploadRefs,
            colors: normalizedOverrides.colors,
            candidateSelections: normalizedOverrides.candidateSelections,
            bubbleGeometry: savedTemplate.overrides.bubbleEdits.geometry ?? {},
            bubbleMarkers: savedTemplate.overrides.bubbleEdits.markers,
            bubbleInsets: savedTemplate.overrides.bubbleEdits.insets,
            bubbleStretch: savedTemplate.overrides.bubbleEdits.stretch,
            bubbleDesigns: savedTemplate.overrides.bubbleEdits.designs ?? {},
            bubbleDecorationSources: {},
          });
          setActiveSystemTemplate({ id: savedTemplate.id, bundleId: savedTemplate.bundleId ?? savedTemplate.id, title: savedTemplate.title, description: savedTemplate.description, tags: savedTemplate.tags, status: savedTemplate.status, visibility: savedTemplate.visibility, pricingType: savedTemplate.pricingType, priceAmount: savedTemplate.priceAmount, creditCost: savedTemplate.creditCost, createdAt: savedTemplate.createdAt });
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
          const converted = convertSystemTemplateOverridesByRole({ sourceOverrides: sourceTemplate.overrides, sourceSlots: getThemeSlots(sourceTemplate.platform), targetSlots: getThemeSlots(payload.platform), templateId: sourceTemplate.baseTemplateId, template: baseTemplate });
          skipDefaultSelectionReset();
          setTemplateId(sourceTemplate.baseTemplateId);
          setPlatform(payload.platform);
          const normalizedOverrides = normalizeLegacyColorOverrides(payload.platform, converted.colors, converted.candidateSelections);
          replaceDraft({
            uploads: converted.uploads,
            remoteUploadRefs: {},
            colors: normalizedOverrides.colors,
            candidateSelections: normalizedOverrides.candidateSelections,
            bubbleGeometry: converted.bubbleEdits.geometry ?? {},
            bubbleMarkers: converted.bubbleEdits.markers,
            bubbleInsets: converted.bubbleEdits.insets,
            bubbleStretch: converted.bubbleEdits.stretch,
            bubbleDesigns: converted.bubbleEdits.designs ?? {},
            bubbleDecorationSources: {},
          });
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

        skipDefaultSelectionReset();
        const normalizedOverrides = normalizeLegacyColorOverrides(savedTemplate.platform, savedTemplate.colors, savedTemplate.candidateSelections);
        setTemplateId(savedTemplate.templateId);
        setPlatform(savedTemplate.platform);
        replaceDraft({
          uploads: savedTemplate.uploads,
          remoteUploadRefs: {},
          colors: normalizedOverrides.colors,
          candidateSelections: normalizedOverrides.candidateSelections,
          bubbleGeometry: savedTemplate.bubbleEdits.geometry ?? {},
          bubbleMarkers: savedTemplate.bubbleEdits.markers,
          bubbleInsets: savedTemplate.bubbleEdits.insets,
          bubbleStretch: savedTemplate.bubbleEdits.stretch,
          bubbleDesigns: savedTemplate.bubbleDesigns ?? {},
          bubbleDecorationSources: savedTemplate.bubbleDecorationSources ?? {},
        });
        setActiveUserTemplate({ id: savedTemplate.id, name: savedTemplate.name, createdAt: savedTemplate.createdAt });
        setNotice({ tone: "success", message: `${savedTemplate.name} 템플릿을 불러왔습니다.` });
      } catch (error) {
        console.error(error);
        setNotice({ tone: "error", message: "저장한 템플릿을 불러오는 중 오류가 발생했습니다." });
      }
    };

    void loadStartedTemplate();
    return () => { active = false; };
  }, [
    hydratePreviewUploads, hydrateSystemTemplateUploads, mode, onRecoveryRestored, resumeToken, setActiveGroup, setActiveSection,
    setActiveSystemTemplate, setActiveUserTemplate, setInitialLoadState, setNotice, setPlatform,
    setSelectedSlotId, setSystemCreditCost, setSystemDescription, setSystemPriceAmount, setSystemPricingType,
    setSystemStatus, setSystemTags, setSystemTemplateBundleId, setSystemTitle, setSystemVisibility, setTemplateId,
    replaceDraft, skipDefaultSelectionReset,
  ]);
}

function createInitialLoadProgress(message: string, current: number, total: number, detail?: string): InitialLoadState {
  return { status: "loading", message, detail, current, total };
}

function getInitialPreviewSlotIds(platform: ThemePlatform, uploadRefs: RemoteSlotUploads) {
  const slots = getThemeSlots(platform);
  const roleOrder: ThemeResourceRole[] = ["chat_background", "main_background", "tab_background_image", "bubble_me_1", "bubble_you_1", "profile_image_1"];
  return roleOrder.map((role) => slots.find((slot) => slot.role === role)?.id).filter((slotId): slotId is string => Boolean(slotId && uploadRefs[slotId]?.length));
}
