import { createClient } from "@/lib/supabase/client";
import { readJsonResponse } from "@/lib/shared/api/http";
import type { AdminAssetListPayload } from "@/lib/theme/adminAssetList";
import { shadowPublishThemeAsset } from "@/lib/theme/assetCatalog/shadowPublishClient";
import {
  getThemeAssetSignedUrls,
  sanitizeStoragePathPart,
  storagePathToFile,
  themeAssetsBucketName,
} from "@/lib/theme/remoteAssets";
import { themeAssetCacheControl } from "@/lib/theme/themeAssetSigning";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";
import type { BubbleFamilyDesignSpec } from "@/lib/theme/bubbleBuilder";
import {
  assertValidAdminAssetCandidateInput,
  canonicalAdminAssetToCandidate,
  createAdminAssetPersistencePayload,
  isValidBubbleAdjustment,
  isValidBubbleBuilderTargets,
  mapCanonicalAdminAssetRow,
  type AdminAssetCandidate,
  type AdminAssetCandidateInput,
  type AdminAssetCandidateUpdate,
  type AdminAssetKind,
  type AdminAssetListOptions,
  type AdminAssetPage,
  type AdminAssetTargetInput,
  type AdminAssetBubbleDecoration,
  type AdminBubbleSpec,
  type AdminAssetAnalysis,
} from "@/lib/theme/adminAssetDomain";

export {
  assertValidAdminAssetCandidateInput,
  bubbleAdjustmentToSpec,
  bubbleSpecToAdjustment,
  canonicalAdminAssetToCandidate,
  createDefaultBubbleAdjustment,
  getAdminAssetKindLabel,
  inferAdminAssetKind,
  legacyRoleFromKind,
  mapCanonicalAdminAssetRow,
  type AdminAssetCandidate,
  type AdminAssetCandidateInput,
  type AdminAssetCandidateUpdate,
  type AdminAssetKind,
  type AdminAssetListOptions,
  type AdminAssetPage,
  type AdminAssetPlatform,
  type AdminAssetRecommendationItem,
  type AdminAssetAnalysis,
  type AdminAssetTarget,
  type AdminAssetTargetInput,
  type AdminAssetTargetKind,
  type AdminAssetPlatformVariant,
  type AdminAssetBubbleDecoration,
  type AdminAssetBubbleDesign,
  type AdminBubbleAdjustment,
  type AdminBubbleSpec,
  type CanonicalAdminAsset,
} from "@/lib/theme/adminAssetDomain";

const adminAssetSelect = [
  "id",
  "slot_role",
  "platform",
  "asset_kind",
  "analysis",
  "bubble_adjustment",
  "title",
  "note",
  "tags",
  "file_name",
  "mime_type",
  "storage_path",
  "asset_object_id",
  "enabled",
  "created_at",
  "updated_at",
  "admin_asset_targets(id,asset_id,platform,slot_role,target_kind,priority,enabled)",
  "admin_asset_bubble_specs(asset_id,android_markers,ios_insets,ios_stretch,geometry)",
  "admin_asset_variants(id,asset_id,platform,storage_path,asset_object_id,file_name,mime_type,analysis)",
  "admin_asset_bubble_designs!admin_asset_bubble_designs_asset_id_fkey(asset_id,recipe,geometry_mode,admin_asset_bubble_decorations(layer_id,storage_path,file_name,mime_type))",
].join(",");

export async function listAdminAssetLibrary(options: {
  readonly assetKind: AdminAssetKind | "legacy";
}): Promise<AdminAssetListPayload> {
  const params = new URLSearchParams({ assetKind: options.assetKind });
  const response = await fetch(`/api/admin/theme-assets?${params.toString()}`, { cache: "no-store" });
  const payload = await readJsonResponse<AdminAssetListPayload & { readonly error?: string }>(response);
  if (!response.ok) throw new Error(payload.error ?? "관리 후보를 불러오지 못했습니다.");
  return { items: payload.items ?? [], truncated: Boolean(payload.truncated) };
}

