"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { persistEditorSession, takeTemplateStartPayload } from "@/components/project/editorSession";
import { clearAutosaveDraft, readAutosaveDraft, type EditorAutosaveDraft } from "@/lib/theme/project/autosaveDraft";
import type { ActiveSystemTemplate, ActiveUserTemplate, InitialLoadState, ProjectNotice } from "@/components/project/editorTypes";
import { createInitialThemeDraft, type ThemeDraft } from "@/lib/theme/project/draft";
import type { SlotUploads } from "@/components/project/projectModel";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import { systemTemplateRepository } from "@/lib/theme/systemTemplates";
import { tabIconPreviewRoles } from "@/lib/theme/systemTemplates/preview";
import { convertSystemTemplateOverridesByRole } from "@/lib/theme/systemTemplates/roleOverrides";
import { normalizeLegacyColorOverrides, normalizeLegacyThemeDraft } from "@/lib/theme/project/legacyOverrides";
import { clearRecoveryDraft, readRecoveryDraft, type RecoveryExportOptions } from "@/lib/theme/project/recoveryDraft";
import { getSelectedSharedSlotEntry } from "@/lib/theme/project/state";
import { getUserTemplate } from "@/lib/theme/userTemplates";
import { hydrateCatalogPreviewUrls } from "@/lib/theme/project/catalogPreviewHydration";
import { getThemeSlots, getThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

type UseEditorBootstrapOptions = {
  enabled?: boolean;
  hydratePreviewUploads: (uploadRefs: RemoteSlotUploads, slotIds: string[], onProgress: (completed: number, total: number) => void) => Promise<SlotUploads>;
  mode: "user" | "admin";
  onRecoveryRestored: (options: RecoveryExportOptions) => void;
  /** 자동 저장 초안이 있을 때 이어할지 사용자에게 묻는다. 답을 받기 전에는 부트스트랩이 진행되지 않는다. */
  requestAutosaveDecision: (record: EditorAutosaveDraft) => Promise<"resume" | "discard">;
  /** 시작 상태가 확정된 뒤 자동 저장을 켠다. 확정 전에 저장하면 사용자가 답하기 전에 레코드를 덮어쓴다. */
  onAutosaveArmed: (expectedUpdatedAt: number | null) => void;
  onAutosaveRestored: () => void;
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
  enabled = true,
  hydratePreviewUploads,
  mode,
  onRecoveryRestored,
  requestAutosaveDecision,
  onAutosaveArmed,
  onAutosaveRestored,
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
    if (!enabled) return;
    let active = true;
    const payload = takeTemplateStartPayload(mode);
    const resumedAfterReload = isPageReload();
    // 부트스트랩이 끝나고 자동 저장을 켤 때 넘길 기준선. 이어받은 경우에만 값이 생긴다.
    let autosaveExpectedUpdatedAt: number | null = null;
    let deferredReplacement = false;

    const applyAutosave = async (record: EditorAutosaveDraft) => {
      // 자동 저장은 만료되는 preview URL을 떼고 저장한다. 시스템 템플릿은 `remoteUploadRefs`로
      // 다시 수화되지만 일반 프로젝트에는 그 경로가 없어, 여기서 채우지 않으면 이어하기 직후
      // catalog 타일이 빈 채로 열린다.
      const uploads = await hydrateCatalogPreviewUrls(record.draft.uploads);
      skipDefaultSelectionReset();
      setTemplateId(record.source.templateId);
      setPlatform(record.source.platform);
      setActiveSection(record.editor.activeSection);
      setActiveGroup(record.editor.activeGroup);
      setSelectedSlotId(record.editor.selectedSlotId);
      replaceDraft(normalizeLegacyThemeDraft(record.source.platform, record.source.templateId, { ...record.draft, uploads }));
      setActiveUserTemplate(record.source.activeUserTemplate ?? null);
      setActiveSystemTemplate(record.source.activeSystemTemplate ?? null);
      setSystemTemplateBundleId(record.source.systemTemplateBundleId ?? record.source.activeSystemTemplate?.bundleId ?? null);
      const systemTemplate = record.source.activeSystemTemplate;
      if (systemTemplate) {
        setSystemTitle(systemTemplate.title);
        setSystemDescription(systemTemplate.description ?? "");
        setSystemTags(systemTemplate.tags.join(", "));
        setSystemStatus(systemTemplate.status);
        setSystemVisibility(systemTemplate.visibility);
        setSystemPricingType(systemTemplate.pricingType);
        setSystemPriceAmount(systemTemplate.priceAmount ? String(systemTemplate.priceAmount) : "");
        setSystemCreditCost(systemTemplate.creditCost ? String(systemTemplate.creditCost) : "");
      }
      // 저장 전 입력값이 남아 있으면 마지막으로 저장된 값보다 우선한다. 복원의 목적이 그쪽이다.
      const metadata = record.editor.systemTemplateMetadata;
      if (metadata) {
        setSystemTitle(metadata.title);
        setSystemDescription(metadata.description);
        setSystemTags(metadata.tags);
        setSystemStatus(metadata.status);
        setSystemVisibility(metadata.visibility);
        setSystemPricingType(metadata.pricingType);
        setSystemPriceAmount(metadata.priceAmount);
        setSystemCreditCost(metadata.creditCost);
      }
      // 다음 새로고침에서 자동 저장을 지웠더라도 같은 템플릿으로 돌아오게 한다.
      persistEditorSession(mode, {
        templateId: record.source.templateId,
        platform: record.source.platform,
        userTemplateId: record.source.activeUserTemplate?.id,
        systemTemplateId: record.source.activeSystemTemplate?.id,
        systemTemplateBundleId: record.source.systemTemplateBundleId ?? record.source.activeSystemTemplate?.bundleId,
        editMode: mode,
      });
      setInitialLoadState({ status: "ready" });
      setNotice({ tone: "success", message: "저장하지 않았던 편집 내용을 복원했어요." });
      onAutosaveRestored();
    };

    const loadStartedTemplate = async () => {
      if (resumeToken) {
        try {
          const recovery = await readRecoveryDraft(mode, resumeToken);
          if (!active) return;
          if (recovery) {
            // 복구 초안도 저장할 때 만료되는 preview URL을 떼어 낸다. 로그인·크레딧 처리를 거쳐
            // 내보내기를 재개하는 경로라 여기서 채우지 않으면 타일과 미리보기가 빈 채로 열린다.
            const recoveredUploads = await hydrateCatalogPreviewUrls(recovery.draft.uploads);
            if (!active) return;
            setTemplateId(recovery.editor.templateId);
            setPlatform(recovery.editor.platform);
            setActiveSection(recovery.editor.activeSection);
            setActiveGroup(recovery.editor.activeGroup);
            setSelectedSlotId(recovery.editor.selectedSlotId);
            replaceDraft(normalizeLegacyThemeDraft(recovery.editor.platform, recovery.editor.templateId, { ...recovery.draft, uploads: recoveredUploads }));
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
            // 복구 draft가 더 최신이므로 남아 있던 자동 저장 레코드는 낡은 상태다. 되살아나지 않게 지운다.
            await clearAutosaveDraft(mode).catch((clearError) => console.error(clearError));
            return;
          }
        } catch (error) {
          console.error(error);
          if (!active) return;
          setNotice({ tone: "warning", message: "이전 내보내기 준비 작업을 복원하지 못했습니다. 현재 템플릿으로 계속할 수 있습니다." });
        }
      }

      // 여기까지 왔다면 resumeToken 복구는 적용되지 않았다. 자동 저장 초안이 있으면 사용자에게 먼저 묻는다.
      // 묻기 전에 템플릿을 불러오면 이어하기를 골랐을 때 그 로딩이 통째로 낭비된다.
      const autosave = await readAutosaveDraft(mode).catch((error) => {
        console.error(error);
        return null;
      });
      if (!active) return;
      if (autosave) {
        // 편집 중 새로고침은 같은 작업을 계속하려는 의도가 명확하다. 이 경우에는
        // "새로 시작" 선택지를 보여 주지 않고 마지막 자동 저장 상태를 바로 복원한다.
        // 반면 새 탭·직접 /edit 진입은 의도를 알 수 없으므로 기존 확인 모달을 유지한다.
        // App Router의 페이지 이동은 문서를 새로 열지 않는다. 따라서 이전에 새로고침했던
        // navigation entry가 /template → /edit 이동 뒤에도 "reload"로 남아 있을 수 있다.
        // 새 템플릿을 명시적으로 고른 payload가 있으면 그 선택이 항상 자동 저장보다 우선한다.
        if (payload?.autosaveAction === "resume" || (!payload && resumedAfterReload)) {
          await applyAutosave(autosave);
          autosaveExpectedUpdatedAt = autosave.updatedAt;
          return;
        }
        if (payload?.autosaveAction === "replace") {
          // 갤러리에서 이미 새 템플릿 시작을 선택했다. 기존 레코드는 첫 실제 변경이 저장될 때
          // expectedUpdatedAt 조건으로 한 번에 교체하며, 아무것도 바꾸지 않고 나가면 그대로 둔다.
          autosaveExpectedUpdatedAt = autosave.updatedAt;
          deferredReplacement = true;
        } else {
          setInitialLoadState(createInitialLoadProgress("이전 편집 내용을 확인하는 중입니다.", 0, 1));
          const decision = await requestAutosaveDecision(autosave);
          if (!active) return;
          if (decision === "resume") {
            await applyAutosave(autosave);
            autosaveExpectedUpdatedAt = autosave.updatedAt;
            return;
          }
          await clearAutosaveDraft(mode).catch((error) => console.error(error));
          if (!active) return;
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
      const initialDraft = createInitialThemeDraft(payload.platform, payload.templateId);
      replaceDraft(initialDraft);
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
          const normalizedOverrides = normalizeLegacyColorOverrides(savedTemplate.platform, savedTemplate.overrides.colors, savedTemplate.overrides.candidateSelections, {
            templateId: savedTemplate.baseTemplateId,
            template: getThemeTemplate(savedTemplate.baseTemplateId),
            slots: getThemeSlots(savedTemplate.platform),
          });
          setTemplateId(savedTemplate.baseTemplateId);
          setPlatform(payload.platform);
          const previewSlotIds = getInitialPreviewSlotIds(
            savedTemplate.platform,
            savedTemplate.overrides.uploadRefs,
            normalizedOverrides.candidateSelections,
          );
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
            bubbleFlipX: savedTemplate.overrides.bubbleEdits.flipX ?? {},
            bubbleDesigns: savedTemplate.overrides.bubbleEdits.designs ?? {},
            bubbleDecorationSources: {},
          });
          setActiveSystemTemplate({ id: savedTemplate.id, bundleId: savedTemplate.bundleId ?? savedTemplate.id, title: savedTemplate.title, description: savedTemplate.description, tags: savedTemplate.tags, status: savedTemplate.status, visibility: savedTemplate.visibility, pricingType: savedTemplate.pricingType, priceAmount: savedTemplate.priceAmount, creditCost: savedTemplate.creditCost, createdAt: savedTemplate.createdAt });
          setNotice({ tone: "success", message: `${savedTemplate.title} 시스템 템플릿을 불러왔습니다.` });
          setInitialLoadState({ status: "ready" });
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
          const normalizedOverrides = normalizeLegacyColorOverrides(payload.platform, converted.colors, converted.candidateSelections, {
            templateId: sourceTemplate.baseTemplateId,
            template: baseTemplate,
            slots: getThemeSlots(payload.platform),
          });
          replaceDraft({
            uploads: converted.uploads,
            remoteUploadRefs: {},
            colors: normalizedOverrides.colors,
            candidateSelections: normalizedOverrides.candidateSelections,
            bubbleGeometry: converted.bubbleEdits.geometry ?? {},
            bubbleMarkers: converted.bubbleEdits.markers,
            bubbleInsets: converted.bubbleEdits.insets,
            bubbleStretch: converted.bubbleEdits.stretch,
            bubbleFlipX: converted.bubbleEdits.flipX ?? {},
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
        const normalizedOverrides = normalizeLegacyColorOverrides(savedTemplate.platform, savedTemplate.colors, savedTemplate.candidateSelections, {
          templateId: savedTemplate.templateId,
          template: getThemeTemplate(savedTemplate.templateId),
          slots: getThemeSlots(savedTemplate.platform),
        });
        setTemplateId(savedTemplate.templateId);
        setPlatform(savedTemplate.platform);
        // catalog 참조만 있는 항목은 저장 시 만료되는 preview URL을 떼어 낸다. 사용자 템플릿에는
        // 시스템 템플릿 같은 재수화 경로가 없으므로(`remoteUploadRefs`가 비어 있다) 여기서
        // `legacyStoragePath`를 다시 서명해 채운다. 없으면 타일과 미리보기가 빈 채로 열린다.
        const uploads = await hydrateCatalogPreviewUrls(savedTemplate.uploads);
        if (!active) return;
        replaceDraft({
          uploads,
          remoteUploadRefs: {},
          colors: normalizedOverrides.colors,
          candidateSelections: normalizedOverrides.candidateSelections,
          bubbleGeometry: savedTemplate.bubbleEdits.geometry ?? {},
          bubbleMarkers: savedTemplate.bubbleEdits.markers,
          bubbleInsets: savedTemplate.bubbleEdits.insets,
          bubbleStretch: savedTemplate.bubbleEdits.stretch,
          bubbleFlipX: savedTemplate.bubbleEdits.flipX ?? {},
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

    // 어떤 경로로 끝났든(성공·실패 모두) 시작 상태는 확정됐다. 그 시점의 초안을 기준선으로 자동 저장을 켠다.
    void loadStartedTemplate()
      .catch((error) => console.error(error))
      .finally(() => {
        if (active && deferredReplacement) {
          setNotice({ tone: "warning", message: "이 템플릿을 변경하면 기존 최근 작업이 새 작업으로 교체됩니다." });
        }
        if (active) onAutosaveArmed(autosaveExpectedUpdatedAt);
      });
    return () => { active = false; };
  }, [
    enabled, hydratePreviewUploads, mode, onAutosaveArmed, onAutosaveRestored, onRecoveryRestored,
    requestAutosaveDecision, resumeToken, setActiveGroup, setActiveSection,
    setActiveSystemTemplate, setActiveUserTemplate, setInitialLoadState, setNotice, setPlatform,
    setSelectedSlotId, setSystemCreditCost, setSystemDescription, setSystemPriceAmount, setSystemPricingType,
    setSystemStatus, setSystemTags, setSystemTemplateBundleId, setSystemTitle, setSystemVisibility, setTemplateId,
    replaceDraft, skipDefaultSelectionReset,
  ]);
}

function isPageReload() {
  if (typeof performance === "undefined") return false;
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type === "reload";
}

function createInitialLoadProgress(message: string, current: number, total: number, detail?: string): InitialLoadState {
  return { status: "loading", message, detail, current, total };
}

/**
 * 편집기를 열기 전에 받아 둘 슬롯. 순서가 곧 우선순위다.
 *
 * 탭 아이콘도 포함한다. 편집기는 친구 화면으로 열리고 그 화면 하단에 탭 바가 그대로 보이므로,
 * 아이콘이 늦게 오면 사용자는 시스템 템플릿이 아니라 기본 아이콘을 첫인상으로 본다. 갤러리 모달은
 * 같은 아이콘을 일부러 뒤로 미루지만(잠깐 보고 닫는 화면이라), 편집기의 첫 화면은 "이 템플릿이
 * 이렇게 생겼다"는 판단 자체가 된다.
 *
 * 공유 그룹 전체를 받지 않는다. 선택 ID는 원격 ref만으로 owner를 찾을 수 있으므로 그 bucket만
 * hydration한다. 선택이 없는 옛 레코드는 프리뷰 해석과 동일하게 자기 bucket의 첫 파일을 쓴다.
 */
export function getInitialPreviewSlotIds(
  platform: ThemePlatform,
  uploadRefs: RemoteSlotUploads,
  candidateSelections: Record<string, string | undefined>,
) {
  const slots = getThemeSlots(platform);
  const roleOrder: ThemeResourceRole[] = [
    "chat_background",
    "main_background",
    "tab_background_image",
    "bubble_me_1",
    "bubble_you_1",
    // 연속 메시지 말풍선(`_2`)도 첫 화면 대상이다. 채팅방 프리뷰의 표본 대화 6개 중 4개가 이
    // 역할을 쓰기 때문에, 빼면 말풍선 그룹을 눌러 on-demand hydration이 돌기 전까지 그 4개만
    // 기본 말풍선으로 남는다 — 사용자에게는 "일부만 반영이 안 된다"로 보인다.
    // 대개 `_1`과 같은 업로드를 선택하므로 owner bucket이 겹쳐 Set에서 합쳐지고, 실제로 늘어나는
    // 요청은 `_2`에 다른 이미지를 쓴 템플릿뿐이다.
    "bubble_me_2",
    "bubble_you_2",
    "profile_image_1",
    ...tabIconPreviewRoles,
  ];
  const slotIds = roleOrder.flatMap((role) => {
    const slot = slots.find((candidate) => candidate.role === role);
    if (!slot) return [];
    const selected = getSelectedSharedSlotEntry(slot, uploadRefs, candidateSelections, slots);
    if (selected) return [selected.ownerSlotId];
    return uploadRefs[slot.id]?.length ? [slot.id] : [];
  });
  return Array.from(new Set(slotIds));
}
