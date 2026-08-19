import { getAndroidSlotExportPaths } from "@/lib/theme/android/export";
import { getIosSlotExportTargets } from "@/lib/theme/ios/export";
import { isCatalogFastPathEligible } from "@/lib/theme/export/catalogFastPath";
import type { CatalogUploadRef } from "@/lib/theme/project/state";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";

/**
 * 추천 후보를 편집기 업로드 상태의 catalog ref로 바꿀 수 있는지 판정한다.
 *
 * catalog ref는 브라우저에 원본 바이트가 없다는 뜻이므로, 이 함수는 변환 없는 모든 출력
 * 경로가 fast path 조건을 만족할 때만 ref를 만든다. 조건이 하나라도 어긋나면 호출부가
 * 기존 `adminAssetToFile` 경로를 사용한다 — 선택은 유지하되 export 결과가 조용히 달라지지
 * 않게 하는 경계다.
 */
export function createAdminCatalogUploadRef(slot: ThemeAssetSlot, asset: AdminAssetCandidate): CatalogUploadRef | undefined {
  const catalog = asset.catalog;
  if (!catalog || slot.kind === "color" || slot.kind === "ninepatch" || !catalog.pngSignatureVerified) return undefined;

  const paths = slot.platform === "android"
    ? getAndroidSlotExportPaths(slot)
    : getIosSlotExportTargets(slot).map((target) => target.path);
  if (!paths.length) return undefined;

  const source = {
    fileName: catalog.fileName,
    sourceScale: catalog.sourceScale,
    mimeType: catalog.mimeType,
  };
  if (!paths.every((path) => isCatalogFastPathEligible({ platform: slot.platform, path, source }).eligible)) return undefined;

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
