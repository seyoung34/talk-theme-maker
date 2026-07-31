"use client";

import { useCallback, useReducer, useRef, type Dispatch, type SetStateAction } from "react";
import { getMissingRemoteUploadSlotIds, keepCurrentRemoteUploads, mergeSlotUploads } from "@/components/project/projectImporterHelpers";
import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/components/project/projectModel";
import { systemTemplateRepository, type RemoteSlotUploads } from "@/lib/theme/systemTemplates";
// 초안의 형태 자체는 지속·내보내기 계약이라 lib/theme/project가 소유한다.
// 이 파일은 그 형태를 다루는 React 상태 기계만 담당한다.
import { createEmptyThemeDraft, type ThemeDraft } from "@/lib/theme/project/draft";

type DraftUpdater<T> = SetStateAction<T>;

function omitSlotValue<T>(values: Partial<Record<string, T>>, slotId: string) {
  if (!(slotId in values)) return values;
  const next = { ...values };
  delete next[slotId];
  return next;
}

export type ThemeDraftAction =
  | { type: "replace"; draft: ThemeDraft }
  | { type: "set-uploads"; updater: DraftUpdater<SlotUploads> }
  | { type: "set-remote-upload-refs"; updater: DraftUpdater<RemoteSlotUploads> }
  | { type: "set-colors"; updater: DraftUpdater<SlotColors> }
  | { type: "set-candidate-selections"; updater: DraftUpdater<SlotCandidateSelections> }
  | { type: "set-bubble-geometry"; updater: DraftUpdater<ThemeDraft["bubbleGeometry"]> }
  | { type: "set-bubble-markers"; updater: DraftUpdater<ThemeDraft["bubbleMarkers"]> }
  | { type: "set-bubble-insets"; updater: DraftUpdater<ThemeDraft["bubbleInsets"]> }
  | { type: "set-bubble-stretch"; updater: DraftUpdater<ThemeDraft["bubbleStretch"]> }
  | { type: "set-bubble-designs"; updater: DraftUpdater<ThemeDraft["bubbleDesigns"]> }
  | { type: "set-bubble-decoration-sources"; updater: DraftUpdater<ThemeDraft["bubbleDecorationSources"]> };

export function themeDraftReducer(state: ThemeDraft, action: ThemeDraftAction): ThemeDraft {
  switch (action.type) {
    case "replace":
      return action.draft;
    case "set-uploads":
      return { ...state, uploads: resolveUpdate(state.uploads, action.updater) };
    case "set-remote-upload-refs":
      return { ...state, remoteUploadRefs: resolveUpdate(state.remoteUploadRefs, action.updater) };
    case "set-colors":
      return { ...state, colors: resolveUpdate(state.colors, action.updater) };
    case "set-candidate-selections":
      return { ...state, candidateSelections: resolveUpdate(state.candidateSelections, action.updater) };
    case "set-bubble-geometry":
      return { ...state, bubbleGeometry: resolveUpdate(state.bubbleGeometry, action.updater) };
    case "set-bubble-markers":
      return { ...state, bubbleMarkers: resolveUpdate(state.bubbleMarkers, action.updater) };
    case "set-bubble-insets":
      return { ...state, bubbleInsets: resolveUpdate(state.bubbleInsets, action.updater) };
    case "set-bubble-stretch":
      return { ...state, bubbleStretch: resolveUpdate(state.bubbleStretch, action.updater) };
    case "set-bubble-designs":
      return { ...state, bubbleDesigns: resolveUpdate(state.bubbleDesigns, action.updater) };
    case "set-bubble-decoration-sources":
      return { ...state, bubbleDecorationSources: resolveUpdate(state.bubbleDecorationSources, action.updater) };
  }
}

function resolveUpdate<T>(current: T, updater: DraftUpdater<T>) {
  return typeof updater === "function" ? (updater as (value: T) => T)(current) : updater;
}