/** 편집기 피커가 쓰는 추천 목록. 등록된 후보는 kind/target 규칙으로만 추천한다. */
export async function listRecommendedAssetCandidatePage(options: Required<Pick<AdminAssetListOptions, "platform" | "assetKind">> & AdminAssetListOptions): Promise<AdminAssetPage> {
  const params = new URLSearchParams({
    platform: options.platform,
    assetKind: options.assetKind,
    limit: String(Math.min(50, Math.max(1, options.limit ?? 24))),
  });
  if (options.slotRole) params.set("slotRole", options.slotRole);
  if (options.cursor) params.set("cursor", options.cursor);
  const response = await fetch(`/api/theme-assets/recommended?${params.toString()}`, { cache: "no-store" });
  const payload = await readJsonResponse<AdminAssetPage & { readonly error?: string }>(response);
  if (!response.ok) throw new Error(payload.error ?? "추천 에셋을 불러오지 못했습니다.");
  return { items: payload.items ?? [], nextCursor: payload.nextCursor };
}

export async function saveAdminAssetCandidate(input: AdminAssetCandidateInput): Promise<AdminAssetCandidate> {
  assertValidAdminAssetCandidateInput(input);
  const supabase = createClient();
  const id = input.id ?? crypto.randomUUID();
  // 기존 후보의 바이트를 교체할 때 같은 Storage 경로를 upsert하면 DB 저장이 실패한 순간에도
  // 기존 row가 새 바이트를 바라보게 된다. revision 경로를 써야 실패 시 이전 후보를 보존할 수 있다.
  const storagePath = input.id
    ? `admin-assets/${id}/revisions/${crypto.randomUUID()}/${sanitizeStoragePathPart(input.fileName)}`
    : `admin-assets/${id}/${sanitizeStoragePathPart(input.fileName)}`;
  const mimeType = input.mimeType || "application/octet-stream";

  const { error: uploadError } = await supabase.storage.from(themeAssetsBucketName).upload(storagePath, input.blob, {
    contentType: mimeType,
    cacheControl: themeAssetCacheControl,
    upsert: !input.id,
  });
  if (uploadError) throw uploadError;

  // 재저장이면 지금 DB가 가리키는 경로를 먼저 기억한다. 커밋 뒤에 지울 대상이다.
  const previousPath = input.id ? await readAdminAssetStoragePath(id) : undefined;
  let persisted = false;

  try {
    const payload = createAdminAssetPersistencePayload(input, id, storagePath, null);
    /**
     * 부모·target·말풍선 spec·catalog 포인터를 **한 트랜잭션**에서 쓴다.
     *
     * 예전에는 이 넷을 브라우저에서 순차 실행했다. target을 지우고 다시 넣는 사이에 끊기면
     * target이 없는 에셋이 남는데, 그 상태는 오류를 내지 않고 적용 범위만 조용히 좁아진다
     * (`parseTargets`가 부모 컬럼으로 legacy target 하나를 만들어 낸다).
     *
     * `created_by`는 RPC 안에서 `auth.uid()`로 채운다 — 클라이언트가 보낸 값을 믿을 이유가 없다.
     */
    const { error } = await supabase.rpc("upsert_admin_asset_bundle", {
      p_asset: payload.asset,
      p_targets: payload.targets,
      p_variants: [],
      p_bubble_spec: payload.bubbleSpec ?? null,
    });
    if (error) throw error;
    // 여기부터는 DB transaction이 끝났다. 이후 조회·정리 단계가 실패해도 새 row가
    // 가리키는 바이트를 삭제하면 안 된다.
    persisted = true;

    /**
     * catalog 병행 기록 (계획 §15 rollout 1단계 write shadow).
     *
     * 저장이 끝난 **뒤에** 부르고 실패는 삼킨다. 기존 Supabase 저장이 진짜이고 이건 그림자다.
     * 이게 없으면 앞으로 추가되는 추천 에셋이 registry에 들어가지 않아 피커 썸네일 없이 남는다.
     */
    void shadowPublishThemeAsset({
      kind: "admin",
      sourceId: id,
      canonical: new File([input.blob], input.fileName, { type: mimeType }),
    });

    const saved = await getAdminAssetCandidate(id);
    // 커밋이 끝난 뒤에야 이전 revision을 지운다. 먼저 지우면 RPC 실패 시 되돌아갈 바이트가 없다.
    if (previousPath && previousPath !== storagePath) {
      await supabase.storage.from(themeAssetsBucketName).remove([previousPath]);
    }
    return saved;
  } catch (error) {
    // RPC 이전 실패만 보상한다. 커밋 후 getAdminAssetCandidate/이전 revision 정리 등이
    // 실패한 경우에는 DB가 새 경로를 가리키므로 바이트를 보존하고 다음 정리에서 재시도한다.
    if (!persisted) await supabase.storage.from(themeAssetsBucketName).remove([storagePath]);
    throw error;
  }
}

