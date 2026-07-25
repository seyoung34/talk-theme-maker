import type { SystemTemplateRepository } from "@/lib/theme/systemTemplates/repository";
import { normalizeSystemTemplateVisibility, type RemoteSlotUploads, type SystemTemplateMetadataRecord, type SystemTemplateRecord, type SystemTemplateSaveInput, type SystemTemplateSummary } from "@/lib/theme/systemTemplates/types";
import { themeDatabaseStores, withThemeDatabaseStore } from "@/lib/theme/localDatabase";

const storeName = themeDatabaseStores.systemTemplates;

export const localSystemTemplateRepository: SystemTemplateRepository = {
  async list() {
    const records = await withThemeDatabaseStore<SystemTemplateRecord[]>(storeName, "readonly", (store) => store.getAll());
    return records.map(toSummary).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async listPage(options = {}) {
    const records = (await withThemeDatabaseStore<SystemTemplateRecord[]>(storeName, "readonly", (store) => store.getAll()))
      .filter((record) => !options.publicOnly || (record.status === "published" && record.visibility === "public"))
      .map(toSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const start = Math.max(0, Number(options.cursor) || 0);
    const limit = Math.min(30, Math.max(1, options.limit ?? 12));
    const items = records.slice(start, start + limit);
    return { items, nextCursor: start + limit < records.length ? String(start + limit) : undefined };
  },

  async getMetadata(id: string) {
    const record = await withThemeDatabaseStore<SystemTemplateRecord | undefined>(storeName, "readonly", (store) => store.get(id));
    return record ? toMetadataRecord(record) : null;
  },

  async get(id: string) {
    const record = await withThemeDatabaseStore<SystemTemplateRecord | undefined>(storeName, "readonly", (store) => store.get(id));
    return record ? { ...record, visibility: normalizeSystemTemplateVisibility(record.visibility) } : null;
  },

  async hydrateUploads(uploadRefs: RemoteSlotUploads) {
    void uploadRefs;
    return {};
  },

  async save(input: SystemTemplateSaveInput) {
    const now = Date.now();
    const record: SystemTemplateRecord = {
      ...input,
      id: input.id ?? `system-template:${now}:${Math.random().toString(36).slice(2, 8)}`,
      bundleId: input.bundleId ?? input.id ?? `system-template-bundle:${now}:${Math.random().toString(36).slice(2, 8)}`,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    await withThemeDatabaseStore(storeName, "readwrite", (store) => store.put(record));
    return record;
  },

  async updatePublication(bundleId, input) {
    const records = await withThemeDatabaseStore<SystemTemplateRecord[]>(storeName, "readonly", (store) => store.getAll());
    const now = Date.now();
    let updated = false;
    for (const record of records) {
      if ((record.bundleId ?? record.id) !== bundleId) continue;
      await withThemeDatabaseStore(storeName, "readwrite", (store) => store.put({
        ...record,
        status: input.status,
        visibility: input.visibility,
        updatedAt: now,
      }));
      updated = true;
    }
    if (!updated) throw new Error("System template bundle was not updated.");
  },

  async updateTags(bundleId, tags) {
    const records = await withThemeDatabaseStore<SystemTemplateRecord[]>(storeName, "readonly", (store) => store.getAll());
    const now = Date.now();
    let updated = false;
    for (const record of records) {
      if ((record.bundleId ?? record.id) !== bundleId) continue;
      await withThemeDatabaseStore(storeName, "readwrite", (store) => store.put({
        ...record,
        tags,
        updatedAt: now,
      }));
      updated = true;
    }
    if (!updated) throw new Error("System template bundle tags were not updated.");
  },

  async regeneratePreviewMetadata() {
    // 로컬(dev) 저장소는 previewMetadata를 별도 보관하지 않으므로 재계산이 필요 없다.
  },

  async delete(id: string) {
    await withThemeDatabaseStore<undefined>(storeName, "readwrite", (store) => store.delete(id));
  },
};

function toSummary(record: SystemTemplateRecord): SystemTemplateSummary {
  return {
    id: record.id,
    bundleId: record.bundleId ?? record.id,
    title: record.title,
    description: record.description,
    baseTemplateId: record.baseTemplateId,
    platform: record.platform,
    status: record.status,
    visibility: normalizeSystemTemplateVisibility(record.visibility),
    pricingType: record.pricingType,
    priceAmount: record.priceAmount,
    creditCost: record.creditCost,
    tags: record.tags,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    uploadCount: Object.values(record.overrides.uploads).reduce((count, entries) => count + (entries?.length ?? 0), 0),
    colorCount: Object.values(record.overrides.colors).filter(Boolean).length,
    colors: record.overrides.colors,
    candidateSelections: record.overrides.candidateSelections,
    uploadRefs: {},
    previewMetadata: { colors: {}, refs: {} },
  };
}

function toMetadataRecord(record: SystemTemplateRecord): SystemTemplateMetadataRecord {
  return {
    ...record,
    visibility: normalizeSystemTemplateVisibility(record.visibility),
    overrides: {
      ...record.overrides,
      uploadRefs: {},
    },
  };
}
