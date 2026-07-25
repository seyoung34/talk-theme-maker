import { describe, expect, it } from "vitest";
import { assertValidTemplateName, templateNameMaxLength, validateTemplateName } from "@/lib/theme/templateName";

describe("template names", () => {
  it("accepts and trims names up to 25 visible code points", () => {
    const name = "가".repeat(templateNameMaxLength);

    expect(validateTemplateName(`  ${name}  `)).toEqual({ value: name, error: null });
  });

  it("rejects empty, multiline, and overlong names", () => {
    expect(validateTemplateName("   ").error).toBe("템플릿 이름을 입력해 주세요.");
    expect(validateTemplateName("첫 줄\n둘째 줄").error).toContain("줄바꿈");
    expect(validateTemplateName("가".repeat(templateNameMaxLength + 1)).error).toContain("25자 이하");
  });

  it("permits an unchanged legacy name only when explicitly passed", () => {
    const legacyName = "가".repeat(templateNameMaxLength + 1);

    expect(() => assertValidTemplateName(legacyName)).toThrow("25자 이하");
    expect(assertValidTemplateName(legacyName, legacyName)).toBe(legacyName);
  });
});
