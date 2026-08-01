import type { SlotCandidateSelections, SlotColors, SlotUploads } from "@/lib/theme/project/state";
import type { RemoteSlotUploads, SystemTemplatePricingType, SystemTemplateStatus, SystemTemplateVisibility } from "@/lib/theme/systemTemplates";
import type { BubbleDecorationSources, BubbleDesigns } from "@/lib/theme/bubbleBuilder";
import type { BubbleGeometry, Insets, Markers, StretchPoint } from "@/lib/theme/types";

export type EditorMode = "user" | "admin";

/**
 * 편집기가 들고 있는 테마 초안 전체.
 *
 * 이 값은 내보내기·저장·복구·자동 저장이 모두 읽고 쓰는 공유 계약이다. 컴포넌트 전용 상태가 아니라
 * 지속·내보내기 대상이므로 타입 경계를 `lib/theme/project`에 둔다. 여기에 없는 값은 내보내기가
 * 관찰할 수 없다는 뜻이고, 반대로 여기 있는 값은 어떤 지속 경로에서도 복원할 수 있어야 한다.
 */
export type ThemeDraft = {
  uploads: SlotUploads;
  remoteUploadRefs: RemoteSlotUploads;
  colors: SlotColors;
  candidateSelections: SlotCandidateSelections;
  bubbleGeometry: Partial<Record<string, BubbleGeometry>>;
  bubbleMarkers: Partial<Record<string, Markers>>;
  bubbleInsets: Partial<Record<string, Insets>>;
  bubbleStretch: Partial<Record<string, StretchPoint>>;
  /**
   * 슬롯별 좌우반전. 파일을 다시 굽지 않고 결과물을 만드는 마지막 경계에서만 적용한다.
   *
   * 런타임에는 항상 존재하고, 저장 스키마에서만 optional로 읽어 `{}`로 승격한다. 필드가 없는
   * 기존 레코드는 반전이 없는 상태이므로 결과가 달라지지 않는다.
   */
  bubbleFlipX: Partial<Record<string, boolean>>;
  bubbleDesigns: BubbleDesigns;
  bubbleDecorationSources: BubbleDecorationSources;
};

export function createEmptyThemeDraft(): ThemeDraft {
  return {
    uploads: {},
    remoteUploadRefs: {},
    colors: {},
    candidateSelections: {},
    bubbleGeometry: {},
    bubbleMarkers: {},
    bubbleInsets: {},
    bubbleStretch: {},
    bubbleFlipX: {},
    bubbleDesigns: {},
    bubbleDecorationSources: {},
  };
}

/**
 * 나중에 추가되어 예전 저장 레코드에는 없을 수 있는 필드들.
 *
 * 런타임 `ThemeDraft`에서는 항상 존재해야 하므로, 저장소에서 읽은 값은 반드시
 * `normalizeThemeDraft()`를 거쳐 들여온다.
 */
type OptionalPersistedDraftKey = "bubbleGeometry" | "bubbleFlipX" | "bubbleDesigns" | "bubbleDecorationSources";

export type PersistedThemeDraft =
  Omit<ThemeDraft, OptionalPersistedDraftKey> & Partial<Pick<ThemeDraft, OptionalPersistedDraftKey>>;

/**
 * 저장소에서 읽은 초안을 런타임 계약으로 승격한다.
 *
 * 복원 지점마다 `?? {}`를 흩어 두면 새 필드가 늘 때 한 곳을 빠뜨리기 쉽고, 빠뜨려도 타입은
 * 통과한다(값이 optional이라). 승격을 한 함수에 모아 두면 필드 추가가 이 함수 하나로 끝난다.
 */
export function normalizeThemeDraft(draft: PersistedThemeDraft): ThemeDraft {
  return {
    ...draft,
    bubbleGeometry: draft.bubbleGeometry ?? {},
    bubbleFlipX: draft.bubbleFlipX ?? {},
    bubbleDesigns: draft.bubbleDesigns ?? {},
    bubbleDecorationSources: draft.bubbleDecorationSources ?? {},
  };
}

/**
 * 초안과 함께 보관하는 "지금 무엇을 편집 중인가" 정보.
 *
 * 식별자만 저장하면 복원할 때마다 메타데이터를 다시 조회해야 하고 오프라인에서는 복원이 실패한다.
 * 작업을 잃지 않는 것이 목적이므로 화면에 필요한 값까지 함께 보관한다.
 */
/**
 * 관리자가 시스템 템플릿 저장 다이얼로그에서 편집 중인 값.
 *
 * `ThemeDraft`와 달리 내보내기 결과에는 영향을 주지 않지만, 저장하기 전까지 메모리에만 있어
 * 새로고침하면 사라진다. 폼 상태 그대로(가격·크레딧은 문자열) 보관해 입력 중이던 값을 복원한다.
 */
export type EditorSystemTemplateMetadata = {
  title: string;
  description: string;
  tags: string;
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  pricingType: SystemTemplatePricingType;
  priceAmount: string;
  creditCost: string;
};

export type EditorActiveUserTemplate = { id: string; name: string; createdAt: number };

export type EditorActiveSystemTemplate = {
  id: string;
  bundleId: string;
  title: string;
  description?: string;
  tags: string[];
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  pricingType: SystemTemplatePricingType;
  priceAmount?: number;
  creditCost?: number;
  createdAt: number;
};
