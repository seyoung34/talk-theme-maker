import { createClient } from "@/lib/supabase/client";
import { getThemeAssetSignedUrls, sanitizeStoragePathPart, storagePathToFile, themeAssetsBucketName } from "@/lib/theme/remoteAssets";
import { getResolvedColor } from "@/lib/theme/project/state";
import type { SlotCandidateSelections, SlotUploads } from "@/lib/theme/project/state";
import type { SystemTemplateRepository } from "@/lib/theme/systemTemplates/repository";
import { generateSystemTemplateThumbnail } from "@/lib/theme/systemTemplates/thumbnail";
import type { BubblePreviewShape, RemoteSlotUploads, SystemTemplateMetadataRecord, SystemTemplatePage, SystemTemplatePreviewMetadata, SystemTemplateRecord, SystemTemplateSaveInput, SystemTemplateSummary, ThemeEditOverrides } from "@/lib/theme/systemTemplates/types";
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

  async listPage(options = {}): Promise<SystemTemplatePage> {
    const supabase = createClient();
    const limit = Math.min(30, Math.max(1, options.limit ?? 12));
    const cursor = decodeCursor(options.cursor);
    let query = supabase
      .from("system_template_variants")
      .select(
        "id,bundle_id,platform,base_template_id,colors,candidate_selections,upload_refs,preview_metadata,created_at,updated_at,system_template_bundles!inner(id,title,description,status,visibility,pricing_type,price_amount,credit_cost,tags,created_at,updated_at)",
      )
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (options.publicOnly) {
      query = query.eq("system_template_bundles.status", "published").eq("system_template_bundles.visibility", "public");
    }
    if (cursor) {
      query = query.or(`updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as VariantRow[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(toSummary),
      nextCursor: hasMore && last ? encodeCursor(last.updated_at, last.id) : undefined,
    };
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
    const cardPreviewPath = await createAndUploadTemplateThumbnail(resolvedVariantId, input);
    const previewMetadata = buildPreviewMetadata({
      baseTemplateId: input.baseTemplateId,
      platform: input.platform,
      colors: input.overrides.colors,
      candidateSelections: input.overrides.candidateSelections,
      bubbleEdits: input.overrides.bubbleEdits,
      uploadRefs,
      cardPreviewPath,
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

  async regeneratePreviewMetadata(id) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("system_template_variants")
      .select("base_template_id,platform,colors,candidate_selections,bubble_edits,upload_refs,preview_metadata")
      .eq("id", id)
      .single();
    if (error) throw error;
    const row = data as unknown as VariantRow;
    const colors = row.colors ?? {};
    const candidateSelections = row.candidate_selections ?? {};
    const bubbleEdits = normalizeBubbleEdits(row.bubble_edits);
    const uploadRefs = row.upload_refs ?? {};

    // 카드 썸네일 재굽기: 원격 에셋을 role별 서명 URL로 주입해 canvas로 다시 굽는다.
    // 실패해도(예: SSR/이미지 로드 실패) previewMetadata 갱신은 계속 진행하고 기존 webp를 유지한다.
    let cardPreviewPath = row.preview_metadata?.cardPreviewPath;
    try {
      const slots = getThemeSlots(row.platform);
      const thumbnailRoles: ThemeResourceRole[] = ["main_background", "chat_background", "bubble_me_1", "bubble_you_1", "profile_image_1"];
      const pathByRole = new Map<ThemeResourceRole, string>();
      for (const role of thumbnailRoles) {
        const storagePath = resolvePreviewStoragePath(slots, role, uploadRefs, candidateSelections);
        if (storagePath) pathByRole.set(role, storagePath);
      }
      const signedUrls = pathByRole.size > 0 ? await getThemeAssetSignedUrls(Array.from(pathByRole.values())) : {};
      const imageUrlByRole: Partial<Record<ThemeResourceRole, string>> = {};
      for (const [role, storagePath] of pathByRole) {
        if (signedUrls[storagePath]) imageUrlByRole[role] = signedUrls[storagePath];
      }
      const thumbnail = await generateSystemTemplateThumbnail(
        { baseTemplateId: row.base_template_id, platform: row.platform, overrides: { colors, uploads: {}, candidateSelections, bubbleEdits } },
        imageUrlByRole,
      );
      if (thumbnail) {
        const storagePath = `system-templates/${id}/preview/card.webp`;
        const { error: uploadError } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, thumbnail, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: true,
        });
        if (uploadError) throw uploadError;
        cardPreviewPath = storagePath;
      }
    } catch (thumbnailError) {
      console.warn("Card thumbnail could not be regenerated; keeping previous.", thumbnailError);
    }

    const previewMetadata = buildPreviewMetadata({
      baseTemplateId: row.base_template_id,
      platform: row.platform,
      colors,
      candidateSelections,
      bubbleEdits,
      uploadRefs,
      cardPreviewPath,
    });
    const { error: updateError } = await supabase
      .from("system_template_variants")
      .update({ preview_metadata: previewMetadata })
      .eq("id", id);
    if (updateError) throw updateError;
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
      const imageEdit = entry.imageEdit
        ? {
            originalName: entry.imageEdit.originalName,
            originalSize: entry.imageEdit.originalSize,
            originalStoragePath: await uploadOriginalImageEditFile({
              supabase,
              variantId,
              slotId,
              entryId: entry.id,
              originalFile: entry.imageEdit.originalFile,
            }),
            editedAt: entry.imageEdit.editedAt,
            state: entry.imageEdit.state,
            ...(entry.imageEdit.target ? { target: entry.imageEdit.target } : {}),
          }
        : undefined;
      refs[slotId]?.push({
        id: entry.id,
        fileName: entry.file.name,
        mimeType: entry.file.type || "application/octet-stream",
        size: entry.file.size,
        storagePath,
        ...(imageEdit ? { imageEdit } : {}),
      });
    }
  }

  return refs;
}

async function uploadOriginalImageEditFile({
  supabase,
  variantId,
  slotId,
  entryId,
  originalFile,
}: {
  supabase: ReturnType<typeof createClient>;
  variantId: string;
  slotId: string;
  entryId: string;
  originalFile?: File;
}) {
  if (!originalFile) return undefined;
  const fileName = sanitizeStoragePathPart(originalFile.name);
  const storagePath = `system-templates/${variantId}/${sanitizeStoragePathPart(slotId)}/${sanitizeStoragePathPart(entryId)}-original-${fileName}`;
  const { error } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, originalFile, {
    contentType: originalFile.type || "application/octet-stream",
    upsert: true,
  });
  if (error) throw error;
  return storagePath;
}

async function createAndUploadTemplateThumbnail(variantId: string, input: SystemTemplateSaveInput) {
  try {
    const thumbnail = await generateSystemTemplateThumbnail(input);
    if (!thumbnail) return undefined;
    const storagePath = `system-templates/${variantId}/preview/card.webp`;
    const supabase = createClient();
    const { error } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, thumbnail, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: true,
    });
    if (error) throw error;
    return storagePath;
  } catch (error) {
    console.warn("System template thumbnail could not be generated.", error);
    return undefined;
  }
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
      entries.map(async (entry) => {
        const originalFile = entry.imageEdit?.originalStoragePath
          ? await storagePathToFile(entry.imageEdit.originalStoragePath, entry.imageEdit.originalName, entry.mimeType).catch(() => undefined)
          : undefined;
        return {
          id: entry.id,
          file: await storagePathToFile(entry.storagePath, entry.fileName, entry.mimeType),
          source: "template" as const,
          ...(entry.imageEdit
            ? {
                imageEdit: {
                  originalName: entry.imageEdit.originalName,
                  originalSize: entry.imageEdit.originalSize,
                  originalFile,
                  editedAt: entry.imageEdit.editedAt,
                  state: entry.imageEdit.state,
                  ...(entry.imageEdit.target ? { target: entry.imageEdit.target } : {}),
                },
              }
            : {}),
        };
      }),
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
  bubbleEdits,
  uploadRefs,
  cardPreviewPath,
}: {
  baseTemplateId: ThemeTemplateId;
  platform: ThemePlatform;
  colors: ThemeEditOverrides["colors"];
  candidateSelections: SlotCandidateSelections;
  bubbleEdits: ThemeEditOverrides["bubbleEdits"];
  uploadRefs: RemoteSlotUploads;
  cardPreviewPath?: string;
}): SystemTemplatePreviewMetadata {
  const template = getThemeTemplate(baseTemplateId);
  const slots = getThemeSlots(platform);

  return {
    cardPreviewPath,
    generatedAt: cardPreviewPath ? new Date().toISOString() : undefined,
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
    bubbles: {
      myBubble: resolvePreviewBubbleShape(slots, "bubble_me_1", bubbleEdits),
      friendBubble: resolvePreviewBubbleShape(slots, "bubble_you_1", bubbleEdits),
    },
  };
}

function resolvePreviewBubbleShape(slots: ThemeAssetSlot[], role: ThemeResourceRole, bubbleEdits: ThemeEditOverrides["bubbleEdits"]): BubblePreviewShape | undefined {
  const slot = slots.find((item) => item.role === role);
  if (!slot) return undefined;
  const stretch = bubbleEdits.stretch[slot.id];
  const insets = bubbleEdits.insets[slot.id];
  const markers = bubbleEdits.markers[slot.id];
  if (!stretch && !insets && !markers) return undefined;
  return { stretch, insets, markers };
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
    cardPreviewPath: value?.cardPreviewPath,
    generatedAt: value?.generatedAt,
    colors: value?.colors ?? {},
    refs: value?.refs ?? {},
    bubbles: value?.bubbles ?? {},
  };
}

function dateToMs(value?: string | null) {
  return value ? new Date(value).getTime() : Date.now();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function encodeCursor(updatedAt: string, id: string) {
  return `${updatedAt}|${id}`;
}

function decodeCursor(value?: string) {
  if (!value) return null;
  const separator = value.lastIndexOf("|");
  if (separator < 1) return null;
  const updatedAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return isUuid(id) && Number.isFinite(new Date(updatedAt).getTime()) ? { updatedAt, id } : null;
}
