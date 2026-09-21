import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { CatalogPublishError, sha256Hex } from "@/lib/theme/assetCatalog/publish";
import { CatalogPublishFailure, publishThemeAsset, type PreviewPresetInput } from "@/lib/theme/assetCatalog/publishService";
import { createRegistryStore } from "@/lib/theme/assetCatalog/registryStore";
import { getCatalogPublisherAccessToken, putCatalogObject, readCatalogStorageConfig } from "@/lib/theme/assetCatalog/gcsCatalog";
import { getPreviewBucket } from "@/lib/theme/assetCatalog/r2Preview";
import { adminLogicalAssetId, canonicalVariantKey, templateLogicalAssetId } from "@/lib/theme/assetCatalog/logicalAssetId";
import { pickerPreviewPresetKey } from "@/lib/theme/assetCatalog/pickerThumbnails";
import { maxCatalogObjectBytes } from "@/lib/theme/assetCatalog/registry";

/**
 * 관리자 publish의 **write shadow** (계획 §15 rollout 1단계).
 *
 * 기존 저장 경로를 대체하지 않는다. 관리자 화면은 지금처럼 브라우저에서 Supabase에 쓰고,
 * 저장이 성공한 **뒤에** 이 라우트로 같은 바이트를 보내 GCS catalog·R2 preview·registry에
 * 병행 기록한다. 읽기는 아직 legacy다.
 *
 * 그래서 이 라우트의 실패는 저장 실패가 아니다. 호출부는 오류를 삼키고 진행해야 한다 —
 * 병행 기록이 안 됐다고 관리자가 에셋을 저장하지 못하면 안 된다.
 *
 * 이 경로가 필요한 이유: 일회성 backfill 스크립트로 기존 67개는 채웠지만, 앞으로 추가되는
 * 추천 에셋은 catalog에도 registry에도 들어가지 않아 썸네일 없이 남는다.
 */

export const dynamic = "force-dynamic";

/** 전환 기간에 병행 기록을 끌 수 있어야 한다. 값이 "1"일 때만 동작한다. */
function isCatalogWriteEnabled() {
  return process.env.ASSET_CATALOG_WRITE_ENABLED?.trim() === "1";
}

const maxPreviewBytes = 2 * 1024 * 1024;
/** 경합 상대는 보통 하나다. 무한 재시도로 관리자 저장을 붙잡아 두지 않는다. */
const maxRevisionConflictRetries = 3;