/** 재저장 전 DB가 가리키던 경로. 못 읽어도 저장을 막지 않는다 — 정리를 한 번 건너뛸 뿐이다. */
async function readAdminAssetStoragePath(id: string): Promise<string | undefined> {
  try {
    const { data } = await createClient().from("admin_assets").select("storage_path").eq("id", id).maybeSingle();
    const path = (data as { storage_path?: unknown } | null)?.storage_path;
    return typeof path === "string" ? path : undefined;
  } catch {
    return undefined;
  }
}

export async function updateAdminAssetCandidate(id: string, input: AdminAssetCandidateUpdate): Promise<AdminAssetCandidate> {
  const title = input.title.trim();
  if (!title || title.length > 100) throw new Error("INVALID_ASSET_TITLE");
  if (input.bubbleAdjustment && !isValidBubbleAdjustment(input.bubbleAdjustment)) throw new Error("INVALID_BUBBLE_ADJUSTMENT");

  const supabase = createClient();
  const bubbleSpec = input.bubbleSpec;
  /**
   * 바이트를 바꾸지 않는 수정도 한 트랜잭션으로 처리한다.
   *
   * 저장 경로와 같은 이유다 — 제목만 고치려던 요청이 target 교체 중간에 끊기면 적용 범위를
   * 잃는다. `asset_object_id`는 **건드리지 않는다**: 내용이 그대로인데 포인터를 끊으면
   * export가 legacy 경로로 떨어진다.
   *
   * 넘기지 않은 인자는 "그대로 둔다"는 뜻이다. 특히 `p_targets`가 null이면 target을 지우지 않는다.
   */
  const { error } = await supabase.rpc("update_admin_asset_metadata", {
    p_asset_id: id,
    p_title: title,
    p_enabled: typeof input.enabled === "boolean" ? input.enabled : null,
    p_bubble_adjustment: input.bubbleAdjustment ?? null,
    p_targets: input.targets
      ? input.targets.map((target) => ({
          platform: target.platform,
          slot_role: target.slotRole ?? null,
          target_kind: target.targetKind,
          priority: target.priority,
          enabled: target.enabled,
        }))
      : null,
    p_bubble_spec: bubbleSpec
      ? {
          android_markers: bubbleSpec.androidMarkers,
          ios_insets: bubbleSpec.iosInsets,
          ios_stretch: bubbleSpec.iosStretch,
          geometry: bubbleSpec.geometry ?? null,
        }
      : null,
  });
  if (error) throw error;

  return getAdminAssetCandidate(id);
}

export async function getAdminAssetCandidate(id: string): Promise<AdminAssetCandidate> {
  const supabase = createClient();
  const { data, error } = await supabase.from("admin_assets").select(adminAssetSelect).eq("id", id).single();
  if (error) throw error;
  const canonical = mapCanonicalAdminAssetRow(data);
  const previewUrls = await getThemeAssetSignedUrls([canonical.storagePath, ...canonical.variants.map((variant) => variant.storagePath)]);
  return canonicalAdminAssetToCandidate(canonical, previewUrls[canonical.storagePath], previewUrls);
}

export type AdminAssetPlatformVariantInput = {
  readonly platform: ThemePlatform;
  readonly file: File;
  readonly analysis?: AdminAssetAnalysis;
};

