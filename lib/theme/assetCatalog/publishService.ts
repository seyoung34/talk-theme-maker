import {
  CatalogPublishError,
  planCatalogActivation,
  planCatalogPublication,
  sha256Hex,
  type CatalogSourceInput,
} from "@/lib/theme/assetCatalog/publish";
import type { ThemeAssetObjectRecord, ThemeAssetR2Preview } from "@/lib/theme/assetCatalog/registry";
import type { RegistryStore } from "@/lib/theme/assetCatalog/registryStore";
import { previewObjectKey, putPreviewObject, type PreviewBucket, type PreviewContentType } from "@/lib/theme/assetCatalog/r2Preview";

/**
 * 관리자 publish의 단일 진입점 (계획 §7.1).
 *
 * 순서가 계약이다. GCS/R2 객체를 모두 검증한 **뒤에** DB active pointer를 옮긴다. 중간에서 끊겨도
 * 기존 active revision은 손상되지 않고, 재시도는 같은 결과로 수렴한다.
 *
 * 저장소 접근은 전부 주입받는다. 자격증명 없이 순서·멱등성·실패 처리를 검증하기 위해서다.
 */

export type CatalogObjectUploader = (input: {
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
  expectedSizeBytes: number;
}) => Promise<{ generation: string; sizeBytes: number }>;

export type PreviewPresetInput = {
  readonly presetKey: string;
  readonly bytes: Uint8Array;
  readonly contentType: PreviewContentType;
};

export type PublishThemeAssetInput = {
  logicalAssetId: string;
  revision: number;
  variantKey: string;
  canonical: CatalogSourceInput;
  previews?: readonly PreviewPresetInput[];
};

export type PublishThemeAssetResult = {
  readonly record: ThemeAssetObjectRecord;
  readonly status: "published" | "already-active";
  /** R2 바인딩이 없어 preview를 올리지 못한 경우. 호출부가 legacy 경로로 fallback한다. */
  readonly previewsSkipped: boolean;
  /** 업로드했지만 어떤 레코드도 참조하지 않게 된 객체. 비동기 GC 대상이다. */
  readonly orphanCandidates: readonly string[];
};

