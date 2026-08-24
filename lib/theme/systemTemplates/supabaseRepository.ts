import { createClient } from "@/lib/supabase/client";
import { getThemeAssetSignedUrls, sanitizeStoragePathPart, storagePathToFile, themeAssetsBucketName, themePublicBucketName } from "@/lib/theme/remoteAssets";
import { createAdminThemeAssetSignedUrls } from "@/lib/theme/systemTemplates/adminSignedUrls";
import { themeAssetCacheControl } from "@/lib/theme/themeAssetSigning";
import { collectRemoteUploadPaths } from "@/lib/theme/systemTemplates/uploadRefPaths";
import { getResolvedColor, getSelectedSharedSlotEntry, requireUploadFile } from "@/lib/theme/project/state";
import type { SlotCandidateSelections, SlotUploadEntry, SlotUploads } from "@/lib/theme/project/state";
import { getPreviewColorRole, resolvePlatformPreviewColor } from "@/lib/theme/project/platformColor";
import type { SystemTemplateRepository } from "@/lib/theme/systemTemplates/repository";
import { generateSystemTemplateThumbnail, thumbnailTabIconRoles } from "@/lib/theme/systemTemplates/thumbnail";
import { createSystemTemplatePreviewVisual, previewRoles, tabIconPreviewRoles } from "@/lib/theme/systemTemplates/preview";
import { findUnsignedPreviewAssets, generatePreviewScreens } from "@/lib/theme/systemTemplates/screenPreview";
import { previewScreenIds, type PreviewScreenId } from "@/lib/theme/systemTemplates/previewScreenData";
import { normalizeSystemTemplateVisibility, type BubblePreviewShape, type RemoteSlotUploads, type SystemTemplateMetadataRecord, type SystemTemplatePage, type SystemTemplatePreviewMetadata, type SystemTemplateRecord, type SystemTemplateSaveInput, type SystemTemplateSummary, type ThemeEditOverrides } from "@/lib/theme/systemTemplates/types";
import { assertValidTemplateName } from "@/lib/theme/templateName";
import { parseBubbleGeometryMap } from "@/lib/theme/bubbleGeometry";
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

type StorageUploadTracker = {
  privatePaths: Set<string>;
  publicPaths: Set<string>;
};

