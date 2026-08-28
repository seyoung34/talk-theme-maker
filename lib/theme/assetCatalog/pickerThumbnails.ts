import { previewUrlOf } from "@/lib/theme/assetCatalog/previewUrl";
import { adminLogicalAssetId, canonicalVariantKey } from "@/lib/theme/assetCatalog/logicalAssetId";

/**
 * 추천 에셋 피커 타일용 썸네일 URL 조회.
 *
 * **`previewUrl`을 대체하지 않는다.** 그 필드는 타일 배경이면서 동시에 이미지 편집기의 원본
 * 소스다(`ProjectQuickEditPanel.getEditableSourceUrl`, `MobileQuickEditPanel`의 `editableSourceUrl`).
 * 거기에 256px 썸네일을 넣으면 사용자가 추천 에셋을 골라 편집할 때 축소본을 편집하게 된다.
 *
 * 그래서 타일 전용 `thumbnailUrl`을 따로 준다. signed URL을 만드는 것 자체는 egress가 아니고
 * 브라우저가 실제로 내려받을 때 발생하므로, 목록은 썸네일만 받고 원본은 편집기를 열 때 그 한 장만
 * 받는다. 절감은 그대로 얻으면서 편집 품질은 유지된다.
 *
 * ## 플랫폼 variant
 *
 * 추천 에셋은 플랫폼별로 다른 원본을 가질 수 있다(`admin_asset_variants`). 추천 API는
 * `withAdminAssetPlatformVariant()`로 `previewUrl`을 그 variant로 바꾼다. 썸네일이 canonical만
 * 바라보면 **화면에는 Android 그림이 보이는데 선택 결과는 iOS 그림**이 되는 어긋남이 생긴다.
 *
 * 그래서 썸네일을 `adminAssetId + variantKey`로 키를 잡고, 실제로 선택된 원본에 대응하는 썸네일만
 * 쓴다. 대응하는 썸네일이 없으면 `thumbnailUrl`을 주지 않고 같은 플랫폼의 `previewUrl`로 떨어진다 —
 * 틀린 그림을 보여 주느니 원본을 받는 편이 낫다.
 */

/** `theme_asset_objects.r2_previews`의 피커용 preset 키. 갤러리 카드(`card`)와 용도가 다르다. */
export const pickerPreviewPresetKey = "picker";

type PreviewEntry = { objectKey?: unknown; sha256?: unknown };

export type PickerThumbnailRow = {
  readonly id?: unknown;
  readonly logical_asset_id?: unknown;
  readonly variant_key?: unknown;
  readonly r2_previews?: unknown;
};

export type PickerThumbnailAssetRef = {
  readonly id: string;
  readonly assetObjectId?: unknown;
  readonly variants?: readonly { readonly assetObjectId?: unknown }[];
};

/**
 * 같은 logical asset의 예전 revision이 active로 남아 있어도 현재 parent/variant pointer와
 * 일치하는 registry row만 타일에 쓴다. 재업로드 중 pointer가 비워진 경우에는 stale R2
 * 이미지를 보여 주지 않고 호출부가 Storage 원본으로 폴백한다.
 */
export function filterPickerThumbnailRowsForCurrentAssets(
  rows: readonly PickerThumbnailRow[],
  assets: readonly PickerThumbnailAssetRef[],
): PickerThumbnailRow[] {
  const currentObjectIds = new Map<string, Set<string>>();
  for (const asset of assets) {
    const objectIds = [asset.assetObjectId, ...(asset.variants ?? []).map((variant) => variant.assetObjectId)]
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (objectIds.length > 0) currentObjectIds.set(adminLogicalAssetId(asset.id), new Set(objectIds));
  }

  return rows.filter((row) => {
    const logicalAssetId = typeof row.logical_asset_id === "string" ? row.logical_asset_id : "";
    const registryId = typeof row.id === "string" ? row.id : "";
    return Boolean(registryId && currentObjectIds.get(logicalAssetId)?.has(registryId));
  });
}

/** `adminAssetId` → `variantKey` → URL. */
export type PickerThumbnailIndex = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * registry 행에서 썸네일 색인을 만든다.
 *
 * R2 origin이 설정돼 있지 않으면 빈 색인을 돌려준다. 그러면 호출부가 `thumbnailUrl` 없이 응답하고
 * 화면은 기존 `previewUrl`로 그린다 — 전환 전과 완전히 같은 동작이다.
 */
export function buildPickerThumbnailIndex(rows: readonly PickerThumbnailRow[]): PickerThumbnailIndex {
  const index: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    const logicalAssetId = typeof row.logical_asset_id === "string" ? row.logical_asset_id : "";
    const adminAssetId = readAdminAssetId(logicalAssetId);
    const variantKey = typeof row.variant_key === "string" ? row.variant_key : "";
    if (!adminAssetId || !variantKey) continue;

    const previews = typeof row.r2_previews === "object" && row.r2_previews !== null ? (row.r2_previews as Record<string, PreviewEntry>) : null;
    const objectKey = previews?.[pickerPreviewPresetKey]?.objectKey;
    if (typeof objectKey !== "string" || !objectKey) continue;

    const url = previewUrlOf({ r2ObjectKey: objectKey });
    if (!url) continue;
    (index[adminAssetId] ??= {})[variantKey] = url;
  }
  return index;
}

/**
 * 실제로 선택된 원본에 맞는 썸네일을 고른다.
 *
 * `usesPlatformVariant`는 추천 API가 `withAdminAssetPlatformVariant()`로 원본을 바꿨는지다.
 * 바꿨다면 canonical 썸네일은 **다른 그림**이므로 쓰지 않는다.
 */
export function selectPickerThumbnailUrl(input: {
  index: PickerThumbnailIndex;
  adminAssetId: string;
  platform: "android" | "ios";
  usesPlatformVariant: boolean;
}): string | undefined {
  const byVariant = input.index[input.adminAssetId];
  if (!byVariant) return undefined;

  const platformThumbnail = byVariant[input.platform];
  if (platformThumbnail) return platformThumbnail;

  // 플랫폼 원본을 쓰는데 그 variant 썸네일이 없다. canonical을 보여 주면 다른 그림이 된다.
  if (input.usesPlatformVariant) return undefined;

  return byVariant[canonicalVariantKey];
}

/** `admin:<uuid>`에서 `<uuid>`를 꺼낸다. `tpl:` 행은 피커 대상이 아니라 건너뛴다. */
function readAdminAssetId(logicalAssetId: string): string | undefined {
  if (!logicalAssetId) return undefined;
  const prefix = adminLogicalAssetId("x").slice(0, -1);
  return logicalAssetId.startsWith(prefix) ? logicalAssetId.slice(prefix.length) : undefined;
}
