import { normalizeSourceSystemTemplateBundleId } from "@/lib/theme/templateOrigin";

/** Client-supplied analytics only. Never use these values for authorization or billing. */
export function normalizeTemplateAttribution(bundle: unknown, variant: unknown) {
  const uuid = (value: unknown) => typeof value === "string" && value.length === 36
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
  const systemTemplateBundleId = uuid(bundle);
  return { systemTemplateBundleId, systemTemplateVariantId: systemTemplateBundleId ? uuid(variant) : null };
}

export function readTemplateAttribution(form: FormData) {
  return normalizeTemplateAttribution(form.get("systemTemplateBundleId"), form.get("systemTemplateVariantId"));
}

/**
 * "내 템플릿" 작업이 시작된 시스템 템플릿 bundle(파생 출처). 직접 사용(`systemTemplateBundleId`)과 별개 필드이고
 * 형식이 맞지 않으면 null이다. 분석 전용이며 권한·과금에 쓰지 않는다.
 */
export function readSourceTemplateBundleId(form: FormData) {
  return normalizeSourceSystemTemplateBundleId(form.get("sourceSystemTemplateBundleId"));
}
