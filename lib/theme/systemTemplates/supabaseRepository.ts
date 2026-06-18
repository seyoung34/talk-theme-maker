import { createClient } from "@/lib/supabase/client";
import { sanitizeStoragePathPart, storagePathToFile, themeAssetsBucketName } from "@/lib/theme/remoteAssets";
import { getResolvedColor } from "@/lib/theme/project/state";
import type { SlotCandidateSelections, SlotUploads } from "@/lib/theme/project/state";
import type { SystemTemplateRepository } from "@/lib/theme/systemTemplates/repository";
import type { RemoteSlotUploads, SystemTemplateMetadataRecord, SystemTemplatePreviewMetadata, SystemTemplateRecord, SystemTemplateSaveInput, SystemTemplateSummary, ThemeEditOverrides } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, getThemeTemplate, type ThemeAssetSlot, type ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

type BundleRow = {
  id: string;
  title: string;
  description?: string | null;
  status: SystemTemplateRecord["status"];
  visibility: SystemTemplateRecord["visibility"];
  pricing_type: SystemTemplateRecord["pricingType"];
  price_amount?: number | null;
  credit_cost?: number | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type VariantRow = {
  id: string;
  bundle_id: string;
  platform: ThemePlatform;
  base_template_id: SystemTemplateRecord["baseTemplateId"];
  colors: ThemeEditOverrides["colors"];
  candidate_selections: ThemeEditOverrides["candidateSelections"];
  bubble_edits: ThemeEditOverrides["bubbleEdits"];
  upload_refs: RemoteSlotUploads;
  preview_metadata?: SystemTemplatePreviewMetadata | null;
  created_at: string;
  updated_at: string;
  system_template_bundles?: BundleRow | BundleRow[] | null;
};

export const systemTemplateRepository: SystemTemplateRepository = {
  async list() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("system_template_variants")
      .select(
        "id,bundle_id,platform,base_template_id,colors,candidate_selections,upload_refs,preview_metadata,created_at,updated_at,system_template_bundles!inner(id,title,description,status,visibility,pricing_type,price_amount,credit_cost,tags,created_at,updated_at)",
      )
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => toSummary(row as unknown as VariantRow));
  },

  async getMetadata(id) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("system_template_variants")
      .select(
        "id,bundle_id,platform,base_template_id,colors,candidate_selections,bubble_edits,upload_refs,preview_metadata,created_at,updated_at,system_template_bundles!inner(id,title,description,status,visibility,pricing_type,price_amount,credit_cost,tags,created_at,updated_at)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toMetadataRecord(data as unknown as VariantRow) : null;
  },

  async get(id) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("system_template_variants")
      .select(
        "id,bundle_id,platform,base_template_id,colors,candidate_selections,bubble_edits,upload_refs,preview_metadata,created_at,updated_at,system_template_bundles!inner(id,title,description,status,visibility,pricing_type,price_amount,credit_cost,tags,created_at,updated_at)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toRecord(data as unknown as VariantRow) : null;
  },

  hydrateUploads(uploadRefs, slotIds) {
    return remoteUploadsToSlotUploads(uploadRefs, slotIds);
  },

  async save(input) {
    const supabase = createClient();
    const now = Date.now();
    const bundleId = input.bundleId && isUuid(input.bundleId) ? input.bundleId : undefined;
    const variantId = input.id && isUuid(input.id) ? input.id : undefined;

    const { data: userData } = await supabase.auth.getUser();
    const bundlePayload = {
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      visibility: input.visibility,
      pricing_type: input.pricingType,
      price_amount: input.priceAmount ?? null,
      credit_cost: input.creditCost ?? null,
      tags: input.tags,
      created_by: userData.user?.id ?? null,
    };

    const { data: bundle, error: bundleError } = bundleId
      ? await supabase.from("system_template_bundles").update(bundlePayload).eq("id", bundleId).select("*").single()
      : await supabase.from("system_template_bundles").insert(bundlePayload).select("*").single();
    if (bundleError) throw bundleError;

    const resolvedVariantId = variantId ?? crypto.randomUUID();
    const uploadRefs = await uploadSystemTemplateFiles(resolvedVariantId, input.overrides.uploads);
    const previewMetadata = buildPreviewMetadata({
      baseTemplateId: input.baseTemplateId,
      platform: input.platform,
      colors: input.overrides.colors,
      candidateSelections: input.overrides.candidateSelections,
      uploadRefs,
    });
    const variantPayload = {
      id: resolvedVariantId,
      bundle_id: bundle.id,
      platform: input.platform,
      base_template_id: input.baseTemplateId,
      colors: input.overrides.colors,
      candidate_selections: input.overrides.candidateSelections,
      bubble_edits: input.overrides.bubbleEdits,
      upload_refs: uploadRefs,
      preview_metadata: previewMetadata,
    };

    const { data: variant, error: variantError } = await supabase.from("system_template_variants").upsert(variantPayload).select("*").single();
    if (variantError) throw variantError;

    return {
      id: variant.id,
      bundleId: bundle.id,
      title: bundle.title,
      description: bundle.description ?? undefined,
      baseTemplateId: variant.base_template_id,
      platform: variant.platform,
      status: bundle.status,
      visibility: bundle.visibility,
      pricingType: bundle.pricing_type,
      priceAmount: bundle.price_amount ?? undefined,
      creditCost: bundle.credit_cost ?? undefined,
      overrides: {
        colors: variant.colors ?? {},
        uploads: input.overrides.uploads,
        candidateSelections: variant.candidate_selections ?? {},
        bubbleEdits: normalizeBubbleEdits(variant.bubble_edits),
      },
      tags: bundle.tags ?? [],
      createdAt: input.createdAt ?? dateToMs(bundle.created_at) ?? now,
      updatedAt: dateToMs(variant.updated_at) ?? now,
    };
  },

  async delete(id) {
    const supabase = createClient();
    const { error } = await supabase.from("system_template_variants").delete().eq("id", id);
    if (error) throw error;
  },
};