export type AdminBubbleBuilderCandidateInput = {
  readonly id?: string;
  readonly title: string;
  readonly slotRole: ThemeResourceRole;
  readonly targets: readonly AdminAssetTargetInput[];
  readonly variants: readonly AdminAssetPlatformVariantInput[];
  readonly bubbleSpec: AdminBubbleSpec;
  readonly recipe: BubbleFamilyDesignSpec;
  readonly decorations: Partial<Record<string, File>>;
  readonly geometryMode?: "generated" | "manual";
  /** legacy DB column; new saves are always candidates. */
  readonly enabled?: boolean;
};

export async function saveAdminBubbleBuilderCandidate(input: AdminBubbleBuilderCandidateInput): Promise<AdminAssetCandidate> {
  const title = input.title.trim();
  if (!title || title.length > 100) throw new Error("INVALID_ASSET_TITLE");
  const androidVariant = input.variants.find((variant) => variant.platform === "android");
  const iosVariant = input.variants.find((variant) => variant.platform === "ios");
  if (!androidVariant || !iosVariant || input.variants.length !== 2) throw new Error("INVALID_PLATFORM_VARIANTS");
  if (!isValidBubbleBuilderTargets(input.targets, input.slotRole)) {
    throw new Error("INVALID_BUBBLE_TARGETS");
  }
  const layers = input.recipe.design.decorations ?? [];
  if (layers.some((layer) => !input.decorations[layer.id])) throw new Error("MISSING_BUBBLE_DECORATION");

  const supabase = createClient();
  const id = input.id ?? crypto.randomUUID();
  const previous = input.id ? await getAdminAssetCandidate(input.id) : undefined;
  const revision = crypto.randomUUID();
  const uploadedPaths: string[] = [];
  let persisted = false;
  const variantRows = input.variants.map((variant) => ({
    platform: variant.platform,
    storage_path: `admin-assets/${id}/revisions/${revision}/${variant.platform}/${sanitizeStoragePathPart(variant.file.name)}`,
    file_name: variant.file.name,
    mime_type: variant.file.type || "image/png",
    analysis: variant.analysis ?? null,
  }));
  const decorationRows = layers.map((layer) => {
    const file = input.decorations[layer.id];
    if (!file) throw new Error("MISSING_BUBBLE_DECORATION");
    return {
      layer_id: layer.id,
      storage_path: `admin-assets/${id}/revisions/${revision}/decorations/${sanitizeStoragePathPart(layer.id)}/${sanitizeStoragePathPart(file.name)}`,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file,
    };
  });

  try {
    for (const [index, variant] of input.variants.entries()) {
      const row = variantRows[index];
      if (!row) throw new Error("INVALID_PLATFORM_VARIANTS");
      const { error } = await supabase.storage.from(themeAssetsBucketName).upload(row.storage_path, variant.file, { contentType: row.mime_type, cacheControl: themeAssetCacheControl, upsert: false });
      if (error) throw error;
      uploadedPaths.push(row.storage_path);
    }
    for (const decoration of decorationRows) {
      const { error } = await supabase.storage.from(themeAssetsBucketName).upload(decoration.storage_path, decoration.file, { contentType: decoration.mime_type, cacheControl: themeAssetCacheControl, upsert: false });
      if (error) throw error;
      uploadedPaths.push(decoration.storage_path);
    }

    const primary = variantRows.find((variant) => variant.platform === "android");
    if (!primary) throw new Error("INVALID_PLATFORM_VARIANTS");
    const { error } = await supabase.rpc("upsert_admin_asset_bundle", {
      p_asset: {
        id,
        slot_role: input.slotRole,
        platform: "all",
        asset_kind: "bubble",
        analysis: primary.analysis,
        bubble_adjustment: {
          markers: input.bubbleSpec.androidMarkers,
          insets: input.bubbleSpec.iosInsets,
          stretch: input.bubbleSpec.iosStretch,
        },
        title,
        tags: [],
        file_name: primary.file_name,
        mime_type: primary.mime_type,
        storage_path: primary.storage_path,
        enabled: input.enabled ?? true,
      },
      p_targets: input.targets.map((target) => ({
        platform: target.platform,
        slot_role: target.slotRole ?? null,
        target_kind: target.targetKind,
        priority: target.priority,
        enabled: target.enabled,
      })),
      p_variants: variantRows,
      p_bubble_spec: {
        android_markers: input.bubbleSpec.androidMarkers,
        ios_insets: input.bubbleSpec.iosInsets,
        ios_stretch: input.bubbleSpec.iosStretch,
        geometry: input.bubbleSpec.geometry ?? null,
      },
      p_bubble_design: { recipe: input.recipe, geometry_mode: input.geometryMode ?? "generated" },
      p_decorations: decorationRows.map((decoration) => ({
        layer_id: decoration.layer_id,
        storage_path: decoration.storage_path,
        file_name: decoration.file_name,
        mime_type: decoration.mime_type,
      })),
    });
    if (error) throw error;
    // The RPC commits the DB bundle atomically. Any failure after this point
    // must retain the new files; deleting them would leave DB rows pointing at
    // missing storage objects.
    persisted = true;

    // 새 variant 바이트가 저장되면 이전 catalog object 연결은 즉시 끊는다. publisher가
    // 성공하기 전까지 추천 API는 legacy field 경로로만 내려가야 stale object를 보낼 수 없다.
    const { error: clearCanonicalLinkError } = await supabase
      .from("admin_assets")
      .update({ asset_object_id: null })
      .eq("id", id);
    if (clearCanonicalLinkError) throw clearCanonicalLinkError;
    const { error: clearVariantLinkError } = await supabase
      .from("admin_asset_variants")
      .update({ asset_object_id: null })
      .eq("asset_id", id);
    if (clearVariantLinkError) throw clearVariantLinkError;

    const saved = await getAdminAssetCandidate(id);
    const stalePaths = previous
      ? [
          ...previous.variants?.map((variant) => variant.storagePath) ?? [],
          ...previous.bubbleDesign?.decorations.map((decoration) => decoration.storagePath) ?? [],
        ].filter((path) => !uploadedPaths.includes(path))
      : [];
    if (stalePaths.length) await supabase.storage.from(themeAssetsBucketName).remove(stalePaths);

    // 플랫폼 variant는 서로 다른 원본이므로 각각 독립된 registry revision으로 게시한다.
    // 저장 응답을 막지 않는 write shadow이며, 실패하면 추천 API가 field 경로에 남는다.
    void Promise.all(input.variants.map((variant) => shadowPublishThemeAsset({
      kind: "admin",
      sourceId: id,
      variantKey: variant.platform,
      canonical: variant.file,
    })));

    return saved;
  } catch (error) {
    if (uploadedPaths.length && !persisted) await supabase.storage.from(themeAssetsBucketName).remove(uploadedPaths);
    throw error;
  }
}

