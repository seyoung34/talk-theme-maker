export const templateNameMaxLength = 25;

export type TemplateNameValidation = {
  value: string;
  error: string | null;
};

export function validateTemplateName(value: unknown): TemplateNameValidation {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) return { value: normalized, error: "템플릿 이름을 입력해 주세요." };
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return { value: normalized, error: "템플릿 이름에는 줄바꿈이나 제어 문자를 사용할 수 없습니다." };
  if (Array.from(normalized).length > templateNameMaxLength) return { value: normalized, error: `템플릿 이름은 ${templateNameMaxLength}자 이하로 입력해 주세요.` };

  return { value: normalized, error: null };
}

export function assertValidTemplateName(value: unknown, legacyName?: string) {
  const validation = validateTemplateName(value);
  if (!validation.error || value === legacyName) return validation.value;
  throw new Error(validation.error);
}
