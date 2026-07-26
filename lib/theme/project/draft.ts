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
    bubbleDesigns: {},
    bubbleDecorationSources: {},
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
