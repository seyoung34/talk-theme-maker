import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { CatalogPublishError } from "@/lib/theme/assetCatalog/publish";
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

/** Postgres unique_violation. Supabase JS는 `if (error) throw error`로 이 객체를 그대로 올린다. */
function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
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
    let result;
    for (let attemptIndex = 0; ; attemptIndex += 1) {
      const active = revision === undefined ? await store.findActive({ logicalAssetId: source.logicalAssetId, variantKey }) : null;
      const nextRevision = revision ?? ((active?.revision ?? 0) + 1);
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

function readVariantKey(form: FormData): "canonical" | "android" | "ios" | null {
  const value = form.get("variantKey");
  if (value === null || value === "canonical") return canonicalVariantKey;
  return value === "android" || value === "ios" ? value : null;
}