type PreviousVariantStorage = {
  uploadRefs: RemoteSlotUploads;
  previewMetadata: SystemTemplatePreviewMetadata;
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

  prewarmUploads(uploadRefs, slotIds) {
    return prewarmRemoteUploadSignedUrls(uploadRefs, slotIds);
  },

  async save(input) {
    const supabase = createClient();
    const now = Date.now();
    const title = assertValidTemplateName(input.title, input.legacyTitle);
    const bundleId = input.bundleId && isUuid(input.bundleId) ? input.bundleId : undefined;
    const variantId = input.id && isUuid(input.id) ? input.id : undefined;

    const { data: userData } = await supabase.auth.getUser();
    const bundlePayload = {
      title,
      description: input.description ?? null,
      status: input.status,
      visibility: input.visibility,
      pricing_type: input.pricingType,
      price_amount: input.priceAmount ?? null,
      credit_cost: input.creditCost ?? null,
      tags: input.tags,
      created_by: userData.user?.id ?? null,
    };

    const resolvedVariantId = variantId ?? crypto.randomUUID();
    const storagePrefix = createSystemTemplateRevisionPrefix(resolvedVariantId);
    const storageTracker = createStorageUploadTracker();
    let previousStorage: PreviousVariantStorage | undefined;
    let createdBundleId: string | undefined;
    let persisted = false;

    try {
      if (variantId) {
        const { data, error } = await supabase
          .from("system_template_variants")
          .select("upload_refs,preview_metadata")
          .eq("id", variantId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          previousStorage = {
            uploadRefs: (data.upload_refs ?? {}) as RemoteSlotUploads,
            previewMetadata: normalizePreviewMetadata(data.preview_metadata),
          };
        }
      }

      const uploadRefs = await uploadSystemTemplateFiles(supabase, storagePrefix, input.overrides.uploads, storageTracker);
      const cardPreviewPath =
        (await createAndUploadTemplateThumbnail({ supabase, storagePrefix, input, storageTracker }))
        ?? previousStorage?.previewMetadata.cardPreviewPath;

      // 방금 올린 에셋을 다시 서명해 화면을 굽는다. 로컬 File을 그대로 쓰지 않는 이유는
      // 재생성 경로와 **같은 입력**으로 굽기 위해서다 — 경로가 갈라지면 저장 직후와 재생성 후
      // 화면이 달라진다. 굽는 주체가 운영자 한 명이라 이 왕복은 감당할 수 있다.
      const slots = getThemeSlots(input.platform);
      const pathByRole = collectPreviewPathsByRole(slots, uploadRefs, input.overrides.candidateSelections);
      const expectedPaths = Array.from(new Set(pathByRole.values()));
      // 서명이 실패해도 저장 자체는 되돌리지 않는다. 미리보기를 못 구운 것은 모달
      // 폴백으로 감당할 수 있다. 대신 아래에서 굽기를 건너뛴다.
      const signedUrlByPath = expectedPaths.length > 0
        ? await createAdminThemeAssetSignedUrls(supabase, expectedPaths).catch((signingError) => {
            console.warn("Preview asset signing failed; screen previews are skipped for this save.", signingError);
            return {} as Record<string, string>;
          })
        : {};
      const screenPreviews = await renderAndUploadScreenPreviews({
        supabase,
        variantId: resolvedVariantId,
        storagePrefix,
        storageTracker,
        baseTemplateId: input.baseTemplateId,
        platform: input.platform,
        colors: input.overrides.colors,
        candidateSelections: input.overrides.candidateSelections,
        bubbleEdits: input.overrides.bubbleEdits,
        uploadRefs,
        cardPreviewPath,
        signedUrlByPath,
        expectedPaths,
        previous: previousStorage?.previewMetadata.screenPreviews,
      });

      const previewMetadata = buildPreviewMetadata({
        baseTemplateId: input.baseTemplateId,
        platform: input.platform,
        colors: input.overrides.colors,
        candidateSelections: input.overrides.candidateSelections,
        bubbleEdits: input.overrides.bubbleEdits,
        uploadRefs,
        cardPreviewPath,
        screenPreviews,
      });

      // Storage 업로드와 미리보기 준비가 끝난 뒤에만 DB를 변경한다. 업로드가 중간에
      // 실패하면 기존 시스템 템플릿의 번들 메타데이터를 앞서 바꾸지 않는다.
      const { data: bundle, error: bundleError } = bundleId
        ? await supabase.from("system_template_bundles").update(bundlePayload).eq("id", bundleId).select("*").single()
        : await supabase.from("system_template_bundles").insert(bundlePayload).select("*").single();
      if (bundleError) throw bundleError;
      if (!bundle) throw new Error("System template bundle was not saved.");
      if (!bundleId) createdBundleId = bundle.id;

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
      if (!variant) throw new Error("System template variant was not saved.");
      persisted = true;

      await removeObsoleteSystemTemplateStorage(supabase, resolvedVariantId, previousStorage, uploadRefs, previewMetadata);

      return {
        id: variant.id,
        bundleId: bundle.id,
        title: bundle.title,
        description: bundle.description ?? undefined,
        baseTemplateId: variant.base_template_id,
        platform: variant.platform,
        status: bundle.status,
        visibility: normalizeSystemTemplateVisibility(bundle.visibility),
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
    } catch (error) {
      // 모든 저장 경로는 revision 전용이므로 실패 시 이번 시도에서 실제로 성공한
      // 업로드만 지운다. 기존 variant가 참조하던 경로에는 절대 접근하지 않는다.
      if (!persisted) await removeTrackedSystemTemplateStorage(supabase, storageTracker);
      if (!persisted && createdBundleId) {
        const { error: bundleCleanupError } = await supabase.from("system_template_bundles").delete().eq("id", createdBundleId);
        if (bundleCleanupError) console.warn("New system template bundle cleanup failed.", bundleCleanupError);
      }
      throw error;
    }
  },

  async updatePublication(bundleId, input) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("system_template_bundles")
      .update({ status: input.status, visibility: input.visibility })
      .eq("id", bundleId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("System template bundle was not updated.");
  },

  async updateTags(bundleId, tags) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("system_template_bundles")
      .update({ tags })
      .eq("id", bundleId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("System template bundle tags were not updated.");
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
    //
    // 실패 처리를 두 갈래로 나눈다. 서명·업로드 같은 인프라 실패는 다음 템플릿에서도 똑같이
    // 실패하므로 삼키지 않고 던져서 일괄 재생성 자체를 멈춘다. 예전에는 전부 catch 해서
    // "기존 썸네일 유지"로 넘겼고, 그 바람에 서버가 죽은 상태에서도 템플릿 수만큼 요청이
    // 계속 나갔다. 반면 이미지 로드/디코딩·canvas 실패는 그 템플릿 하나의 문제라 기존 webp를
    // 유지하고 previewMetadata 갱신은 그대로 진행한다.
    const storagePrefix = createSystemTemplateRevisionPrefix(id);
    const storageTracker = createStorageUploadTracker();
    let persisted = false;

    try {
      let cardPreviewPath = row.preview_metadata?.cardPreviewPath;
      const slots = getThemeSlots(row.platform);
      // 카드 썸네일과 4화면이 필요한 role의 합집합을 한 번에 서명한다. 따로 부르면 같은 경로를
      // 두 번 서명하게 되고, 굽는 도중 URL이 갈라진다.
      const pathByRole = collectPreviewPathsByRole(slots, uploadRefs, candidateSelections);
      // 관리자 브라우저 → Supabase Storage 직접 서명. Next.js 라우트를 거치지 않는다.
      const signedUrlByPath = pathByRole.size > 0 ? await createAdminThemeAssetSignedUrls(supabase, Array.from(new Set(pathByRole.values()))) : {};
      const imageUrlByRole: Partial<Record<ThemeResourceRole, string>> = {};
      for (const [role, storagePath] of pathByRole) {
        if (signedUrlByPath[storagePath]) imageUrlByRole[role] = signedUrlByPath[storagePath];
      }

      let thumbnail: Blob | null = null;
      try {
        thumbnail = await generateSystemTemplateThumbnail(
          { baseTemplateId: row.base_template_id, platform: row.platform, overrides: { colors, uploads: {}, candidateSelections, bubbleEdits } },
          imageUrlByRole,
        );
      } catch (thumbnailError) {
        console.warn("Card thumbnail could not be rendered; keeping previous.", thumbnailError);
      }

      if (thumbnail) {
        const storagePath = `${storagePrefix}/preview/card.webp`;
        // 공개 버킷. 갤러리에 그대로 노출되는 이미지라 서명할 이유가 없고, 서명하면 10분 뒤
        // 깨진다. 원본 에셋은 계속 비공개 버킷에 둔다.
        const { error: uploadError } = await supabase.storage.from(themePublicBucketName).upload(storagePath, thumbnail, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) throw uploadError;
        trackUploadedPath(storageTracker, themePublicBucketName, storagePath);
        cardPreviewPath = storagePath;
      }

      const screenPreviews = await renderAndUploadScreenPreviews({
        supabase,
        variantId: id,
        storagePrefix,
        storageTracker,
        baseTemplateId: row.base_template_id,
        platform: row.platform,
        colors,
        candidateSelections,
        bubbleEdits,
        uploadRefs,
        cardPreviewPath,
        signedUrlByPath,
        expectedPaths: Array.from(new Set(pathByRole.values())),
        previous: row.preview_metadata?.screenPreviews,
      });

      const previewMetadata = buildPreviewMetadata({
        baseTemplateId: row.base_template_id,
        platform: row.platform,
        colors,
        candidateSelections,
        bubbleEdits,
        uploadRefs,
        cardPreviewPath,
        screenPreviews,
      });
      const { error: updateError } = await supabase
        .from("system_template_variants")
        .update({ preview_metadata: previewMetadata })
        .eq("id", id);
      if (updateError) throw updateError;
      persisted = true;

      await removeObsoleteSystemTemplateStorage(
        supabase,
        id,
        { uploadRefs, previewMetadata: normalizePreviewMetadata(row.preview_metadata) },
        uploadRefs,
        previewMetadata,
      );
    } catch (regenerationError) {
      if (!persisted) await removeTrackedSystemTemplateStorage(supabase, storageTracker);
      throw regenerationError;
    }
  },

  async delete(id) {
    const supabase = createClient();
    const { error } = await supabase.from("system_template_variants").delete().eq("id", id);
    if (error) throw error;
  },
};

function createStorageUploadTracker(): StorageUploadTracker {
  return { privatePaths: new Set(), publicPaths: new Set() };
}

function createSystemTemplateRevisionPrefix(variantId: string) {
  return `system-templates/${sanitizeStoragePathPart(variantId)}/revisions/${sanitizeStoragePathPart(crypto.randomUUID())}`;
}

function trackUploadedPath(tracker: StorageUploadTracker, bucket: string, path: string) {
  if (bucket === themePublicBucketName) tracker.publicPaths.add(path);
  else tracker.privatePaths.add(path);
}

async function removeTrackedSystemTemplateStorage(supabase: ReturnType<typeof createClient>, tracker: StorageUploadTracker) {
  const removals = [
    ...(tracker.privatePaths.size
      ? [supabase.storage.from(themeAssetsBucketName).remove(Array.from(tracker.privatePaths))]
      : []),
    ...(tracker.publicPaths.size
      ? [supabase.storage.from(themePublicBucketName).remove(Array.from(tracker.publicPaths))]
      : []),
  ];
  if (!removals.length) return;

  try {
    const results = await Promise.all(removals);
    const cleanupError = results.find((result) => result.error)?.error;
    if (cleanupError) console.warn("System template storage cleanup failed.", cleanupError);
  } catch (error) {
    console.warn("System template storage cleanup failed.", error);
  }
}

function previewStoragePaths(previewMetadata: SystemTemplatePreviewMetadata | null | undefined) {
  return [
    previewMetadata?.cardPreviewPath,
    ...Object.values(previewMetadata?.screenPreviews ?? {}),
  ].filter((path): path is string => Boolean(path));
}

async function removeObsoleteSystemTemplateStorage(
  supabase: ReturnType<typeof createClient>,
  variantId: string,
  previous: PreviousVariantStorage | undefined,
  nextUploadRefs: RemoteSlotUploads,
  nextPreviewMetadata: SystemTemplatePreviewMetadata,
) {
  if (!previous) return;

  const ownedPrefix = `system-templates/${sanitizeStoragePathPart(variantId)}/`;
  const nextPrivatePaths = new Set(collectRemoteUploadPaths(nextUploadRefs));
  const previousPrivatePaths = [...new Set(collectRemoteUploadPaths(previous.uploadRefs))]
    .filter((path) => path.startsWith(ownedPrefix) && !nextPrivatePaths.has(path));
  const nextPublicPaths = new Set(previewStoragePaths(nextPreviewMetadata));
  const previousPublicPaths = [...new Set(previewStoragePaths(previous.previewMetadata))]
    .filter((path) => path.startsWith(ownedPrefix) && !nextPublicPaths.has(path));

  const cleanupTracker: StorageUploadTracker = {
    privatePaths: new Set(previousPrivatePaths),
    publicPaths: new Set(previousPublicPaths),
  };
  await removeTrackedSystemTemplateStorage(supabase, cleanupTracker);
}

async function uploadSystemTemplateFiles(
  supabase: ReturnType<typeof createClient>,
  storagePrefix: string,
  uploads: SlotUploads,
  storageTracker: StorageUploadTracker,
): Promise<RemoteSlotUploads> {
  const refs: RemoteSlotUploads = {};

  for (const [slotId, entries] of Object.entries(uploads)) {
    if (!entries?.length) continue;
    refs[slotId] = [];
    for (const entry of entries) {
      // 추천 catalog 에셋은 이미 GCS registry에 게시돼 있다. 선택 직후 편집기에서 쓰는
      // fallback File이 함께 수화돼 있어도 같은 바이트를 Supabase Storage에 다시 올리면
      // catalog 전환의 이점이 사라지므로 선택과 검증 metadata만 보관한다.
      // signed URL은 만료되므로 저장하지 않고, legacyStoragePath는 미리보기·변환 fallback에서만 쓴다.
      if (shouldPersistCatalogReference(entry)) {
        const metadata = entry.catalog;
        if (!metadata.fileName || !metadata.mimeType || !metadata.size || !metadata.sourceScale || !metadata.width || !metadata.height || !metadata.pngSignatureVerified) {
          throw new Error("시스템 템플릿 저장: catalog 에셋 메타데이터가 없습니다.");
        }
        refs[slotId]?.push({
          id: entry.id,
          fileName: metadata.fileName,
          mimeType: metadata.mimeType,
          size: metadata.size,
          catalog: entry.catalog.selection,
          catalogMetadata: {
            fileName: metadata.fileName,
            mimeType: metadata.mimeType,
            size: metadata.size,
            sourceScale: metadata.sourceScale,
            width: metadata.width,
            height: metadata.height,
            pngSignatureVerified: true,
            ...(metadata.legacyStoragePath ? { legacyStoragePath: metadata.legacyStoragePath } : {}),
          },
        });
        continue;
      }

      // metadata가 빠진 오래된 catalog row나 변환된 항목은 legacy 경로를 통해 기존 방식으로
      // 저장한다. 둘 다 없으면 조용히 누락시키지 않고 requireUploadFile에서 실패시킨다.
      const uploadFile = requireUploadFile(entry, "시스템 템플릿 저장");
      const fileName = sanitizeStoragePathPart(uploadFile.name);
      const storagePath = `${storagePrefix}/${sanitizeStoragePathPart(slotId)}/${sanitizeStoragePathPart(entry.id)}-${fileName}`;
      const { error } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, uploadFile, {
        contentType: uploadFile.type || "application/octet-stream",
        cacheControl: themeAssetCacheControl,
        upsert: false,
      });
      if (error) throw error;
      trackUploadedPath(storageTracker, themeAssetsBucketName, storagePath);
      const imageEdit = entry.imageEdit
        ? {
            originalName: entry.imageEdit.originalName,
            originalSize: entry.imageEdit.originalSize,
            originalStoragePath: await uploadOriginalImageEditFile({
              supabase,
              storagePrefix,
              storageTracker,
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
        fileName: uploadFile.name,
        mimeType: uploadFile.type || "application/octet-stream",
        size: uploadFile.size,
        storagePath,
        ...(imageEdit ? { imageEdit } : {}),
      });
    }
  }

  return refs;
}

export function shouldPersistCatalogReference(entry: SlotUploadEntry): entry is SlotUploadEntry & {
  catalog: NonNullable<SlotUploadEntry["catalog"]>;
  imageEdit?: undefined;
} {
  return Boolean(entry.catalog && !entry.imageEdit);
}

async function uploadOriginalImageEditFile({
  supabase,
  storagePrefix,
  storageTracker,
  slotId,
  entryId,
  originalFile,
}: {
  supabase: ReturnType<typeof createClient>;
  storagePrefix: string;
  storageTracker: StorageUploadTracker;
  slotId: string;
  entryId: string;
  originalFile?: File;
}) {
  if (!originalFile) return undefined;
  const fileName = sanitizeStoragePathPart(originalFile.name);
  const storagePath = `${storagePrefix}/${sanitizeStoragePathPart(slotId)}/${sanitizeStoragePathPart(entryId)}-original-${fileName}`;
  const { error } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, originalFile, {
    contentType: originalFile.type || "application/octet-stream",
    cacheControl: themeAssetCacheControl,
    upsert: false,
  });
  if (error) throw error;
  trackUploadedPath(storageTracker, themeAssetsBucketName, storagePath);
  return storagePath;
}

