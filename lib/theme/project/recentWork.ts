import type { EditorAutosaveDraft } from "@/lib/theme/project/autosaveDraft";
import type { SlotUploads } from "@/lib/theme/project/state";
import type { UserTemplateRecord } from "@/lib/theme/userTemplates";

export function formatRecentWorkTemplateName(timestamp: number) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `자동저장-${month}${day}`;
}

/**
 * 최근 작업을 영구적인 내 템플릿 레코드로 바꾼다.
 *
 * 시스템 템플릿은 미리보기용 에셋만 메모리에 올라와 있을 수 있으므로 호출부가 나머지 원격 에셋을
 * hydrate해서 넘긴다. 같은 ID의 직접 편집 파일은 autosave 쪽을 우선해 사용자의 최신 변경을 보존한다.
 */
export function createRecentWorkUserTemplateInput(
  record: EditorAutosaveDraft,
  hydratedUploads: SlotUploads = {},
): Omit<UserTemplateRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    name: formatRecentWorkTemplateName(record.updatedAt),
    templateId: record.source.templateId,
    platform: record.source.platform,
    uploads: mergeSlotUploads(hydratedUploads, record.draft.uploads),
    colors: record.draft.colors,
    candidateSelections: record.draft.candidateSelections,
    bubbleEdits: {
      geometry: record.draft.bubbleGeometry,
      markers: record.draft.bubbleMarkers,
      insets: record.draft.bubbleInsets,
      stretch: record.draft.bubbleStretch,
    },
    bubbleDesigns: record.draft.bubbleDesigns,
    bubbleDecorationSources: record.draft.bubbleDecorationSources,
  };
}

function mergeSlotUploads(base: SlotUploads, overrides: SlotUploads): SlotUploads {
  const result: SlotUploads = { ...base };
  for (const [slotId, entries] of Object.entries(overrides)) {
    if (!entries?.length) continue;
    const byId = new Map((result[slotId] ?? []).map((entry) => [entry.id, entry]));
    for (const entry of entries) byId.set(entry.id, entry);
    result[slotId] = Array.from(byId.values());
  }
  return result;
}
