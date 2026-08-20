import { normalizeSystemTemplateVisibility, type RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import { stripVolatileUploadFields } from "@/lib/theme/project/state";
import { themeDatabaseStores, withThemeDatabaseStore } from "@/lib/theme/localDatabase";
import type { EditorActiveSystemTemplate, EditorActiveUserTemplate, EditorMode } from "@/lib/theme/project/draft";
import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/lib/theme/project/state";
import type { ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";
import type { BubbleDecorationSources, BubbleDesigns } from "@/lib/theme/bubbleBuilder";

const recoveryTtlMs = 7 * 24 * 60 * 60 * 1000;

// 편집 컨텍스트 형태는 자동 저장과 공유한다. 레코드·store·수명주기는 서로 분리하되,
// "무엇을 편집 중인가"를 표현하는 값 타입까지 각자 복제할 이유는 없다.
export type { EditorMode };
export type RecoveryActiveUserTemplate = EditorActiveUserTemplate;
export type RecoveryActiveSystemTemplate = EditorActiveSystemTemplate;

export type RecoveryExportMode = "project" | "apk" | "apk-zip" | "theme-zip" | "ktheme";
// 예전 초안에는 versionName이 함께 저장돼 있으나 더 이상 읽지 않는다. 남아 있어도 무시된다.
export type RecoveryExportOptions = { exportMode: RecoveryExportMode; name: string };

export type EditorRecoveryDraft = {
  id: `editor-recovery:${EditorMode}`;
  version: 1;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  resume: { reason: "login_required" | "insufficient_credits"; token: string; reopenExportDialog: true };
  editor: {
    mode: EditorMode;
    templateId: ThemeTemplateId;
    platform: ThemePlatform;
    activeUserTemplate?: RecoveryActiveUserTemplate;
    activeSystemTemplate?: RecoveryActiveSystemTemplate;
    systemTemplateBundleId?: string;
    activeSection: ThemeSection;
    activeGroup: ThemeSlotGroup;
    selectedSlotId?: string;
  };
  draft: {
    uploads: SlotUploads;
    remoteUploadRefs: RemoteSlotUploads;
    colors: SlotColors;
    candidateSelections: SlotCandidateSelections;
    bubbleGeometry?: Partial<Record<string, BubbleGeometry>>;
    bubbleMarkers: Partial<Record<string, Markers>>;
    bubbleInsets: Partial<Record<string, Insets>>;
    bubbleStretch: Partial<Record<string, StretchPoint>>;
    // 이 필드가 없는 기존 레코드는 반전이 없는 상태다. 복원 쪽에서 `{}`로 승격한다.
    bubbleFlipX?: Partial<Record<string, boolean>>;
    bubbleDesigns: BubbleDesigns;
    bubbleDecorationSources: BubbleDecorationSources;
  };
  exportOptions: RecoveryExportOptions;
};

type RecoveryDraftInput = Omit<EditorRecoveryDraft, "id" | "version" | "createdAt" | "updatedAt" | "expiresAt" | "resume"> & {
  resume: Pick<EditorRecoveryDraft["resume"], "reason">;
};

function recoveryId(mode: EditorMode): EditorRecoveryDraft["id"] {
  return `editor-recovery:${mode}`;
}

function createResumeToken() {
  return crypto.randomUUID();
}

export async function saveRecoveryDraft(input: RecoveryDraftInput) {
  const now = Date.now();
  const record: EditorRecoveryDraft = {
    ...input,
    // 만료되는 서명 URL은 저장하지 않는다. 복구 draft는 TTL이 7일이라 특히 오래 남는다.
    draft: { ...input.draft, uploads: stripVolatileUploadFields(input.draft.uploads) },
    id: recoveryId(input.editor.mode),
    version: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + recoveryTtlMs,
    resume: { ...input.resume, token: createResumeToken(), reopenExportDialog: true },
  };
  await withThemeDatabaseStore(themeDatabaseStores.editorRecoveryDrafts, "readwrite", (store) => store.put(record));
  return record;
}

export async function readRecoveryDraft(mode: EditorMode, token: string | null | undefined) {
  if (!token) return null;
  const record = await withThemeDatabaseStore<EditorRecoveryDraft | undefined>(themeDatabaseStores.editorRecoveryDrafts, "readonly", (store) => store.get(recoveryId(mode)));
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    await clearRecoveryDraft(mode);
    return null;
  }
  if (record.resume.token !== token) return null;
  const activeSystemTemplate = record.editor.activeSystemTemplate;
  if (!activeSystemTemplate) return record;
  return {
    ...record,
    editor: {
      ...record.editor,
      activeSystemTemplate: {
        ...activeSystemTemplate,
        visibility: normalizeSystemTemplateVisibility(activeSystemTemplate.visibility),
      },
    },
  };
}

export async function clearRecoveryDraft(mode: EditorMode) {
  await withThemeDatabaseStore<undefined>(themeDatabaseStores.editorRecoveryDrafts, "readwrite", (store) => store.delete(recoveryId(mode)));
}
