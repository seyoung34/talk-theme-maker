/**
 * catalog registry의 논리 자산 식별자.
 *
 * `theme_asset_objects.logical_asset_id`는 "무엇을 게시했는가"의 안정된 이름이다. 이 프로젝트에는
 * 출처가 둘 있다.
 *
 *   - 추천(관리자) 에셋   → `admin_assets.id`
 *   - 시스템 템플릿 업로드 → `system_template_variants.upload_refs[].id`
 *
 * **접두가 반드시 필요하다.** 편집기의 `selectAdminAsset()`이 업로드 항목 id를 `asset.id`로 그대로
 * 넣기 때문에, 추천 에셋에서 온 템플릿 항목은 id가 `admin_assets.id`와 **같은 값**이다. 접두가 없으면
 * 둘이 한 행으로 합쳐지고, 관리자가 추천 에셋을 갱신할 때 그것을 복사해 간 템플릿까지 새 revision을
 * 가리키게 된다. 지금은 템플릿이 사본을 들고 있어 그런 전파가 없으므로, 저장소 이전이 제품 동작을
 * 바꾸지 않도록 네임스페이스를 나눈다.
 *
 * 두 출처를 잇는 것은 나중에 별도 개념으로 더할 수 있다. 반대로 합쳐 둔 것을 나누기는 어렵다.
 */

export const adminLogicalAssetPrefix = "admin:";
export const templateLogicalAssetPrefix = "tpl:";

/**
 * 플랫폼별 파생물이 아직 없을 때 쓰는 variant 키.
 *
 * backfill 대상 126개는 모두 논리 자산당 내용이 하나라(플랫폼이 여럿이어도 바이트가 같다)
 * 전부 이 키를 쓴다. 플랫폼별로 실제 다른 바이트를 굽기 시작하면 그때 `android`/`ios`가 생긴다.
 */
export const canonicalVariantKey = "canonical";

export type LogicalAssetSource = "admin" | "template";

export type ParsedLogicalAssetId = {
  readonly kind: LogicalAssetSource;
  /** 접두를 뗀 원래 id. `admin_assets.id` 또는 업로드 항목 id. */
  readonly sourceId: string;
};

export class LogicalAssetIdError extends Error {
  constructor(readonly code: "EMPTY_SOURCE_ID" | "UNKNOWN_PREFIX") {
    super(code);
    this.name = "LogicalAssetIdError";
  }
}

export function adminLogicalAssetId(adminAssetId: string): string {
  return `${adminLogicalAssetPrefix}${requireSourceId(adminAssetId)}`;
}

export function templateLogicalAssetId(uploadEntryId: string): string {
  return `${templateLogicalAssetPrefix}${requireSourceId(uploadEntryId)}`;
}

export function parseLogicalAssetId(value: string): ParsedLogicalAssetId {
  if (value.startsWith(adminLogicalAssetPrefix)) {
    return { kind: "admin", sourceId: requireSourceId(value.slice(adminLogicalAssetPrefix.length)) };
  }
  if (value.startsWith(templateLogicalAssetPrefix)) {
    return { kind: "template", sourceId: requireSourceId(value.slice(templateLogicalAssetPrefix.length)) };
  }
  throw new LogicalAssetIdError("UNKNOWN_PREFIX");
}

export function isLogicalAssetId(value: string): boolean {
  try {
    parseLogicalAssetId(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 업로드 항목 id는 `admin-asset:1781680542261:xqcxdi`처럼 콜론을 포함할 수 있다.
 * 그래서 파싱은 첫 콜론이 아니라 **접두 문자열**을 기준으로 한다.
 */
function requireSourceId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new LogicalAssetIdError("EMPTY_SOURCE_ID");
  return trimmed;
}
