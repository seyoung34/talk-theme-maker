import type { TemplateAssetExportAccess } from "@/lib/theme/assetCatalog/exportAccess";
import { createEdgeRegistryStore, type EdgeRegistryStore } from "@/lib/theme/assetCatalog/edgeRegistryStore";
import {
  collectCatalogSelections,
  hasCatalogAsset,
  resolveCatalogManifest,
  toRegistryLookupKeys,
  type CatalogResolutionFailure,
  type ExportManifestSourceItem,
} from "@/lib/theme/assetCatalog/exportResolve";
import { adminLogicalAssetId, parseLogicalAssetId } from "@/lib/theme/assetCatalog/logicalAssetId";
import { ThemeAssetRegistryError, type ResolvedCatalogManifestItem } from "@/lib/theme/assetCatalog/registry";
import type { CatalogAssetExportAccess } from "@/lib/theme/assetCatalog/exportAccess";
import { isCatalogExportEnabled } from "@/lib/theme/assetCatalog/exportGate";

type PassthroughManifestItem =
  | { readonly path: string; readonly field: string }
  | { readonly path: string; readonly serverAsset: string };

export type WorkerResolvedManifestItem = PassthroughManifestItem | ResolvedCatalogManifestItem;

export class CatalogExportResolutionError extends Error {
  constructor(
    readonly code:
      | "invalid_catalog_asset"
      | "catalog_asset_not_found"
      | "catalog_asset_revision_mismatch"
      | "catalog_asset_not_exportable"
      | "catalog_asset_transform_required"
      | "catalog_asset_not_allowed"
      | "catalog_export_disabled"
      | "catalog_payload_too_large",
    message: string,
    readonly status: number,
    readonly detailReason: CatalogResolutionFailure["reason"],
  ) {
    super(message);
    this.name = "CatalogExportResolutionError";
  }
}

/**
 * Worker route가 브라우저 선택을 registry-backed builder manifest로 바꾼다.
 *
 * catalog가 없는 기존 export는 registry를 조회하지 않고 그대로 통과한다. catalog가 있으면
 * selection만 batch lookup하고, 실패한 ref는 최신 revision으로 몰래 바꾸지 않는다.
 */
