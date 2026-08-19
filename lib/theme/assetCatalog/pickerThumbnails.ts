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
 */

/** `theme_asset_objects.r2_previews`의 피커용 preset 키. 갤러리 카드(`card`)와 용도가 다르다. */
export const pickerPreviewPresetKey = "picker";

type PreviewEntry = { objectKey?: unknown; sha256?: unknown };

export type PickerThumbnailRow = {
  readonly logical_asset_id?: unknown;
  readonly variant_key?: unknown;
  readonly r2_previews?: unknown;
};

/**
 * registry 행에서 `adminAssetId -> 썸네일 URL` 표를 만든다.
 *
 * R2 origin이 설정돼 있지 않으면 빈 표를 돌려준다. 그러면 호출부가 `thumbnailUrl` 없이 응답하고
 * 화면은 기존 `previewUrl`로 그린다 — 전환 전과 완전히 같은 동작이다.
 */
export function buildPickerThumbnailUrls(rows: readonly PickerThumbnailRow[]): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const row of rows) {
    if (row.variant_key !== canonicalVariantKey) continue;
    const logicalAssetId = typeof row.logical_asset_id === "string" ? row.logical_asset_id : "";
    const adminAssetId = readAdminAssetId(logicalAssetId);
    if (!adminAssetId) continue;

    const previews = typeof row.r2_previews === "object" && row.r2_previews !== null ? (row.r2_previews as Record<string, PreviewEntry>) : null;
    const objectKey = previews?.[pickerPreviewPresetKey]?.objectKey;
    if (typeof objectKey !== "string" || !objectKey) continue;

    const url = previewUrlOf({ r2ObjectKey: objectKey });
    if (url) urls[adminAssetId] = url;
  }
  return urls;
}

/** `admin:<uuid>`에서 `<uuid>`를 꺼낸다. `tpl:` 행은 피커 대상이 아니라 건너뛴다. */
function readAdminAssetId(logicalAssetId: string): string | undefined {
  if (!logicalAssetId) return undefined;
  const prefix = adminLogicalAssetId("x").slice(0, -1);
  return logicalAssetId.startsWith(prefix) ? logicalAssetId.slice(prefix.length) : undefined;
}