async function uploadSystemTemplateFiles(variantId: string, uploads: SlotUploads): Promise<RemoteSlotUploads> {
  const supabase = createClient();
  const refs: RemoteSlotUploads = {};

  for (const [slotId, entries] of Object.entries(uploads)) {
    if (!entries?.length) continue;
    refs[slotId] = [];
    for (const entry of entries) {
      const fileName = sanitizeStoragePathPart(entry.file.name);
      const storagePath = `system-templates/${variantId}/${sanitizeStoragePathPart(slotId)}/${sanitizeStoragePathPart(entry.id)}-${fileName}`;
      const { error } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, entry.file, {
        contentType: entry.file.type || "application/octet-stream",
        upsert: true,
      });
      if (error) throw error;
      refs[slotId]?.push({
        id: entry.id,
        fileName: entry.file.name,
        mimeType: entry.file.type || "application/octet-stream",
        size: entry.file.size,
        storagePath,
      });
    }
  }

  return refs;
}

async function toRecord(row: VariantRow): Promise<SystemTemplateRecord> {
  const bundle = unwrapBundle(row.system_template_bundles);
  const uploads = await remoteUploadsToSlotUploads(row.upload_refs ?? {});

  return {
    id: row.id,
    bundleId: row.bundle_id,
    title: bundle.title,
    description: bundle.description ?? undefined,
    baseTemplateId: row.base_template_id,
    platform: row.platform,
    status: bundle.status,
    visibility: bundle.visibility,
    pricingType: bundle.pricing_type,
    priceAmount: bundle.price_amount ?? undefined,
    creditCost: bundle.credit_cost ?? undefined,
    overrides: {
      colors: row.colors ?? {},
      uploads,
      candidateSelections: row.candidate_selections ?? {},
      bubbleEdits: normalizeBubbleEdits(row.bubble_edits),
    },
    tags: bundle.tags ?? [],
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
  };
}

function toMetadataRecord(row: VariantRow): SystemTemplateMetadataRecord {
  const bundle = unwrapBundle(row.system_template_bundles);
  return {
    id: row.id,
    bundleId: row.bundle_id,
    title: bundle.title,
    description: bundle.description ?? undefined,
    baseTemplateId: row.base_template_id,
    platform: row.platform,
    status: bundle.status,
    visibility: bundle.visibility,
    pricingType: bundle.pricing_type,
    priceAmount: bundle.price_amount ?? undefined,
    creditCost: bundle.credit_cost ?? undefined,
    overrides: {
      colors: row.colors ?? {},
      uploads: {},
      uploadRefs: row.upload_refs ?? {},
      candidateSelections: row.candidate_selections ?? {},
      bubbleEdits: normalizeBubbleEdits(row.bubble_edits),
    },
    tags: bundle.tags ?? [],
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
  };
}

async function remoteUploadsToSlotUploads(uploadRefs: RemoteSlotUploads, slotIds?: string[]): Promise<SlotUploads> {
  const uploads: SlotUploads = {};
  const allowed = slotIds?.length ? new Set(slotIds) : null;
  for (const [slotId, entries] of Object.entries(uploadRefs)) {
    if (allowed && !allowed.has(slotId)) continue;
    if (!entries?.length) continue;
    uploads[slotId] = await Promise.all(
      entries.map(async (entry) => ({
        id: entry.id,
        file: await storagePathToFile(entry.storagePath, entry.fileName, entry.mimeType),
      })),
    );
  }
  return uploads;
}

