"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { takeTemplateStartPayload } from "@/components/project/editorSession";
import type { ActiveSystemTemplate, ActiveUserTemplate, InitialLoadState, ProjectNotice } from "@/components/project/editorTypes";
import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/components/project/projectModel";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import { systemTemplateRepository } from "@/lib/theme/systemTemplates";
import { convertSystemTemplateOverridesByRole } from "@/lib/theme/systemTemplates/roleOverrides";
import { normalizeLegacyColorOverrides } from "@/lib/theme/project/legacyOverrides";
import { getUserTemplate } from "@/lib/theme/userTemplates";
import { getThemeSlots, getThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

type UseEditorBootstrapOptions = {
  hydratePreviewUploads: (uploadRefs: RemoteSlotUploads, slotIds: string[], onProgress: (completed: number, total: number) => void) => Promise<SlotUploads>;
  hydrateSystemTemplateUploads: (uploadRefs: RemoteSlotUploads) => Promise<SlotUploads>;
  mode: "user" | "admin";
  remoteUploadRefsRef: MutableRefObject<RemoteSlotUploads>;
  setActiveGroup: Dispatch<SetStateAction<ThemeSlotGroup>>;
  setActiveSection: Dispatch<SetStateAction<ThemeSection>>;
  setActiveSystemTemplate: Dispatch<SetStateAction<ActiveSystemTemplate | null>>;
  setActiveUserTemplate: Dispatch<SetStateAction<ActiveUserTemplate | null>>;
  setBubbleInsets: Dispatch<SetStateAction<Partial<Record<string, Insets>>>>;
  setBubbleMarkers: Dispatch<SetStateAction<Partial<Record<string, Markers>>>>;
  setBubbleStretch: Dispatch<SetStateAction<Partial<Record<string, StretchPoint>>>>;
  setCandidateSelections: Dispatch<SetStateAction<SlotCandidateSelections>>;
  setColors: Dispatch<SetStateAction<SlotColors>>;
  setInitialLoadState: Dispatch<SetStateAction<InitialLoadState>>;
  setNotice: Dispatch<SetStateAction<ProjectNotice | null>>;
  setPlatform: Dispatch<SetStateAction<ThemePlatform>>;
  setRemoteUploadRefs: Dispatch<SetStateAction<RemoteSlotUploads>>;
  setSelectedSlotId: Dispatch<SetStateAction<string | undefined>>;
  setSystemCreditCost: Dispatch<SetStateAction<string>>;
  setSystemDescription: Dispatch<SetStateAction<string>>;
  setSystemPriceAmount: Dispatch<SetStateAction<string>>;
  setSystemPricingType: Dispatch<SetStateAction<"free" | "paid" | "credit">>;
  setSystemStatus: Dispatch<SetStateAction<"draft" | "published" | "archived">>;
  setSystemTags: Dispatch<SetStateAction<string>>;
  setSystemTemplateBundleId: Dispatch<SetStateAction<string | null>>;
  setSystemTitle: Dispatch<SetStateAction<string>>;
  setSystemVisibility: Dispatch<SetStateAction<"private" | "public" | "unlisted">>;
  setTemplateId: Dispatch<SetStateAction<ThemeTemplateId>>;
  setUploads: Dispatch<SetStateAction<SlotUploads>>;
  skipDefaultSelectionResetRef: MutableRefObject<boolean>;
};

export function useEditorBootstrap({
  hydratePreviewUploads,
  hydrateSystemTemplateUploads,
  mode,
  remoteUploadRefsRef,
  setActiveGroup,
  setActiveSection,
  setActiveSystemTemplate,
  setActiveUserTemplate,
  setBubbleInsets,
  setBubbleMarkers,
  setBubbleStretch,
  setCandidateSelections,
  setColors,
  setInitialLoadState,
  setNotice,
  setPlatform,
  setRemoteUploadRefs,
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
  setUploads,
  skipDefaultSelectionResetRef,
}: UseEditorBootstrapOptions) {
  useEffect(() => {
    let active = true;
    const payload = takeTemplateStartPayload(mode);
    if (!payload) {
      setInitialLoadState({ status: "ready" });
      return () => { active = false; };
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
          setInitialLoadState(createInitialLoadProgress("미리보기 에셋을 준비하는 중입니다.", 1, progressTotal, previewSlotIds.length ? `${previewSlotIds.length}개 핵심 에셋을 불러옵니다.` : "저장된 색상과 기본 에셋으로 미리보기를 준비합니다."));
          const previewUploads = await hydratePreviewUploads(savedTemplate.overrides.uploadRefs, previewSlotIds, (completed, total) => {
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
    return () => { active = false; };
  }, [
    hydratePreviewUploads, hydrateSystemTemplateUploads, mode, remoteUploadRefsRef, setActiveGroup, setActiveSection,
    setActiveSystemTemplate, setActiveUserTemplate, setBubbleInsets, setBubbleMarkers, setBubbleStretch,
    setCandidateSelections, setColors, setInitialLoadState, setNotice, setPlatform, setRemoteUploadRefs,
    setSelectedSlotId, setSystemCreditCost, setSystemDescription, setSystemPriceAmount, setSystemPricingType,
    setSystemStatus, setSystemTags, setSystemTemplateBundleId, setSystemTitle, setSystemVisibility, setTemplateId,
    setUploads, skipDefaultSelectionResetRef,
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
