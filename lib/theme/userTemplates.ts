import type { SlotCandidateSelections, SlotColors, SlotUploadEntry, SlotUploadSource, SlotUploads } from "@/lib/theme/project/state";
import { normalizeThemeTemplateId, type ThemeTemplateId } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";
import { themeDatabaseStores, withThemeDatabaseStore } from "@/lib/theme/localDatabase";
import type { BubbleDecorationSources, BubbleDesigns } from "@/lib/theme/bubbleBuilder";

const storeName = themeDatabaseStores.userTemplates;

export type UserTemplateBubbleEdits = {
  markers: Partial<Record<string, Markers>>;
  insets: Partial<Record<string, Insets>>;
  stretch: Partial<Record<string, StretchPoint>>;
};

export type UserTemplateRecord = {
  id: string;
  name: string;
  templateId: ThemeTemplateId;
  platform: ThemePlatform;
  createdAt: number;
  updatedAt: number;
  colors: SlotColors;
  uploads: SlotUploads;
  candidateSelections: SlotCandidateSelections;
  bubbleEdits: UserTemplateBubbleEdits;
  bubbleDesigns?: BubbleDesigns;
  bubbleDecorationSources?: BubbleDecorationSources;
};

export type UserTemplateSummary = Pick<UserTemplateRecord, "id" | "name" | "templateId" | "platform" | "createdAt" | "updatedAt"> & {
  uploadCount: number;
  colorCount: number;
};

export async function saveUserTemplate(record: Omit<UserTemplateRecord, "id" | "createdAt" | "updatedAt"> & Partial<Pick<UserTemplateRecord, "id" | "createdAt">>) {
  const now = Date.now();
  const next: UserTemplateRecord = {
    ...record,
    id: record.id ?? `user-template:${now}`,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
    uploads: normalizeIndexedDbOnlyUploads(record.uploads),
    bubbleDesigns: record.bubbleDesigns ?? {},
    bubbleDecorationSources: normalizeDecorationSources(record.bubbleDecorationSources),
  };

  await withThemeDatabaseStore(storeName, "readwrite", (store) => store.put(next));
  return next;
}

export async function getUserTemplate(id: string) {
  const record = await withThemeDatabaseStore<UserTemplateRecord | undefined>(storeName, "readonly", (store) => store.get(id));
  return record ? normalizeUserTemplateRecord(record) : null;
}

export async function listUserTemplates(): Promise<UserTemplateSummary[]> {
  const records = await withThemeDatabaseStore<UserTemplateRecord[]>(storeName, "readonly", (store) => store.getAll());
  return records
    .map(normalizeUserTemplateRecord)
    .map((record) => ({
      id: record.id,
      name: record.name,
      templateId: record.templateId,
      platform: record.platform,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      uploadCount: Object.values(record.uploads).reduce((count, entries) => count + (entries?.length ?? 0), 0),
      colorCount: Object.values(record.colors).filter(Boolean).length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeUserTemplateRecord(record: UserTemplateRecord): UserTemplateRecord {
  const templateId = normalizeThemeTemplateId(record.templateId);
  return {
    ...(templateId === record.templateId ? record : { ...record, templateId }),
    uploads: normalizeIndexedDbOnlyUploads(record.uploads),
    bubbleDesigns: record.bubbleDesigns ?? {},
    bubbleDecorationSources: normalizeDecorationSources(record.bubbleDecorationSources),
  };
}

export async function deleteUserTemplate(id: string) {
  await withThemeDatabaseStore<undefined>(storeName, "readwrite", (store) => store.delete(id));
}

function normalizeIndexedDbOnlyUploads(uploads: SlotUploads): SlotUploads {
  const next: SlotUploads = {};

  for (const [slotId, entries] of Object.entries(uploads)) {
    if (!entries?.length) continue;
    const normalizedEntries = entries
      .map((entry) => normalizeIndexedDbOnlyUploadEntry(entry))
      .filter((entry): entry is SlotUploadEntry => Boolean(entry));
    if (normalizedEntries.length) next[slotId] = normalizedEntries;
  }

  return next;
}

function normalizeIndexedDbOnlyUploadEntry(entry: SlotUploadEntry): SlotUploadEntry | null {
  if (!isFileLike(entry.file)) return null;

  const normalized: SlotUploadEntry = {
    id: entry.id,
    file: entry.file,
    ...(isSlotUploadSource(entry.source) ? { source: entry.source } : {}),
  };

  if (entry.imageEdit) {
    normalized.imageEdit = {
      originalName: entry.imageEdit.originalName,
      originalSize: entry.imageEdit.originalSize,
      ...(isFileLike(entry.imageEdit.originalFile) ? { originalFile: entry.imageEdit.originalFile } : {}),
      editedAt: entry.imageEdit.editedAt,
      state: entry.imageEdit.state,
      ...(entry.imageEdit.target ? { target: entry.imageEdit.target } : {}),
    };
  }

  return normalized;
}

function isSlotUploadSource(value: unknown): value is SlotUploadSource {
  return value === "user" || value === "template" || value === "admin";
}

function isFileLike(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function normalizeDecorationSources(sources: BubbleDecorationSources | undefined): BubbleDecorationSources {
  return Object.fromEntries(Object.entries(sources ?? {}).filter((entry): entry is [string, File] => isFileLike(entry[1])));
}