export function withAdminAssetPlatformVariant(asset: AdminAssetCandidate, platform: ThemePlatform): AdminAssetCandidate {
  const variant = asset.variants?.find((item) => item.platform === platform);
  if (!variant) return asset;
  return {
    ...asset,
    analysis: variant.analysis ?? asset.analysis,
    assetObjectId: variant.assetObjectId,
    fileName: variant.fileName,
    mimeType: variant.mimeType,
    storagePath: variant.storagePath,
    previewUrl: variant.previewUrl ?? asset.previewUrl,
  };
}

/**
 * 이 관리 에셋을 catalog 참조로 쓰고 있는 시스템 템플릿 제목들.
 *
 * 삭제는 하드 삭제라 행과 Supabase 바이트를 함께 지운다. 참조하는 템플릿의 내보내기는
 * 계속 동작하지만(발행된 템플릿이 자기 내용물의 권한 근거이고 GCS catalog 객체는 연쇄
 * 삭제되지 않는다), 운영자가 그 사실을 모른 채 지우는 것과 알고 지우는 것은 다르다.
 *
 * `upload_refs`는 슬롯 키가 동적인 jsonb라 서버 필터를 걸 수 없어 훑어서 찾는다. 관리자
 * 화면에서만 쓰고 템플릿 수가 적어 감당할 수 있다. 실패해도 던지지 않는다 — 삭제 확인을
 * 막을 만큼 중요한 정보는 아니다.
 */
