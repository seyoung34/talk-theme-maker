const assetKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 공개 추천 에셋을 GA4에서 구분하기 위한 키.
 *
 * 추천 API가 내려주는 `admin_assets.id`(UUID)만 통과시킨다. 사용자 업로드 ID(`<slotId>:...`),
 * 템플릿 기본 후보 ID, 제목·경로·URL처럼 UUID가 아닌 값은 모두 버린다. `asset_source` 문자열만으로
 * 추천 에셋임을 판단하지 않고, 값 자체의 형식을 한 번 더 검사하는 allowlist다.
 */
export function toRecommendedAssetKey(assetId: string | null | undefined): string | undefined {
  if (typeof assetId !== "string") return undefined;
  return assetKeyPattern.test(assetId) ? assetId.toLowerCase() : undefined;
}