export async function publishThemeAsset(
  input: PublishThemeAssetInput,
  deps: {
    store: RegistryStore;
    uploadCatalogObject: CatalogObjectUploader;
    previewBucket: PreviewBucket | null;
  },
): Promise<PublishThemeAssetResult> {
  const plan = await planCatalogPublication({
    logicalAssetId: input.logicalAssetId,
    revision: input.revision,
    variantKey: input.variantKey,
    source: input.canonical,
  });

  const existing = await deps.store.findRevision({
    logicalAssetId: input.logicalAssetId,
    revision: input.revision,
    variantKey: input.variantKey,
  });

  // 이미 끝난 publish의 재시도. 아무것도 다시 올리지 않는다.
  if (existing?.status === "active") {
    return { record: existing, status: "already-active", previewsSkipped: false, orphanCandidates: [] };
  }
  if (existing && existing.status !== "staged") {
    throw new CatalogPublishError("REVISION_NOT_FORWARD", `revision ${input.revision} is ${existing.status}`);
  }
  // 같은 revision을 다른 바이트로 다시 올리는 것은 허용하지 않는다. revision이 곧 내용의 이름이다.
  if (existing && existing.sha256 !== plan.sha256) {
    throw new CatalogPublishError("REVISION_NOT_FORWARD", `revision ${input.revision} already staged with different bytes`);
  }

  /**
   * revision 순서는 바이트를 올리기 **전에** 본다.
   *
   * 뒤에서 걸리면 이미 올라간 객체와 staged 레코드가 남아 호출자 오류가 인프라 실패처럼 보고된다.
   * 활성화 직전에 `planCatalogActivation()`이 최신 상태로 한 번 더 확인하므로, 이 검사는
   * 빠른 거절이지 유일한 방어선이 아니다.
   */
  const activeBeforeUpload = await deps.store.findActive({
    logicalAssetId: input.logicalAssetId,
    variantKey: input.variantKey,
  });
  if (activeBeforeUpload && activeBeforeUpload.revision >= input.revision) {
    throw new CatalogPublishError(
      "REVISION_NOT_FORWARD",
      `active revision ${activeBeforeUpload.revision} >= ${input.revision}`,
    );
  }

  const uploaded = await deps.uploadCatalogObject({
    objectKey: plan.objectKey,
    bytes: input.canonical.bytes,
    contentType: plan.source.mimeType,
    expectedSizeBytes: plan.source.sizeBytes,
  });

  const staged = existing ?? await deps.store.insertStaged({
    logicalAssetId: input.logicalAssetId,
    revision: input.revision,
    variantKey: input.variantKey,
    gcsObjectKey: plan.objectKey,
    gcsGeneration: uploaded.generation,
    sha256: plan.sha256,
    sizeBytes: plan.source.sizeBytes,
    mimeType: plan.source.mimeType,
    fileName: plan.source.fileName,
    sourceScale: plan.source.sourceScale,
    width: plan.source.width,
    height: plan.source.height,
    pngSignatureVerified: plan.source.pngSignatureVerified,
  });

  try {
    const { previews, previewsSkipped } = await uploadPreviews({
      bucket: deps.previewBucket,
      presets: input.previews ?? [],
      revision: input.revision,
    });
    if (Object.keys(previews).length) await deps.store.setPreviews(staged.id, previews);

    const currentActive = await deps.store.findActive({
      logicalAssetId: input.logicalAssetId,
      variantKey: input.variantKey,
    });
    const activation = planCatalogActivation({ staged, currentActive: currentActive ?? undefined });
    if (activation) await deps.store.activate(activation);

    const record = await deps.store.findRevision({
      logicalAssetId: input.logicalAssetId,
      revision: input.revision,
      variantKey: input.variantKey,
    });
    if (!record) throw new CatalogPublishError("REVISION_NOT_FORWARD", "record disappeared after activation");

    return { record, status: "published", previewsSkipped, orphanCandidates: [] };
  } catch (error) {
    // staged를 지우지 않는다. 어떤 객체가 떠 있는지 GC가 알아야 하고, 참조가 남아 있을 수도 있다.
    await deps.store.markFailed(staged.id).catch(() => undefined);
    const references = await deps.store.countReferences(plan.objectKey).catch(() => 1);
    throw new CatalogPublishFailure(error, references === 0 ? [plan.objectKey] : []);
  }
}

/** 실패를 그대로 던지되, 비동기 GC가 볼 고아 후보를 함께 실어 보낸다. */
export class CatalogPublishFailure extends Error {
  constructor(
    readonly cause: unknown,
    readonly orphanCandidates: readonly string[],
  ) {
    super(cause instanceof Error ? cause.message : "catalog_publish_failed");
    this.name = "CatalogPublishFailure";
  }
}

async function uploadPreviews(input: {
  bucket: PreviewBucket | null;
  presets: readonly PreviewPresetInput[];
  revision: number;
}) {
  if (!input.presets.length) return { previews: {}, previewsSkipped: false };
  // 바인딩이 없는 환경(`next dev`)에서는 preview만 건너뛰고 catalog publish는 계속한다.
  // 호출부가 기존 Supabase `theme-public` 경로로 채운다.
  if (!input.bucket) return { previews: {}, previewsSkipped: true };

  const previews: Record<string, ThemeAssetR2Preview> = {};
  for (const preset of input.presets) {
    const sha256 = await sha256Hex(preset.bytes);
    const objectKey = previewObjectKey(sha256, preset.contentType);
    await putPreviewObject({
      bucket: input.bucket,
      objectKey,
      bytes: preset.bytes,
      contentType: preset.contentType,
      sha256,
      sourceRevision: input.revision,
    });
    previews[preset.presetKey] = { objectKey, sha256 };
  }
  return { previews, previewsSkipped: false };
}
