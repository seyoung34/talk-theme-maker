const bundleIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 내 템플릿이 "어느 시스템 템플릿에서 시작한 작업인지"를 나타내는 bundle ID를 정규화한다.
 *
 * 집계용 출처일 뿐이다. 원본을 수정 없이 썼다는 뜻도, 권한·과금 근거도 아니다.
 * UUID 형식이 아니거나 비어 있으면 `null`(출처 없음/알 수 없음)이다. 제목·파일명·공통 기반 템플릿으로
 * 출처를 추론하지 않는다.
 */
export function normalizeSourceSystemTemplateBundleId(value: unknown): string | null {
  return typeof value === "string" && bundleIdPattern.test(value) ? value.toLowerCase() : null;
}

/**
 * 지금 편집 중인 작업의 출처 bundle을 계산한다.
 *
 * - 내 템플릿(`activeUserTemplate`)이 열려 있으면 **별도 출처 상태만** 믿는다. `activeSystemTemplate`과
 *   `systemTemplateBundleId`는 시스템 템플릿에서 시작해 저장한 뒤에도 남아 있지만, 그 값을 이어받으면
 *   다른 내 템플릿을 열었을 때 이전 작업의 출처가 섞인다.
 * - 내 템플릿이 아니면 편집 중인 시스템 템플릿의 bundle이 곧 이 작업의 출처다.
 * - 근거가 없으면 `null`이다.
 */
export function resolveWorkOriginBundleId(input: {
  hasActiveUserTemplate: boolean;
  sourceSystemTemplateBundleId: string | null;
  activeSystemTemplateBundleId: string | null | undefined;
  systemTemplateBundleId: string | null;
}): string | null {
  if (input.hasActiveUserTemplate) return normalizeSourceSystemTemplateBundleId(input.sourceSystemTemplateBundleId);
  return normalizeSourceSystemTemplateBundleId(input.activeSystemTemplateBundleId ?? input.systemTemplateBundleId);
}