function toSummary(row: VariantRow): SystemTemplateSummary {
  const bundle = unwrapBundle(row.system_template_bundles);
  return {
    id: row.id,
    bundleId: row.bundle_id,
    title: bundle.title,
    description: bundle.description ?? undefined,
    baseTemplateId: row.base_template_id,
    platform: row.platform,
    status: bundle.status,
    visibility: bundle.visibility,
    pricingType: bundle.pricing_type,
    priceAmount: bundle.price_amount ?? undefined,
    creditCost: bundle.credit_cost ?? undefined,
    tags: bundle.tags ?? [],
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
    uploadCount: Object.values(row.upload_refs ?? {}).reduce((count, entries) => count + (entries?.length ?? 0), 0),
    colorCount: Object.values(row.colors ?? {}).filter(Boolean).length,
    colors: row.colors ?? {},
    candidateSelections: row.candidate_selections ?? {},
    uploadRefs: row.upload_refs ?? {},
    previewMetadata: normalizePreviewMetadata(row.preview_metadata),
  };
}

function unwrapBundle(bundle: VariantRow["system_template_bundles"]): BundleRow {
  const value = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!value) throw new Error("System template bundle is missing.");
  return value;
}

function normalizeBubbleEdits(value: Partial<ThemeEditOverrides["bubbleEdits"]> | null | undefined): ThemeEditOverrides["bubbleEdits"] {
  return {
    markers: value?.markers ?? {},
    insets: value?.insets ?? {},
    stretch: value?.stretch ?? {},
  };
}

function buildPreviewMetadata({
  baseTemplateId,
  platform,
  colors,
  candidateSelections,
  uploadRefs,
}: {
  baseTemplateId: ThemeTemplateId;
  platform: ThemePlatform;
  colors: ThemeEditOverrides["colors"];
  candidateSelections: SlotCandidateSelections;
  uploadRefs: RemoteSlotUploads;
}): SystemTemplatePreviewMetadata {
  const template = getThemeTemplate(baseTemplateId);
  const slots = getThemeSlots(platform);

  return {
    colors: {
      chatBackground: resolvePreviewColor(slots, "chat_background_color", colors, candidateSelections, baseTemplateId, template),
      mainBackground: resolvePreviewColor(slots, "main_background_color", colors, candidateSelections, baseTemplateId, template),
      tabBackground: resolvePreviewColor(slots, "tab_background", colors, candidateSelections, baseTemplateId, template),
      myBubble: resolvePreviewColor(slots, "chat_bubble_me_color", colors, candidateSelections, baseTemplateId, template),
      friendBubble: resolvePreviewColor(slots, "chat_bubble_you_color", colors, candidateSelections, baseTemplateId, template),
    },
    refs: {
      chatBackground: resolvePreviewStoragePath(slots, "chat_background", uploadRefs, candidateSelections),
      mainBackground: resolvePreviewStoragePath(slots, "main_background", uploadRefs, candidateSelections),
      tabBackground: resolvePreviewStoragePath(slots, "tab_background_image", uploadRefs, candidateSelections),
      myBubble: resolvePreviewStoragePath(slots, "bubble_me_1", uploadRefs, candidateSelections),
      friendBubble: resolvePreviewStoragePath(slots, "bubble_you_1", uploadRefs, candidateSelections),
      profileImage: resolvePreviewStoragePath(slots, "profile_image_1", uploadRefs, candidateSelections),
    },
  };
}

function resolvePreviewColor(
  slots: ThemeAssetSlot[],
  role: ThemeResourceRole,
  colors: ThemeEditOverrides["colors"],
  candidateSelections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ReturnType<typeof getThemeTemplate>,
) {
  const slot = slots.find((item) => item.role === role);
  return getResolvedColor(slot, colors, candidateSelections, templateId, template);
}

function resolvePreviewStoragePath(slots: ThemeAssetSlot[], role: ThemeResourceRole, uploadRefs: RemoteSlotUploads, candidateSelections: SlotCandidateSelections) {
  const slot = slots.find((item) => item.role === role);
  if (!slot) return undefined;
  const entries = uploadRefs[slot.id] ?? [];
  const selectedId = candidateSelections[slot.id];
  const selected = selectedId ? entries.find((entry) => entry.id === selectedId) : undefined;
  return selected?.storagePath ?? entries[0]?.storagePath;
}

function normalizePreviewMetadata(value: SystemTemplatePreviewMetadata | null | undefined): SystemTemplatePreviewMetadata {
  return {
    colors: value?.colors ?? {},
    refs: value?.refs ?? {},
  };
}

function dateToMs(value?: string | null) {
  return value ? new Date(value).getTime() : Date.now();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