export async function resolveCatalogManifestForExport(input: {
  manifest: readonly ExportManifestSourceItem[];
  uploadedInputBytes: number;
  platform: "android" | "ios";
  /** auth.uid()에서 얻은 요청 사용자. template private/draft 소유권 확인에만 사용한다. */
  userId?: string;
  store?: Pick<EdgeRegistryStore, "findActiveByKeys"> & Partial<Pick<EdgeRegistryStore, "findAdminAssetExportAccess" | "findTemplateAssetExportAccess">>;
}) {
  const collected = collectCatalogSelections(input.manifest);
  if (collected.failures.length) throw createCatalogResolutionError(collected.failures[0]);
  if (!collected.selections.length) {
    const manifest = input.manifest.map((item) => {
      if (hasCatalogAsset(item)) throw new Error(`catalog_manifest_unexpected:${item.path}`);
      return stripResourceRole(item);
    });
    return {
      manifest,
      referencedAssetBytes: 0,
      uniqueReferencedAssetBytes: 0,
      referencedAssetFileCount: 0,
    };
  }

  if (!isCatalogExportEnabled(input.platform, {
    userId: input.userId,
    assetIds: collected.selections.map(({ selection }) => selection.assetId),
  })) {
    throw new CatalogExportResolutionError(
      "catalog_export_disabled",
      "현재 catalog 내보내기는 준비 중입니다. 잠시 후 다시 시도해 주세요.",
      503,
      "not_exportable",
    );
  }

  const store = input.store ?? createEdgeRegistryStore();
  const records = await store.findActiveByKeys(toRegistryLookupKeys(collected.selections));
  const accessByAssetId = await readCatalogAssetAccess(store, collected.selections, input.userId);
  let resolution;
  const resolve = () => resolveCatalogManifest({
    manifest: input.manifest,
    records,
    uploadedInputBytes: input.uploadedInputBytes,
    platform: input.platform,
    accessByAssetId,
  });
  try {
    resolution = resolve();
    /**
     * 관리자 정책이 막은 admin ref만 골라 템플릿 멤버십을 한 번 더 본다.
     *
     * 발행된 시스템 템플릿은 자기 내용물의 권한 근거다. 운영자가 추천 에셋을 지우거나
     * (하드 삭제라 Supabase 바이트까지 사라진다) 타겟을 바꿔도, 그 템플릿을 쓰는 사용자의
     * 내보내기는 계속 동작해야 한다 — catalog 도입 전에는 템플릿이 자기 사본을 들고 있어
     * 애초에 영향받지 않던 경로다. GCS catalog 객체는 admin_assets 삭제에 연쇄되지 않으므로
     * 결과물은 예전과 동일하다.
     *
     * 이 조회를 **거부된 뒤에만** 하는 이유는 비용이다. 템플릿 멤버십 조회는 발행된 variant의
     * upload_refs를 통째로 훑는다(슬롯 키가 동적인 jsonb라 서버 필터를 걸 수 없다). 정상적인
     * export마다 그 비용을 치를 이유가 없다 — 정책이 통과하면 결과가 같기 때문이다.
     *
     * 라이선스 문제 등으로 에셋을 정말 회수해야 하면 템플릿에서 빼고 다시 발행해야 한다.
     * 삭제 버튼의 부수효과로 이미 팔린 템플릿이 깨지는 쪽이 더 위험하다.
     */
    const deniedAdminIds = collectDeniedAdminAssetIds(resolution.failures);
    if (deniedAdminIds.length && store.findTemplateAssetExportAccess) {
      const records = await store.findTemplateAssetExportAccess({
        uploadEntryIds: [],
        catalogAssetIds: deniedAdminIds,
        userId: input.userId,
      });
      if (records.length) {
        for (const [logicalAssetId, platforms] of groupPlatformsByAssetId(records)) {
          accessByAssetId.set(logicalAssetId, { kind: "template", platforms: [...platforms] });
        }
        resolution = resolve();
      }
    }
  } catch (error) {
    if (error instanceof ThemeAssetRegistryError && error.code === "REFERENCED_BYTES_EXCEEDED") {
      throw new CatalogExportResolutionError(
        "catalog_payload_too_large",
        "참조된 테마 에셋의 전체 크기가 허용 한도를 초과했습니다.",
        413,
        "not_exportable",
      );
    }
    throw error;
  }
  if (resolution.failures.length) throw createCatalogResolutionError(resolution.failures[0]);

  const resolvedByPath = new Map(resolution.resolved.map((item) => [item.path, item]));
  const manifest = input.manifest.map((item) => {
    if (!hasCatalogAsset(item)) return stripResourceRole(item);
    const resolved = resolvedByPath.get(item.path);
    if (!resolved) throw new Error(`catalog_manifest_resolution_missing:${item.path}`);
    return resolved;
  });

  return {
    manifest,
    referencedAssetBytes: resolution.totals.referencedAssetBytes,
    uniqueReferencedAssetBytes: resolution.totals.uniqueReferencedAssetBytes,
    referencedAssetFileCount: resolution.totals.referencedAssetFileCount,
  };
}

