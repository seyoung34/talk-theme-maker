import { normalizeSystemTemplateVisibility, type RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import { themeDatabaseStores, withThemeDatabaseStore } from "@/lib/theme/localDatabase";
import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/lib/theme/project/state";
import type { ThemeTemplateId } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";
import type { BubbleDecorationSources, BubbleDesigns } from "@/lib/theme/bubbleBuilder";

const recoveryTtlMs = 7 * 24 * 60 * 60 * 1000;

export type EditorMode = "user" | "admin";

export type RecoveryActiveUserTemplate = { id: string; name: string; createdAt: number };
export type RecoveryActiveSystemTemplate = {
  id: string;
  bundleId: string;
  title: string;
  description?: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  visibility: "private" | "public";
  pricingType: "free" | "paid" | "credit";
  priceAmount?: number;
  creditCost?: number;
  createdAt: number;
};

export type RecoveryExportMode = "project" | "apk" | "apk-zip" | "theme-zip" | "ktheme";
export type RecoveryExportOptions = { exportMode: RecoveryExportMode; name: string; versionName: string };

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
    bubbleMarkers: Partial<Record<string, Markers>>;
    bubbleInsets: Partial<Record<string, Insets>>;
    bubbleStretch: Partial<Record<string, StretchPoint>>;
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
