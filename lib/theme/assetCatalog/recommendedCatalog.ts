import type { AdminAssetCandidate } from "@/lib/theme/adminAssetDomain";
import { adminLogicalAssetId } from "@/lib/theme/assetCatalog/logicalAssetId";
import type { ThemeAssetObjectRecord } from "@/lib/theme/assetCatalog/registry";

/**
 * 추천 후보에 catalog ref를 붙일 때의 현재 바이트 일치 계약.
 *
 * 파일명·MIME은 Supabase Storage의 같은 경로를 새 바이트로 교체해도 그대로일 수 있다.
 * 따라서 publisher가 현재 admin asset/variant row에 기록한 `assetObjectId`만 신뢰한다.
 * 연결이 없는 legacy row는 여기서 ref를 만들지 않고 기존 field 경로로 남긴다.
 */
export function findMatchingCatalogRef(
  records: readonly ThemeAssetObjectRecord[],
  candidate: AdminAssetCandidate,
  platform: "android" | "ios",
  usesPlatformVariant: boolean,
) {
  if (!candidate.assetObjectId) return undefined;

  // 실제 variant를 선택한 후보에는 canonical을 fallback으로 붙이지 않는다. 두 바이트가
  // 다를 수 있으므로 platform registry link가 없으면 legacy field 경로로 남긴다.
  const preferredVariantKeys = usesPlatformVariant ? [platform] : ["canonical", platform];
  const record = preferredVariantKeys
    .map((variantKey) => records.find((item) => item.id === candidate.assetObjectId && item.variantKey === variantKey))
    .find(Boolean);
  if (!record || record.logicalAssetId !== adminLogicalAssetId(candidate.id)) return undefined;

  return {
    selection: { kind: "catalog" as const, assetId: record.logicalAssetId, revision: record.revision, variantKey: record.variantKey },
    fileName: record.fileName,
    mimeType: record.mimeType,
    size: record.sizeBytes,
    sourceScale: record.sourceScale,
    width: record.width,
    height: record.height,
    pngSignatureVerified: record.pngSignatureVerified,
  };
}