/**
 * Postgres unique_violation. Supabase JS는 `if (error) throw error`로 이 객체를 그대로 올린다.
 *
 * `CatalogPublishFailure`가 원인을 `cause`로 감싸 올리므로 한 겹 들어가서 본다. 겉만 보면
 * 재시도해야 할 경합을 그냥 실패로 흘려보낸다.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { code?: unknown }).code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  return cause !== undefined && cause !== error && isUniqueViolation(cause);
}

export async function POST(request: Request) {
  const adminAuth = await getCurrentAdmin();
  if (!adminAuth.configured || !adminAuth.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!adminAuth.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  if (!isCatalogWriteEnabled()) {
    // 꺼져 있는 것은 오류가 아니다. 호출부가 조용히 넘어가도록 200으로 알린다.
    return NextResponse.json({ status: "disabled" });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "업로드 데이터를 읽지 못했습니다." }, { status: 400 });
  }

  const source = readSourceId(form);
  if (!source) return NextResponse.json({ error: "에셋 식별자가 올바르지 않습니다." }, { status: 400 });

  const variantKey = readVariantKey(form);
  if (!variantKey) return NextResponse.json({ error: "variantKey가 올바르지 않습니다." }, { status: 400 });

  /**
   * 시스템 템플릿 업로드는 **저장되기 전에** 게시한다.
   *
   * 그래서 관리자 에셋처럼 "원본 행이 이미 있는가"를 확인할 수 없다 — 확인하려는 행이 바로
   * 이 게시 결과를 담아 곧 저장될 행이다. 대신 두 가지에 기댄다.
   *   - 이 라우트는 관리자 인증을 통과해야 한다(위 `getCurrentAdmin`).
   *   - 템플릿이 참조하지 않는 `tpl:*` 행은 **아무 권한도 주지 못한다.** export 판정은 발행된
   *     템플릿의 `upload_refs`를 훑어 만들기 때문이다(`edgeRegistryStore.findTemplateAssetExportAccess`).
   *     저장이 중간에 실패해 남는 행은 쓰이지 않는 채로 남을 뿐이다.
   *
   * 식별자는 편집기가 만든 업로드 항목 id라 UUID가 아니다(`android-common-splash:upload:1789…`).
   * 모양만 검사해 registry에 쓰레기 논리 ID가 들어가지 않게 한다.
   */
  if (source.kind === "template") {
    if (!isTemplateUploadEntryId(source.sourceId)) {
      return NextResponse.json({ error: "템플릿 업로드 식별자가 올바르지 않습니다." }, { status: 400 });
    }
  } else {
    if (!isUuid(source.sourceId)) {
      return NextResponse.json({ error: "관리자 에셋 식별자가 올바르지 않습니다." }, { status: 400 });
    }

    try {
      const sourceExists = await adminPublishSourceExists(createAdminClient(), source.sourceId, variantKey);
      if (!sourceExists) return NextResponse.json({ error: "관리자 에셋 또는 플랫폼 variant를 찾을 수 없습니다." }, { status: 404 });
    } catch (error) {
      console.error("Catalog publish source lookup failed", error);
      return NextResponse.json({ error: "관리자 에셋을 확인하지 못했습니다." }, { status: 500 });
    }
  }

  const canonical = form.get("canonical");
  if (!(canonical instanceof File)) return NextResponse.json({ error: "원본 파일이 없습니다." }, { status: 400 });
  if (canonical.size > maxCatalogObjectBytes) return NextResponse.json({ error: "원본이 너무 큽니다." }, { status: 413 });

  const requestedRevision = form.get("revision");
  const revision = requestedRevision === null
    ? undefined
    : Number(requestedRevision);
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) {
    return NextResponse.json({ error: "revision이 올바르지 않습니다." }, { status: 400 });
  }

  const previews: PreviewPresetInput[] = [];
  const preview = form.get("preview");
  if (preview instanceof File) {
    if (preview.size > maxPreviewBytes) return NextResponse.json({ error: "미리보기가 너무 큽니다." }, { status: 413 });
    previews.push({
      presetKey: pickerPreviewPresetKey,
      bytes: new Uint8Array(await preview.arrayBuffer()),
      contentType: "image/webp",
    });
  }

  // 실패 로그에서도 실제로 시도한 revision을 봐야 한다. 자동 증가일 때 `revision`은
  // undefined라, 그 값을 찍으면 운영자가 어느 revision이 실패했는지 알 수 없다.
  let attemptedRevision = revision;
  try {
    const config = readCatalogStorageConfig();
    const accessToken = await getCatalogPublisherAccessToken(config);

    const store = createRegistryStore();
    const canonicalBytes = new Uint8Array(await canonical.arrayBuffer());
    const publishOnce = (attempt: number) => publishThemeAsset(
      {
        logicalAssetId: source.logicalAssetId,
        revision: attempt,
        variantKey,
        canonical: {
          fileName: canonical.name,
          mimeType: canonical.type || "image/png",
          bytes: canonicalBytes,
        },
        previews,
      },
      {
        store,
        previewBucket: getPreviewBucket(),
        uploadCatalogObject: async (input) => {
          const uploaded = await putCatalogObject({ config, accessToken, ...input });
          return { generation: uploaded.generation, sizeBytes: uploaded.sizeBytes };
        },
      },
    );

    /**
     * revision 자동 증가는 read-modify-write라 동시 publish가 같은 값을 집을 수 있다.
     * `unique (logical_asset_id, revision, variant_key)`가 두 번째 쓰기를 23505로 막는데,
     * 그대로 두면 shadow write가 통째로 실패한다.
     *
     * 재시도는 안전하다 — 바이트 업로드는 `ifGenerationMatch=0`으로 걸고 412(이미 존재)를
     * 재사용으로 처리하므로 같은 객체를 다시 올리지 않는다. 명시적 revision 요청은 재시도하지
     * 않는다. 그 경우 충돌은 경합이 아니라 호출자가 이미 있는 revision을 지정한 것이다.
     */
    /**
     * 같은 바이트가 이미 active면 **새 revision을 만들지 않고 그것을 재사용한다.**
     *
     * revision은 "내용의 이름"이다. 같은 내용에 번호를 새로 붙이면 두 가지가 깨진다.
     *   - 저장할 때마다 revision이 늘고 직전 것이 retire된다. 같은 템플릿을 동시에 두 번
     *     저장하면 늦게 활성화된 쪽이 먼저 저장된 쪽의 참조를 죽여, 그 참조를 들고 있는
     *     upload_refs가 export에서 `catalog_asset_revision_mismatch`로 실패한다.
     *   - 내용이 같은 객체와 R2 파생물이 계속 쌓인다.
     *
     * 재사용하면 `publishThemeAsset`의 same-sha active 분기를 타 `already-active`로 끝나고,
     * 비어 있던 preview가 있으면 그것만 채운다. 내용이 다르면 종전대로 다음 번호를 집는다.
     */
    const activeRecord = revision === undefined
      ? await store.findActive({ logicalAssetId: source.logicalAssetId, variantKey })
      : null;
    const reusableRevision = activeRecord && activeRecord.sha256 === await sha256Hex(canonicalBytes)
      ? activeRecord.revision
      : undefined;

    let result;
    for (let attemptIndex = 0; ; attemptIndex += 1) {
      // 상태와 무관한 최대 revision을 본다. active만 보면 다른 publish가 만들어 둔 staged 행이
      // 보이지 않아 같은 번호를 다시 집고, 재시도가 영원히 같은 충돌을 반복한다.
      const latestRevision = revision === undefined && reusableRevision === undefined
        ? await store.findLatestRevision({ logicalAssetId: source.logicalAssetId, variantKey })
        : 0;
      const nextRevision = revision ?? reusableRevision ?? (latestRevision + 1);
      attemptedRevision = nextRevision;
      try {
        result = await publishOnce(nextRevision);
        break;
      } catch (error) {
        const canRetry = revision === undefined && attemptIndex < maxRevisionConflictRetries && isUniqueViolation(error);
        if (!canRetry) throw error;
        console.warn("Catalog revision conflict; retrying", JSON.stringify({
          logicalAssetId: source.logicalAssetId,
          variantKey,
          revision: nextRevision,
          attempt: attemptIndex + 1,
        }));
      }
    }

    if (source.kind === "admin") {
      const admin = createAdminClient();
      const table = variantKey === canonicalVariantKey ? "admin_assets" : "admin_asset_variants";
      const query = admin
        .from(table)
        .update({ asset_object_id: result.record.id })
        .eq(variantKey === canonicalVariantKey ? "id" : "asset_id", source.sourceId);
      const linked = variantKey === canonicalVariantKey ? query : query.eq("platform", variantKey);
      const { data: link, error: linkError } = await linked.select("id").maybeSingle();
      if (linkError) throw linkError;
      if (!link) throw new Error("Catalog object link target was not found.");
    }

    return NextResponse.json({
      status: result.status,
      logicalAssetId: result.record.logicalAssetId,
      revision: result.record.revision,
      objectKey: result.record.gcsObjectKey,
      previewsSkipped: result.previewsSkipped,
      /**
       * 호출부가 catalog 참조를 **자기 저장 레코드에 적어 넣을 수 있도록** registry가 확정한
       * 값을 함께 준다. 시스템 템플릿 저장은 이 값으로 `catalogMetadata`를 만든다. 호출부가
       * 파일에서 다시 추론하면 registry와 어긋날 수 있고, 어긋나면 Builder가 dimension 대조에서
       * 거절한다.
       */
      record: {
        variantKey: result.record.variantKey,
        fileName: result.record.fileName,
        mimeType: result.record.mimeType,
        size: result.record.sizeBytes,
        sourceScale: result.record.sourceScale,
        width: result.record.width,
        height: result.record.height,
        pngSignatureVerified: result.record.pngSignatureVerified,
      },
    });
  } catch (error) {
    // 호출자 오류(잘못된 revision·PNG가 아님 등)와 인프라 실패를 구분해 돌려준다.
    if (error instanceof CatalogPublishError) {
      return NextResponse.json({ error: "에셋을 게시할 수 없습니다.", reason: error.code }, { status: 400 });
    }
    const orphanCandidates = error instanceof CatalogPublishFailure ? error.orphanCandidates : [];
    console.error("Catalog write shadow failed", JSON.stringify({
      logicalAssetId: source.logicalAssetId,
      revision: attemptedRevision,
      variantKey,
      orphanCandidates,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
    return NextResponse.json({ error: "에셋 병행 기록에 실패했습니다." }, { status: 500 });
  }
}

/**
 * 논리 자산 id는 서버에서 만든다.
 *
 * 클라이언트가 `logicalAssetId`를 통째로 보내면 접두를 위조해 다른 네임스페이스의 행을 건드릴 수
 * 있다. 출처(`kind`)와 원본 id만 받고 접두는 여기서 붙인다.
 */
function readSourceId(form: FormData) {
  const kind = form.get("kind");
  const sourceId = form.get("sourceId");
  if (typeof sourceId !== "string" || !sourceId.trim()) return null;
  if (kind === "admin") return { kind, sourceId: sourceId.trim(), logicalAssetId: adminLogicalAssetId(sourceId.trim()) };
  if (kind === "template") return { kind, sourceId: sourceId.trim(), logicalAssetId: templateLogicalAssetId(sourceId.trim()) };
  return null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return uuidPattern.test(value);
}

/**
 * 편집기가 만든 업로드 항목 id의 모양.
 *
 * `android-common-splash:upload:1789237594950`처럼 슬롯 id·용도·타임스탬프를 콜론으로 잇거나,
 * 추천 에셋에서 온 항목은 UUID 그대로다. 둘 다 통과시키되 registry 논리 ID에 들어가도 되는
 * 문자만 허용한다.
 */
const templateUploadEntryIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,199}$/;

function isTemplateUploadEntryId(value: string) {
  return templateUploadEntryIdPattern.test(value);
}

async function adminPublishSourceExists(
  admin: ReturnType<typeof createAdminClient>,
  sourceId: string,
  variantKey: "canonical" | "android" | "ios",
) {
  if (variantKey === canonicalVariantKey) {
    const { data, error } = await admin.from("admin_assets").select("id").eq("id", sourceId).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  const { data, error } = await admin
    .from("admin_asset_variants")
    .select("id")
    .eq("asset_id", sourceId)
    .eq("platform", variantKey)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function readVariantKey(form: FormData): "canonical" | "android" | "ios" | null {
  const value = form.get("variantKey");
  if (value === null || value === "canonical") return canonicalVariantKey;
  return value === "android" || value === "ios" ? value : null;
}
