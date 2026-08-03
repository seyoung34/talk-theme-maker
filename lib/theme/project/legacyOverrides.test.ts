import { describe, expect, it } from "vitest";
import { normalizeLegacyColorOverrides, normalizeLegacyThemeDraft } from "@/lib/theme/project/legacyOverrides";
import { autoMainPaletteCandidateId } from "@/lib/theme/autoColor";
import { createEmptyThemeDraft } from "@/lib/theme/project/draft";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

const templateId = "basic" as const;
const template = getThemeTemplate(templateId);

function context(platform: ThemePlatform) {
  return { templateId, template, slots: getThemeSlots(platform) };
}

function slotId(platform: ThemePlatform, role: ThemeResourceRole) {
  const slot = getThemeSlots(platform).find((candidate) => candidate.role === role);
  if (!slot) throw new Error(`${platform} 슬롯 없음: ${role}`);
  return slot.id;
}

/**
 * 저장본에 굳어 있는 파생 색을 연동으로 되돌리는 계약.
 *
 * 사용자가 고를 수 있는 시작점이 시스템 템플릿뿐이라, 불러오기에서 풀지 않으면 눌림 색
 * 연동이 아무에게도 닿지 않는다. 실제 DB의 기본 템플릿이 정확히 이 상태였다.
 */
describe("normalizeLegacyColorOverrides - 파생 색 연동 복원", () => {
  const titlePressed = slotId("android", "main_title_pressed_color");
  const title = slotId("android", "main_title_color");

  it("자동 맞춤 잔재가 남은 눌림 색은 값이 달라도 해제한다", () => {
    // 옛 눌림 레시피는 중간 회색을 **밝게** 밀었다. 지금 변환은 밝기로 판정해 어둡게 민다.
    // 값이 다르다고 유지하면 그 옛 버그가 저장본에 영원히 남는다.
    const { colors, candidateSelections } = normalizeLegacyColorOverrides(
      "android",
      { [title]: "#1F2937", [titlePressed]: "#8E959C" },
      { [title]: autoMainPaletteCandidateId, [titlePressed]: autoMainPaletteCandidateId },
      context("android"),
    );
    expect(colors[titlePressed]).toBeUndefined();
    expect(colors[title]).toBe("#1F2937");
    expect(candidateSelections[titlePressed]).toBeUndefined();
    expect(candidateSelections[title]).toBe(autoMainPaletteCandidateId);
  });

  it("Android 파생 슬롯은 고정 색이 없어도 오래된 자동 선택 표시를 지운다", () => {
    const { candidateSelections } = normalizeLegacyColorOverrides(
      "android",
      {},
      { [titlePressed]: autoMainPaletteCandidateId },
      context("android"),
    );
    expect(candidateSelections[titlePressed]).toBeUndefined();
  });

  it("잔재가 없어도 값이 계산 결과와 같으면 해제한다", () => {
    const { colors } = normalizeLegacyColorOverrides(
      "android",
      { [title]: "#1F2937", [titlePressed]: "#3A434F" },
      {},
      context("android"),
    );
    expect(colors[titlePressed]).toBeUndefined();
  });

  it("대소문자가 달라도 같은 값으로 본다", () => {
    const { colors } = normalizeLegacyColorOverrides(
      "android",
      { [title]: "#1F2937", [titlePressed]: "#3a434f" },
      {},
      context("android"),
    );
    expect(colors[titlePressed]).toBeUndefined();
  });

  it("잔재도 없고 값도 다르면 작성자가 고른 색으로 보고 유지한다", () => {
    const { colors } = normalizeLegacyColorOverrides(
      "android",
      { [title]: "#1F2937", [titlePressed]: "#FF0000" },
      {},
      context("android"),
    );
    expect(colors[titlePressed]).toBe("#FF0000");
  });

  it("파생 규칙이 없는 슬롯은 건드리지 않는다", () => {
    const background = slotId("android", "main_background_color");
    const { colors } = normalizeLegacyColorOverrides(
      "android",
      { [background]: "#123456" },
      { [background]: autoMainPaletteCandidateId },
      context("android"),
    );
    expect(colors[background]).toBe("#123456");
  });

  it("iOS도 자동 잔재로 판별된다 - 표시를 지우기 전에 판단해야 한다", () => {
    // iOS는 이 함수가 자동 표시를 **제거**한다. 복원을 그 뒤에 하면 근거가 사라져
    // 같은 템플릿인데 안드로이드만 풀리고 iOS는 옛 값이 남는다.
    const iosPressed = slotId("ios", "main_title_pressed_color");
    const iosTitle = slotId("ios", "main_title_color");
    const { colors, candidateSelections } = normalizeLegacyColorOverrides(
      "ios",
      { [iosTitle]: "#1F2937", [iosPressed]: "#8E959C" },
      { [iosPressed]: autoMainPaletteCandidateId },
      context("ios"),
    );
    expect(colors[iosPressed]).toBeUndefined();
    expect(candidateSelections[iosPressed]).toBeUndefined();
  });

  it("자동 저장·복구 초안도 런타임 승격과 legacy 연동 복원을 함께 적용한다", () => {
    const draft = createEmptyThemeDraft();
    const normalized = normalizeLegacyThemeDraft("android", templateId, {
      ...draft,
      colors: { [title]: "#1F2937", [titlePressed]: "#8E959C" },
      candidateSelections: { [titlePressed]: autoMainPaletteCandidateId },
      bubbleGeometry: undefined,
      bubbleFlipX: undefined,
    });

    expect(normalized.colors[titlePressed]).toBeUndefined();
    expect(normalized.candidateSelections[titlePressed]).toBeUndefined();
    expect(normalized.bubbleGeometry).toEqual({});
    expect(normalized.bubbleFlipX).toEqual({});
  });
});