export async function findSystemTemplatesUsingAdminAsset(id: string): Promise<string[]> {
  const logicalAssetId = `admin:${id}`;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("system_template_variants")
      .select("upload_refs,system_template_bundles!inner(title)")
      .limit(500);
    if (error) throw error;

    const titles = new Set<string>();
    for (const row of data ?? []) {
      if (!referencesCatalogAsset((row as { upload_refs?: unknown }).upload_refs, logicalAssetId)) continue;
      const bundle = (row as { system_template_bundles?: unknown }).system_template_bundles;
      const record = Array.isArray(bundle) ? bundle[0] : bundle;
      const title = (record as { title?: unknown } | undefined)?.title;
      titles.add(typeof title === "string" && title ? title : "제목 없음");
    }
    return [...titles];
  } catch (error) {
    console.warn("Template usage lookup failed; deleting without the usage warning.", error);
    return [];
  }
}

function referencesCatalogAsset(value: unknown, logicalAssetId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => referencesCatalogAsset(item, logicalAssetId));
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const catalog = record.catalog;
  if (typeof catalog === "object" && catalog !== null && (catalog as { assetId?: unknown }).assetId === logicalAssetId) return true;
  return Object.values(record).some((child) => referencesCatalogAsset(child, logicalAssetId));
}

export async function deleteAdminAssetCandidate(id: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase
    .from("admin_assets")
    .select("storage_path,admin_asset_variants(storage_path),admin_asset_bubble_designs!admin_asset_bubble_designs_asset_id_fkey(admin_asset_bubble_decorations(storage_path))")
    .eq("id", id)
    .maybeSingle();
  const storagePaths = readAdminAssetStoragePaths(data);
  const { error } = await supabase.from("admin_assets").delete().eq("id", id);
  if (error) throw error;
  if (storagePaths.length) await supabase.storage.from(themeAssetsBucketName).remove(storagePaths);
}

export async function adminAssetToFile(asset: AdminAssetCandidate): Promise<File> {
  if (asset.file) return asset.file;
  if (asset.blob) return new File([asset.blob], asset.fileName, { type: asset.mimeType });
  if (asset.previewUrl) {
    const response = await fetch(asset.previewUrl);
    if (response.ok) return new File([await response.blob()], asset.fileName, { type: asset.mimeType });
  }
  return storagePathToFile(asset.storagePath, asset.fileName, asset.mimeType);
}

export async function adminAssetBubbleDecorationToFile(decoration: AdminAssetBubbleDecoration): Promise<File> {
  return storagePathToFile(decoration.storagePath, decoration.fileName, decoration.mimeType);
}

export function describeAdminAssetAnalysis(analysis?: AdminAssetAnalysis): string {
  if (!analysis?.width || !analysis.height) return "크기 미확인";
  return `${analysis.width}x${analysis.height}`;
}

function readAdminAssetStoragePaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const paths = new Set<string>();
  if (typeof record.storage_path === "string") paths.add(record.storage_path);
  if (Array.isArray(record.admin_asset_variants)) {
    for (const variant of record.admin_asset_variants) {
      if (variant && typeof variant === "object" && !Array.isArray(variant) && typeof (variant as Record<string, unknown>).storage_path === "string") paths.add((variant as Record<string, string>).storage_path);
    }
  }
  if (Array.isArray(record.admin_asset_bubble_designs)) {
    for (const design of record.admin_asset_bubble_designs) {
      if (!design || typeof design !== "object" || Array.isArray(design)) continue;
      const decorations = (design as Record<string, unknown>).admin_asset_bubble_decorations;
      if (!Array.isArray(decorations)) continue;
      for (const decoration of decorations) {
        if (decoration && typeof decoration === "object" && !Array.isArray(decoration) && typeof (decoration as Record<string, unknown>).storage_path === "string") paths.add((decoration as Record<string, string>).storage_path);
      }
    }
  }
  return [...paths];
}
