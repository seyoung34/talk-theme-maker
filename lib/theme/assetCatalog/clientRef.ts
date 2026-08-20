import { getAndroidSlotExportPaths } from "@/lib/theme/android/export";
import { getIosSlotExportTargets } from "@/lib/theme/ios/export";
import { isCatalogFastPathEligible } from "@/lib/theme/export/catalogFastPath";
import { isCatalogExportProducerEnabled, type CatalogExportScope } from "@/lib/theme/assetCatalog/exportGate";
import type { CatalogUploadRef } from "@/lib/theme/project/state";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";

/**
 * 추천 후보를 편집기 업로드 상태의 catalog ref로 바꿀 수 있는지 판정한다.
 *
 * catalog ref는 브라우저에 원본 바이트가 없을 수 있다는 뜻이다. Phase 5 변환을 지원하는
 * Android nine-patch와 iOS PNG는 fast path 조건이 아니어도 metadata를 보존한다. 그 외의
 * 변환은 아직 브라우저 File fallback으로 남겨 결과가 조용히 달라지지 않게 한다.
 */
export function createAdminCatalogUploadRef(slot: ThemeAssetSlot, asset: AdminAssetCandidate, scope: CatalogExportScope = {}): CatalogUploadRef | undefined {
  const catalog = getAdminCatalogUploadRef(slot, asset);
  if (!catalog || !isCatalogExportProducerEnabled(slot.platform, {
    ...scope,
    assetIds: [catalog.selection.assetId],
  })) return undefined;
  return catalog;
}

/**
 * 추천 에셋을 catalog metadata로 표현할 수 있는지 판정한다.
 *
 * 이 함수는 rollout flag를 보지 않는다. 편집기는 canary 계정인지 export 시점에야 확정할 수
 * 있으므로, 선택 시에는 File과 metadata를 함께 보존하고 실제 export에서 user/asset allowlist를
 * 통과한 경우에만 File 업로드를 catalog ref로 줄인다.
 */
export function getAdminCatalogUploadRef(slot: ThemeAssetSlot, asset: AdminAssetCandidate): CatalogUploadRef | undefined {
  const catalog = asset.catalog;
  if (!catalog || slot.kind === "color" || !catalog.pngSignatureVerified || catalog.mimeType !== "image/png") return undefined;

  const paths = slot.platform === "android"
    ? getAndroidSlotExportPaths(slot)
    : getIosSlotExportTargets(slot).map((target) => target.path);
  if (!paths.length) return undefined;

  const source = {
    fileName: catalog.fileName,
    sourceScale: catalog.sourceScale,
    mimeType: catalog.mimeType,
  };
  const fastPathEligible = paths.every((path) => isCatalogFastPathEligible({ platform: slot.platform, path, source }).eligible);
  const builderTransformSupported = slot.platform === "ios"
    || (slot.kind === "ninepatch" && paths.every((path) => path.toLowerCase().endsWith(".9.png")));
  if (!fastPathEligible && !builderTransformSupported) return undefined;

  return {
    selection: catalog.selection,
    fileName: catalog.fileName,
    mimeType: catalog.mimeType,
    size: catalog.size,
    sourceScale: catalog.sourceScale,
    width: catalog.width,
    height: catalog.height,
    pngSignatureVerified: catalog.pngSignatureVerified,
    legacyStoragePath: asset.storagePath,
    ...(asset.previewUrl ? { previewUrl: asset.previewUrl } : {}),
  };
}