async function createAndUploadTemplateThumbnail({
  supabase,
  storagePrefix,
  input,
  storageTracker,
}: {
  supabase: ReturnType<typeof createClient>;
  storagePrefix: string;
  input: SystemTemplateSaveInput;
  storageTracker: StorageUploadTracker;
}) {
  let thumbnail: Blob | null;
  try {
    thumbnail = await generateSystemTemplateThumbnail(input);
  } catch (error) {
    console.warn("System template thumbnail could not be generated.", error);
    return undefined;
  }
  if (!thumbnail) return undefined;

  const storagePath = `${storagePrefix}/preview/card.webp`;
  const { error } = await supabase.storage.from(themePublicBucketName).upload(storagePath, thumbnail, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  trackUploadedPath(storageTracker, themePublicBucketName, storagePath);
  return storagePath;
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
    visibility: normalizeSystemTemplateVisibility(bundle.visibility),
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
    visibility: normalizeSystemTemplateVisibility(bundle.visibility),
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

/**
 * 서명 URL을 한 번에 받아 `getThemeAssetSignedUrls`의 캐시에 채워 둔다.
 *
 * 아래 `remoteUploadsToSlotUploads`는 파일마다 `storagePathToFile` → 단건 서명을 부른다.
 * 경로를 하나씩 넘기므로 배치(50개 단위)가 전혀 걸리지 않아, 에셋 30개짜리 템플릿을 열면
 * `/api/theme-assets/signed-urls` 요청이 30건 나갔다. 요청마다 Worker가 인증과 공개 여부
 * 조회를 처음부터 반복하므로, Workers Free의 요청당 CPU 10ms를 밀어 올리는 자리였다.
 *
 * 미리 한 번 채워 두면 이후 단건 호출은 전부 메모리 캐시에서 돌아온다. 호출 구조는 그대로 둔다.
 *
 * 실패는 삼킨다. 예열은 최적화이지 필수 단계가 아니다. 실패해도 아래 개별 경로가 그대로
 * 동작하고, 진짜 실패는 거기서 드러난다.
 */
async function prewarmRemoteUploadSignedUrls(uploadRefs: RemoteSlotUploads, slotIds?: string[]) {
  const paths = collectRemoteUploadPaths(uploadRefs, slotIds);
  if (!paths.length) return;
  try {
    await getThemeAssetSignedUrls(paths);
  } catch (error) {
    console.warn("Signed URL prewarm failed; falling back to per-file signing.", error);
  }
}

async function remoteUploadsToSlotUploads(uploadRefs: RemoteSlotUploads, slotIds?: string[]): Promise<SlotUploads> {
  const uploads: SlotUploads = {};
  const allowed = slotIds?.length ? new Set(slotIds) : null;
  // 이 호출이 다룰 경로를 먼저 한 번에 서명한다. 이 함수를 거치는 모든 호출자
  // (편집기 부트스트랩·저장·내보내기)가 같은 이득을 본다.
  await prewarmRemoteUploadSignedUrls(uploadRefs, slotIds);
  const legacyPreviewPaths = collectRemoteUploadPaths(uploadRefs, slotIds).filter((path, index, paths) => paths.indexOf(path) === index);
  let previewUrlByPath: Record<string, string> = {};
  if (legacyPreviewPaths.length) {
    try {
      previewUrlByPath = await getThemeAssetSignedUrls(legacyPreviewPaths);
    } catch (error) {
      // catalog export에는 preview URL이 필요 없다. 서명 실패는 편집기에서 이미지가 비어 보이는
      // 정도로 제한하고, 실제 byte hydration이 필요한 legacy 항목은 아래에서 다시 실패시킨다.
      console.warn("Catalog preview URL signing failed; export refs remain usable.", error);
    }
  }
  for (const [slotId, entries] of Object.entries(uploadRefs)) {
    if (allowed && !allowed.has(slotId)) continue;
    if (!entries?.length) continue;
    uploads[slotId] = await Promise.all(
      entries.map(async (entry) => {
        if (entry.catalog && entry.catalogMetadata && !entry.imageEdit) {
          const legacyStoragePath = entry.catalogMetadata.legacyStoragePath;
          return {
            id: entry.id,
            catalog: {
              selection: entry.catalog,
              fileName: entry.catalogMetadata.fileName,
              mimeType: entry.catalogMetadata.mimeType,
              size: entry.catalogMetadata.size,
              sourceScale: entry.catalogMetadata.sourceScale,
              width: entry.catalogMetadata.width,
              height: entry.catalogMetadata.height,
              pngSignatureVerified: entry.catalogMetadata.pngSignatureVerified,
              ...(legacyStoragePath ? { legacyStoragePath } : {}),
              ...(legacyStoragePath && previewUrlByPath[legacyStoragePath] ? { previewUrl: previewUrlByPath[legacyStoragePath] } : {}),
            },
            source: "template" as const,
          };
        }

        if (!entry.storagePath) throw new Error(`시스템 템플릿 에셋 경로가 없습니다: ${entry.id}`);
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
    visibility: normalizeSystemTemplateVisibility(bundle.visibility),
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
    geometry: parseBubbleGeometryMap(value?.geometry),
    markers: value?.markers ?? {},
    insets: value?.insets ?? {},
    stretch: value?.stretch ?? {},
    flipX: value?.flipX ?? {},
    designs: value?.designs ?? {},
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
  screenPreviews,
}: {
  baseTemplateId: ThemeTemplateId;
  platform: ThemePlatform;
  colors: ThemeEditOverrides["colors"];
  candidateSelections: SlotCandidateSelections;
  bubbleEdits: ThemeEditOverrides["bubbleEdits"];
  uploadRefs: RemoteSlotUploads;
  cardPreviewPath?: string;
  screenPreviews?: Partial<Record<PreviewScreenId, string>>;
}): SystemTemplatePreviewMetadata {
  const template = getThemeTemplate(baseTemplateId);
  const slots = getThemeSlots(platform);

  return {
    cardPreviewPath,
    screenPreviews,
    generatedAt: cardPreviewPath ? new Date().toISOString() : undefined,
    colors: {
      chatBackground: resolvePreviewColor(slots, "chat_background_color", colors, candidateSelections, baseTemplateId, template, platform),
      mainBackground: resolvePreviewColor(slots, "main_background_color", colors, candidateSelections, baseTemplateId, template, platform),
      tabBackground: resolvePreviewColor(slots, "tab_background", colors, candidateSelections, baseTemplateId, template, platform),
      myBubble: resolvePreviewColor(slots, "chat_bubble_me_color", colors, candidateSelections, baseTemplateId, template, platform),
      friendBubble: resolvePreviewColor(slots, "chat_bubble_you_color", colors, candidateSelections, baseTemplateId, template, platform),
    },
    refs: {
      chatBackground: resolvePreviewStoragePath(slots, "chat_background", uploadRefs, candidateSelections),
      mainBackground: resolvePreviewStoragePath(slots, "main_background", uploadRefs, candidateSelections),
      tabBackground: resolvePreviewStoragePath(slots, "tab_background_image", uploadRefs, candidateSelections),
      myBubble: resolvePreviewStoragePath(slots, "bubble_me_1", uploadRefs, candidateSelections),
      friendBubble: resolvePreviewStoragePath(slots, "bubble_you_1", uploadRefs, candidateSelections),
      myBubble2: resolvePreviewStoragePath(slots, "bubble_me_2", uploadRefs, candidateSelections),
      friendBubble2: resolvePreviewStoragePath(slots, "bubble_you_2", uploadRefs, candidateSelections),
      profileImage: resolvePreviewStoragePath(slots, "profile_image_1", uploadRefs, candidateSelections),
    },
    bubbles: {
      myBubble: resolvePreviewBubbleShape(slots, "bubble_me_1", bubbleEdits),
      friendBubble: resolvePreviewBubbleShape(slots, "bubble_you_1", bubbleEdits),
      myBubble2: resolvePreviewBubbleShape(slots, "bubble_me_2", bubbleEdits),
      friendBubble2: resolvePreviewBubbleShape(slots, "bubble_you_2", bubbleEdits),
    },
  };
}

function resolvePreviewBubbleShape(slots: ThemeAssetSlot[], role: ThemeResourceRole, bubbleEdits: ThemeEditOverrides["bubbleEdits"]): BubblePreviewShape | undefined {
  const slot = slots.find((item) => item.role === role);
  if (!slot) return undefined;
  const stretch = bubbleEdits.stretch[slot.id];
  const insets = bubbleEdits.insets[slot.id];
  const markers = bubbleEdits.markers[slot.id];
  const geometry = bubbleEdits.geometry[slot.id];
  const flipX = bubbleEdits.flipX?.[slot.id];
  if (!geometry && !stretch && !insets && !markers && !flipX) return undefined;
  return { geometry, stretch, insets, markers, flipX };
}

/**
 * 저장된 미리보기 색은 `resolveColor`(state.ts의 `getResolvedColor`)를 거치지 않고
 * 그대로 카드에 쓰인다. 그래서 이 자리에서 export와 같은 알파 규칙을 적용하지 않으면,
 * 알파 짝이 없는 iOS role에 반투명 색을 골랐을 때 결과물은 불투명인데 저장된 카드
 * 썸네일만 흐리게 남는다.
 */
function resolvePreviewColor(
  slots: ThemeAssetSlot[],
  role: ThemeResourceRole,
  colors: ThemeEditOverrides["colors"],
  candidateSelections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ReturnType<typeof getThemeTemplate>,
  platform: ThemePlatform,
) {
  const resolve = (readRole: ThemeResourceRole) => {
    const slot = slots.find((item) => item.role === readRole);
    return getResolvedColor(slot, colors, candidateSelections, templateId, template, slots);
  };
  const readRole = getPreviewColorRole(role, platform);
  const raw = resolve(readRole);
  if (!raw) return undefined;
  return resolvePlatformPreviewColor(resolve, role, raw, platform);
}

/**
 * 미리보기를 굽는 데 필요한 role → Storage 경로.
 *
 * 카드 썸네일이 쓰는 role과 모달 4화면이 쓰는 role의 합집합이다. 한 번에 모아 서명해야
 * 같은 경로가 두 번 서명되지 않고, 굽는 도중 URL이 갈라지지 않는다.
 */
function collectPreviewPathsByRole(slots: ThemeAssetSlot[], uploadRefs: RemoteSlotUploads, candidateSelections: SlotCandidateSelections) {
  const roles = new Set<ThemeResourceRole>([
    "main_background",
    "chat_background",
    "bubble_me_1",
    "bubble_you_1",
    "bubble_me_2",
    "bubble_you_2",
    "profile_image_1",
    ...thumbnailTabIconRoles,
    ...previewRoles,
    ...tabIconPreviewRoles,
  ]);

  const pathByRole = new Map<ThemeResourceRole, string>();
  for (const role of roles) {
    const storagePath = resolvePreviewStoragePath(slots, role, uploadRefs, candidateSelections);
    if (storagePath) pathByRole.set(role, storagePath);
  }
  return pathByRole;
}

/**
 * 모달 4화면을 굽고 공개 버킷에 올린다.
 *
 * 실패해도 던지지 않는다. 화면 굽기는 **최적화**이고, 실패하면 모달이 기존 DOM 렌더로
 * 떨어져 원본 에셋을 받는다 — 느릴 뿐 화면은 나온다. 여기서 던지면 저장·일괄 재생성 전체가
 * 멈추는데, 그건 굽기 실패가 감당할 무게가 아니다.
 *
 * 반면 서명·업로드 자체가 죽은 상황은 호출부가 이미 카드 썸네일 경로에서 던져 잡아낸다.
 */
async function renderAndUploadScreenPreviews({
  supabase,
  variantId,
  storagePrefix,
  storageTracker,
  baseTemplateId,
  platform,
  colors,
  candidateSelections,
  bubbleEdits,
  uploadRefs,
  cardPreviewPath,
  signedUrlByPath,
  expectedPaths,
  previous,
}: {
  supabase: ReturnType<typeof createClient>;
  variantId: string;
  /** save() uses a revision prefix; preview regeneration keeps its legacy stable prefix. */
  storagePrefix?: string;
  storageTracker?: StorageUploadTracker;
  baseTemplateId: ThemeTemplateId;
  platform: ThemePlatform;
  colors: ThemeEditOverrides["colors"];
  candidateSelections: SlotCandidateSelections;
  bubbleEdits: ThemeEditOverrides["bubbleEdits"];
  uploadRefs: RemoteSlotUploads;
  cardPreviewPath?: string;
  signedUrlByPath: Record<string, string>;
  expectedPaths: string[];
  previous?: Partial<Record<PreviewScreenId, string>>;
}) {
  // 서명이 하나라도 빠지면 굽지 않는다. 굽지 않으면 모달이 원본을 받아 그리는 폴백으로
  // 떨어질 뿐이다 — 느리지만 정확하다. 판정 근거는 findUnsignedPreviewAssets 주석에 있다.
  const unsignedPaths = findUnsignedPreviewAssets(expectedPaths, signedUrlByPath);
  if (unsignedPaths.length > 0) {
    console.warn(`Screen previews skipped; ${unsignedPaths.length} asset(s) could not be signed.`, unsignedPaths);
    return previous;
  }

  try {
    // 폴백으로 도는 모달 DOM과 같은 함수로 visual을 만든다. 다른 경로로 만들면 구운 이미지와
    // 폴백이 서로 다른 화면이 된다.
    const visual = createSystemTemplatePreviewVisual({
      template: getThemeTemplate(baseTemplateId),
      platform,
      summary: {
        platform,
        colors,
        candidateSelections,
        uploadRefs,
        updatedAt: Date.now(),
        previewMetadata: buildPreviewMetadata({ baseTemplateId, platform, colors, candidateSelections, bubbleEdits, uploadRefs, cardPreviewPath }),
      },
      signedUrls: signedUrlByPath,
    });

    const screens = await generatePreviewScreens(visual);
    const paths: Partial<Record<PreviewScreenId, string>> = { ...previous };
    const previewPathPrefix = `${storagePrefix ?? `system-templates/${variantId}`}/preview`;

    for (const [id, blob] of Object.entries(screens) as Array<[PreviewScreenId, Blob]>) {
      const storagePath = `${previewPathPrefix}/${id}.webp`;
      const { error } = await supabase.storage.from(themePublicBucketName).upload(storagePath, blob, {
        contentType: "image/webp",
        cacheControl: "3600",
        upsert: !storageTracker,
      });
      if (error) throw error;
      if (storageTracker) {
        trackUploadedPath(storageTracker, themePublicBucketName, storagePath);
      }
      paths[id] = storagePath;
    }

    return Object.keys(paths).length > 0 ? paths : undefined;
  } catch (screenError) {
    if (storageTracker) {
      const createdScreenPaths = Array.from(storageTracker.publicPaths).filter(
        (path) =>
          path.startsWith(`${storagePrefix ?? `system-templates/${variantId}`}/preview/`) && !path.endsWith("/card.webp"),
      );
      if (createdScreenPaths.length) {
        await removeTrackedSystemTemplateStorage(supabase, {
          privatePaths: new Set(),
          publicPaths: new Set(createdScreenPaths),
        });
        for (const path of createdScreenPaths) storageTracker.publicPaths.delete(path);
      }
    }
    console.warn("Screen previews could not be generated; the modal falls back to live rendering.", screenError);
    return previous;
  }
}

function resolvePreviewStoragePath(slots: ThemeAssetSlot[], role: ThemeResourceRole, uploadRefs: RemoteSlotUploads, candidateSelections: SlotCandidateSelections) {
  const slot = slots.find((item) => item.role === role);
  if (!slot) return undefined;
  const entries = uploadRefs[slot.id] ?? [];
  // 선택된 항목이 있으면 그 항목만 본다. 경로가 없다고 다른 항목으로 넘어가면 운영자가 고른
  // 것과 다른 그림이 카드/화면 미리보기에 구워져 그대로 발행된다. 선택이 아예 없을 때만
  // 첫 항목으로 떨어진다.
  const selected = getSelectedSharedSlotEntry(slot, uploadRefs, candidateSelections, slots);
  if (selected) {
    return selected.entry.storagePath ?? selected.entry.catalogMetadata?.legacyStoragePath;
  }
  return entries[0]?.storagePath ?? entries[0]?.catalogMetadata?.legacyStoragePath;
}

export function normalizePreviewMetadata(value: SystemTemplatePreviewMetadata | null | undefined): SystemTemplatePreviewMetadata {
  const r2 = normalizeR2PreviewMetadata(value?.r2);
  return {
    cardPreviewPath: value?.cardPreviewPath,
    screenPreviews: value?.screenPreviews,
    generatedAt: value?.generatedAt,
    colors: value?.colors ?? {},
    refs: value?.refs ?? {},
    bubbles: value?.bubbles ?? {},
    ...(r2 ? { r2 } : {}),
  };
}

function normalizeR2PreviewMetadata(value: unknown): SystemTemplatePreviewMetadata["r2"] | undefined {
  if (!isRecord(value)) return undefined;
  const card = normalizeR2PreviewRef(value.card);
  const screens: Partial<Record<PreviewScreenId, { objectKey: string; sha256: string }>> = {};
  if (isRecord(value.screens)) {
    for (const screenId of previewScreenIds) {
      const ref = normalizeR2PreviewRef(value.screens[screenId]);
      if (ref) screens[screenId] = ref;
    }
  }
  if (!card && Object.keys(screens).length === 0) return undefined;
  return {
    ...(card ? { card } : {}),
    ...(Object.keys(screens).length ? { screens } : {}),
  };
}

function normalizeR2PreviewRef(value: unknown) {
  if (!isRecord(value)) return undefined;
  const objectKey = typeof value.objectKey === "string" && value.objectKey.trim() ? value.objectKey : undefined;
  const sha256 = typeof value.sha256 === "string" && /^[0-9a-f]{64}$/.test(value.sha256) ? value.sha256 : undefined;
  return objectKey && sha256 ? { objectKey, sha256 } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
