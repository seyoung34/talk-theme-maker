import { createRegistryStore, type RegistryStore } from "@/lib/theme/assetCatalog/registryStore";
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
import type { AdminAssetExportAccess } from "@/lib/theme/assetCatalog/exportAccess";

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
  store?: Pick<RegistryStore, "findActiveByKeys"> & Partial<Pick<RegistryStore, "findAdminAssetExportAccess">>;
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

  const store = input.store ?? createRegistryStore();
  const records = await store.findActiveByKeys(toRegistryLookupKeys(collected.selections));
  const accessByAssetId = await readAdminAssetAccess(store, collected.selections);
  let resolution;
  try {
    resolution = resolveCatalogManifest({
      manifest: input.manifest,
      records,
      uploadedInputBytes: input.uploadedInputBytes,
      platform: input.platform,
      accessByAssetId,
    });
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

async function readAdminAssetAccess(
  store: Pick<RegistryStore, "findActiveByKeys"> & Partial<Pick<RegistryStore, "findAdminAssetExportAccess">>,
  selections: readonly { selection: { assetId: string } }[],
) {
  const sourceIds = new Set<string>();
  for (const { selection } of selections) {
    try {
      const parsed = parseLogicalAssetId(selection.assetId);
      if (parsed.kind === "admin" && isUuid(parsed.sourceId)) sourceIds.add(parsed.sourceId);
    } catch {
      // resolveCatalogManifest가 access map 누락을 not_allowed로 분류한다.
    }
  }
  if (!sourceIds.size || !store.findAdminAssetExportAccess) return new Map<string, AdminAssetExportAccess>();
  const records = await store.findAdminAssetExportAccess([...sourceIds]);
  return new Map(records.map((record) => [adminLogicalAssetId(record.id), record]));
}

function stripResourceRole(item: ExportManifestSourceItem): PassthroughManifestItem {
  if ("field" in item) return { path: item.path, field: item.field };
  if ("serverAsset" in item) return { path: item.path, serverAsset: item.serverAsset };
  throw new Error(`catalog_manifest_unexpected:${item.path}`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
