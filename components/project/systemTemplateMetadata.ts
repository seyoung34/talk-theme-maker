import type { ActiveSystemTemplate } from "@/components/project/editorTypes";
import type { EditorSystemTemplateMetadata } from "@/lib/theme/project/draft";

type SystemTemplateDialogInitializationOptions = {
  activeSystemTemplate: ActiveSystemTemplate | null;
  current: EditorSystemTemplateMetadata;
  fallbackTitle: string;
  initialized: boolean;
};

/**
 * 시스템 템플릿 저장 폼은 대화상자를 처음 열 때만 초기값을 채운다.
 *
 * 이미 열었던 폼이나 자동 저장에서 복원한 폼은 `initialized`로 표시한다. 이 경우 마지막으로 서버에
 * 저장된 `activeSystemTemplate` 값보다 현재 입력값이 우선하므로 아무것도 반환하지 않는다.
 */
export function getSystemTemplateDialogInitialization({
  activeSystemTemplate,
  current,
  fallbackTitle,
  initialized,
}: SystemTemplateDialogInitializationOptions): EditorSystemTemplateMetadata | null {
  if (initialized) return null;

  return {
    title: activeSystemTemplate?.title ?? (current.title.trim() || fallbackTitle),
    description: activeSystemTemplate?.description ?? current.description,
    tags: activeSystemTemplate?.tags.join(", ") ?? current.tags,
    status: activeSystemTemplate?.status ?? current.status,
    visibility: activeSystemTemplate?.visibility ?? current.visibility,
    pricingType: activeSystemTemplate?.pricingType ?? current.pricingType,
    priceAmount: activeSystemTemplate?.priceAmount != null ? String(activeSystemTemplate.priceAmount) : current.priceAmount,
    creditCost: activeSystemTemplate?.creditCost != null ? String(activeSystemTemplate.creditCost) : current.creditCost,
  };
}

export function createDefaultSystemTemplateMetadata(title: string): EditorSystemTemplateMetadata {
  return {
    title,
    description: "",
    tags: "",
    status: "draft",
    visibility: "private",
    pricingType: "free",
    priceAmount: "",
    creditCost: "",
  };
}