function createCatalogResolutionError(failure: CatalogResolutionFailure): CatalogExportResolutionError {
  switch (failure.reason) {
    case "invalid_selection":
      return new CatalogExportResolutionError("invalid_catalog_asset", "내보내기 에셋 참조가 올바르지 않습니다.", 400, failure.reason);
    case "role_missing":
    case "role_invalid":
      return new CatalogExportResolutionError("invalid_catalog_asset", "내보내기 에셋의 슬롯 정보가 올바르지 않습니다.", 400, failure.reason);
    case "not_allowed":
      return new CatalogExportResolutionError("catalog_asset_not_allowed", "현재 내보내기 대상에서 사용할 수 없는 추천 에셋입니다.", 403, failure.reason);
    case "not_found":
      return new CatalogExportResolutionError("catalog_asset_not_found", "선택한 추천 에셋을 찾지 못했습니다. 편집기에서 다시 선택해 주세요.", 409, failure.reason);
    case "revision_mismatch":
      return new CatalogExportResolutionError("catalog_asset_revision_mismatch", "추천 에셋이 갱신되었습니다. 편집기에서 다시 선택해 주세요.", 409, failure.reason);
    case "not_exportable":
      return new CatalogExportResolutionError("catalog_asset_not_exportable", "선택한 에셋은 현재 내보내기에 사용할 수 없습니다.", 422, failure.reason);
    case "transform_required":
      return new CatalogExportResolutionError("catalog_asset_transform_required", "선택한 에셋은 변환이 필요해 현재 export 경로에서 사용할 수 없습니다.", 422, failure.reason);
  }
}

/** `not_allowed`로 막힌 admin 논리 자산 id만 추린다. */
function collectDeniedAdminAssetIds(failures: readonly CatalogResolutionFailure[]): string[] {
  const ids = new Set<string>();
  for (const failure of failures) {
    if (failure.reason !== "not_allowed" || !failure.assetId) continue;
    try {
      if (parseLogicalAssetId(failure.assetId).kind === "admin") ids.add(failure.assetId);
    } catch {
      // 형식이 깨진 id는 이미 invalid_selection으로 분류된다.
    }
  }
  return [...ids];
}

function groupPlatformsByAssetId(records: readonly TemplateAssetExportAccess[]) {
  const platformsByAssetId = new Map<string, Set<"android" | "ios">>();
  for (const record of records) {
    const platforms = platformsByAssetId.get(record.logicalAssetId) ?? new Set<"android" | "ios">();
    platforms.add(record.platform);
    platformsByAssetId.set(record.logicalAssetId, platforms);
  }
  return platformsByAssetId;
}

async function readCatalogAssetAccess(
  store: Pick<EdgeRegistryStore, "findActiveByKeys"> & Partial<Pick<EdgeRegistryStore, "findAdminAssetExportAccess" | "findTemplateAssetExportAccess">>,
  selections: readonly { selection: { assetId: string } }[],
  userId?: string,
) {
  const adminSourceIds = new Set<string>();
  const templateSourceIds = new Set<string>();
  for (const { selection } of selections) {
    try {
      const parsed = parseLogicalAssetId(selection.assetId);
      if (parsed.kind === "admin" && isUuid(parsed.sourceId)) adminSourceIds.add(parsed.sourceId);
      if (parsed.kind === "template") templateSourceIds.add(parsed.sourceId);
    } catch {
      // resolveCatalogManifest가 access map 누락을 not_allowed로 분류한다.
    }
  }
  const accessByAssetId = new Map<string, CatalogAssetExportAccess>();

  if (adminSourceIds.size && store.findAdminAssetExportAccess) {
    const records = await store.findAdminAssetExportAccess([...adminSourceIds]);
    for (const record of records) accessByAssetId.set(adminLogicalAssetId(record.id), { kind: "admin", asset: record });
  }

  if (templateSourceIds.size && store.findTemplateAssetExportAccess) {
    const records = await store.findTemplateAssetExportAccess({ uploadEntryIds: [...templateSourceIds], userId });
    for (const [logicalAssetId, platforms] of groupPlatformsByAssetId(records)) {
      accessByAssetId.set(logicalAssetId, { kind: "template", platforms: [...platforms] });
    }
  }

  return accessByAssetId;
}

function stripResourceRole(item: ExportManifestSourceItem): PassthroughManifestItem {
  if ("field" in item) return { path: item.path, field: item.field };
  if ("serverAsset" in item) return { path: item.path, serverAsset: item.serverAsset };
  throw new Error(`catalog_manifest_unexpected:${item.path}`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