export function useThemeDraft(initialDraft: ThemeDraft = createEmptyThemeDraft()) {
  const [draft, dispatch] = useReducer(themeDraftReducer, initialDraft);
  const draftRef = useRef(draft);
  const dispatchDraft = useCallback((action: ThemeDraftAction) => {
    draftRef.current = themeDraftReducer(draftRef.current, action);
    dispatch(action);
  }, []);

  const replaceDraft = useCallback((nextDraft: ThemeDraft) => {
    dispatchDraft({ type: "replace", draft: nextDraft });
  }, [dispatchDraft]);

  const setUploads = useCallback<Dispatch<SetStateAction<SlotUploads>>>((updater) => {
    dispatchDraft({ type: "set-uploads", updater });
  }, [dispatchDraft]);
  const setRemoteUploadRefs = useCallback<Dispatch<SetStateAction<RemoteSlotUploads>>>((updater) => {
    dispatchDraft({ type: "set-remote-upload-refs", updater });
  }, [dispatchDraft]);
  const setColors = useCallback<Dispatch<SetStateAction<SlotColors>>>((updater) => {
    dispatchDraft({ type: "set-colors", updater });
  }, [dispatchDraft]);
  const setCandidateSelections = useCallback<Dispatch<SetStateAction<SlotCandidateSelections>>>((updater) => {
    dispatchDraft({ type: "set-candidate-selections", updater });
  }, [dispatchDraft]);
  const setBubbleGeometry = useCallback<Dispatch<SetStateAction<ThemeDraft["bubbleGeometry"]>>>((updater) => {
    dispatchDraft({ type: "set-bubble-geometry", updater });
  }, [dispatchDraft]);
  const setBubbleMarkers = useCallback<Dispatch<SetStateAction<ThemeDraft["bubbleMarkers"]>>>((updater) => {
    dispatchDraft({ type: "set-bubble-markers", updater });
  }, [dispatchDraft]);
  const setBubbleInsets = useCallback<Dispatch<SetStateAction<ThemeDraft["bubbleInsets"]>>>((updater) => {
    dispatchDraft({ type: "set-bubble-insets", updater });
  }, [dispatchDraft]);
  const setBubbleStretch = useCallback<Dispatch<SetStateAction<ThemeDraft["bubbleStretch"]>>>((updater) => {
    dispatchDraft({ type: "set-bubble-stretch", updater });
  }, [dispatchDraft]);
  const setBubbleDesigns = useCallback<Dispatch<SetStateAction<ThemeDraft["bubbleDesigns"]>>>((updater) => {
    dispatchDraft({ type: "set-bubble-designs", updater });
  }, [dispatchDraft]);
  /**
   * 슬롯의 말풍선 편집값을 모두 버린다.
   *
   * geometry/markers/insets/stretch는 그 슬롯에 있던 그림의 픽셀 좌표다. 새 이미지를
   * 올리면 좌표가 가리키던 대상이 사라지므로, 남겨두면 편집창이 엉뚱한 위치를 복원한다.
   * 값을 비워야 이미지 크기에 맞춘 가운데 기본값이 다시 계산된다.
   */
  const clearBubbleEdits = useCallback((slotId: string) => {
    setBubbleGeometry((current) => omitSlotValue(current, slotId));
    setBubbleMarkers((current) => omitSlotValue(current, slotId));
    setBubbleInsets((current) => omitSlotValue(current, slotId));
    setBubbleStretch((current) => omitSlotValue(current, slotId));
  }, [setBubbleGeometry, setBubbleInsets, setBubbleMarkers, setBubbleStretch]);
  const setBubbleDecorationSources = useCallback<Dispatch<SetStateAction<ThemeDraft["bubbleDecorationSources"]>>>((updater) => {
    dispatchDraft({ type: "set-bubble-decoration-sources", updater });
  }, [dispatchDraft]);

  const hydrateSystemTemplateUploads = useCallback(async (uploadRefs: RemoteSlotUploads = draftRef.current.remoteUploadRefs, slotIds?: string[]) => {
    const currentDraft = draftRef.current;
    const targetSlotIds = getMissingRemoteUploadSlotIds(uploadRefs, currentDraft.uploads, slotIds);
    if (!targetSlotIds.length) return currentDraft.uploads;

    const hydrated = keepCurrentRemoteUploads(await systemTemplateRepository.hydrateUploads(uploadRefs, targetSlotIds), draftRef.current.remoteUploadRefs);
    let nextUploads = draftRef.current.uploads;
    setUploads((current) => {
      nextUploads = mergeSlotUploads(current, hydrated);
      return nextUploads;
    });
    return nextUploads;
  }, [setUploads]);

  const ensureSystemTemplateUploadsHydrated = useCallback(() => hydrateSystemTemplateUploads(), [hydrateSystemTemplateUploads]);
  const hydratePreviewUploads = useCallback(async (uploadRefs: RemoteSlotUploads, slotIds: string[], onProgress: (completed: number, total: number) => void) => {
    if (slotIds.length === 0) return {};

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
  }, []);

  return {
    clearBubbleEdits,
    draft,
    ensureSystemTemplateUploadsHydrated,
    hydratePreviewUploads,
    hydrateSystemTemplateUploads,
    replaceDraft,
    setBubbleGeometry,
    setBubbleInsets,
    setBubbleMarkers,
    setBubbleStretch,
    setBubbleDesigns,
    setBubbleDecorationSources,
    setCandidateSelections,
    setColors,
    setRemoteUploadRefs,
    setUploads,
  };
}
