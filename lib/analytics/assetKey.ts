const assetKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 공개 추천 에셋을 GA4에서 구분하기 위한 키.
 *
 * 추천 API가 내려주는 `admin_assets.id`(UUID)만 통과시킨다. 사용자 업로드 ID(`<slotId>:...`),
 * 템플릿 기본 후보 ID, 제목·경로·URL처럼 UUID가 아닌 값은 모두 버린다. `asset_source` 문자열만으로
 * 추천 에셋임을 판단하지 않고, 값 자체의 형식을 한 번 더 검사하는 allowlist다.
 */
export type CandidateSelectedParams = {
  slot_role: string;
  section: string;
  asset_source: string;
  asset_key?: string;
};

/**
 * `candidate_selected` 파라미터를 만든다.
 *
 * `recommendedAssetId`는 **추천 카드를 직접 선택한 경로**(`selectAdminAsset`)만 넘긴다. 템플릿 사본이
 * 추천 에셋과 같은 UUID를 가질 수 있어(`projectModel.ts`의 templateItems), 후보 ID가 추천 목록에
 * 있다는 사실만으로는 추천 선택이라고 증명되지 않는다. 그래서 일반 후보 경로는 이 값을 넘기지 않는다.
 */
export function buildCandidateSelectedParams(input: {
  slotRole: string;
  section: string;
  assetSource: string;
  recommendedAssetId?: string | null;
}): CandidateSelectedParams {
  const assetKey = toRecommendedAssetKey(input.recommendedAssetId);
  return {
    slot_role: input.slotRole,
    section: input.section,
    asset_source: input.assetSource,
    ...(assetKey ? { asset_key: assetKey } : {}),
  };
}

export function toRecommendedAssetKey(assetId: string | null | undefined): string | undefined {
  if (typeof assetId !== "string") return undefined;
  return assetKeyPattern.test(assetId) ? assetId.toLowerCase() : undefined;
}
