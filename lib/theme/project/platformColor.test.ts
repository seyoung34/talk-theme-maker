import { describe, expect, it } from "vitest";
import { applyPlatformColorAlpha, applySplitAlpha, getPreviewColorRole, getSplitAlphaSourceRole, iosAlphaCapableRoles, resolvePlatformPreviewColor, supportsColorAlpha } from "@/lib/theme/project/platformColor";
import { getThemeSlots } from "@/lib/theme/templates";
import type { ThemeResourceRole } from "@/lib/theme/types";

/**
 * 플랫폼별 투명도 표현 계약.
 *
 * 두 플랫폼이 투명도를 담는 자리가 다르다. Android `colors.xml`은 `#AARRGGBB`로 색상 코드 안에
 * 담고, iOS CSS는 대부분 담지 못해 별도 `-alpha` 프로퍼티 쌍으로 받는다. 단, 실기기에서
 * 확인된 TabBarStyle-Main의 background-color는 8자리 색상을 직접 받는다.
 *
 * 목록의 근거는 참조 테마 세 종(카카오톡 가이드 1 + 상용 2)이다. 세 파일 모두 8자리 hex가
 * 0개였고 알파 프로퍼티는 정확히 다섯 개로 같았다. 탭바의 8자리 색상 동작은 별도 실기기
 * 검증으로 확인되어 직접 alpha 지원 목록에 포함한다.
 */
describe("supportsColorAlpha", () => {
  it("Android는 모든 색상이 알파를 담을 수 있다", () => {
    expect(supportsColorAlpha("main_title_color", "android")).toBe(true);
    expect(supportsColorAlpha("chat_bubble_me_color", "android")).toBe(true);
  });

  it("iOS는 검증된 alpha 지원 role만 가능하다", () => {
    expect(iosAlphaCapableRoles).toHaveLength(6);
    for (const role of iosAlphaCapableRoles) expect(supportsColorAlpha(role, "ios")).toBe(true);
  });

  it("iOS의 나머지 색상은 알파를 담을 수 없다", () => {
    // 참조 테마 어디에도 이 프로퍼티에 8자리 hex나 -alpha 짝이 없다.
    expect(supportsColorAlpha("main_title_color", "ios")).toBe(false);
    expect(supportsColorAlpha("chat_bubble_me_color", "ios")).toBe(false);
    expect(supportsColorAlpha("chat_background_color", "ios")).toBe(false);
  });

  it("alpha 지원 role 중 넷은 iOS 편집 가능한 슬롯이 있다", () => {
    // 나머지 둘은 iOS 매니페스트에 슬롯이 없어 내보내기 폴백으로만 채워진다.
    // `-ios-normal-background-*`는 참조 테마와 같은 투명 셀(알파 0.0)로,
    // `-ios-text-*`(SectionTitleStyle)는 이름 색상으로 이어진다.
    // 목록에는 남겨 둔다 — CSS가 알파를 받을 수 있는 자리를 기록하는 것이 이 상수의 역할이고,
    // 나중에 슬롯이 추가되면 편집기·프리뷰가 곧바로 알파를 허용해야 한다.
    const iosRoles = new Set(getThemeSlots("ios").map((slot) => slot.role));
    expect(iosAlphaCapableRoles.filter((role) => iosRoles.has(role))).toEqual([
      "main_body_cell_pressed_color",
      "main_body_cell_border_color",
      "chat_button_background_color",
      "tab_background",
    ]);
    expect(iosAlphaCapableRoles.filter((role) => !iosRoles.has(role))).toEqual([
      "main_body_cell_color",
      "main_section_title_color",
    ]);
  });
});

describe("applyPlatformColorAlpha", () => {
  it("Android는 8자리를 그대로 둔다", () => {
    expect(applyPlatformColorAlpha("#80111111", "main_title_color", "android")).toBe("#80111111");
  });

  it("iOS에서 담을 자리가 없으면 6자리로 절삭한다", () => {
    expect(applyPlatformColorAlpha("#80111111", "main_title_color", "ios")).toBe("#111111");
  });

  it("iOS에서도 알파 짝이 있는 role은 그대로 둔다", () => {
    // 이 값은 내보내기에서 색상과 알파 두 프로퍼티로 나뉜다.
    expect(applyPlatformColorAlpha("#0FFFFFFF", "chat_button_background_color", "ios")).toBe("#0FFFFFFF");
  });

  it("실기기에서 검증한 iOS 탭바 배경색의 8자리 alpha를 그대로 둔다", () => {
    expect(applyPlatformColorAlpha("#80111111", "tab_background", "ios")).toBe("#80111111");
  });

  it("6자리는 어느 쪽에서도 바뀌지 않는다", () => {
    expect(applyPlatformColorAlpha("#111111", "main_title_color", "ios")).toBe("#111111");
    expect(applyPlatformColorAlpha("#111111", "main_title_color", "android")).toBe("#111111");
  });

  it("색상이 아닌 값은 손대지 않는다", () => {
    // 알파 전용 슬롯은 "0.18" 같은 숫자 문자열을 담는다.
    expect(applyPlatformColorAlpha("0.18", "main_body_cell_border_alpha", "ios")).toBe("0.18");
  });
});

/**
 * 색상과 투명도가 **다른 슬롯**으로 나뉘는 자리.
 *
 * iOS 내보내기는 `-ios-selected-background-alpha`를 전용 알파 슬롯에서 가져온다. 그 슬롯은
 * 기본값 `0.05`를 갖고 있어 항상 값이 나오므로, 색상 코드에 실린 알파는 iOS에서 언제나
 * 덮인다. 연동 규칙이 만든 18%가 프리뷰에는 보이고 결과물은 5%였던 원인이다.
 */
describe("getSplitAlphaSourceRole", () => {
  it("iOS 눌림 셀 배경의 투명도는 전용 슬롯에서 온다", () => {
    expect(getSplitAlphaSourceRole("main_body_cell_pressed_color", "ios")).toBe("main_selected_background_alpha");
  });

  it("iOS 셀 구분선의 투명도도 전용 슬롯(border-alpha)에서 온다", () => {
    // 내보내기의 SectionTitleStyle-Main은 border-color/border-alpha를 따로 낸다.
    // 색상 코드의 알파를 프리뷰가 그대로 그리면 전용 슬롯 값이 결과물에서 덮이는 것과 어긋난다.
    expect(getSplitAlphaSourceRole("main_body_cell_border_color", "ios")).toBe("main_body_cell_border_alpha");
  });

  it("Android는 색상 코드가 투명도를 직접 담는다", () => {
    expect(getSplitAlphaSourceRole("main_body_cell_pressed_color", "android")).toBeUndefined();
  });

  it("전용 알파 슬롯이 없는 role은 대상이 아니다", () => {
    // `-ios-normal-background-alpha`는 색상 코드의 알파를 그대로 쪼개 쓴다.
    expect(getSplitAlphaSourceRole("main_body_cell_color", "ios")).toBeUndefined();
    expect(getSplitAlphaSourceRole("main_title_color", "ios")).toBeUndefined();
  });

  it("전용 슬롯 값이 색상의 알파를 덮는다", () => {
    // 연동 규칙은 18%를 만들지만 iOS 결과물은 5%다. 프리뷰가 결과물을 따라간다.
    expect(applySplitAlpha("#2E111111", "0.05")).toBe(applySplitAlpha("#111111", "0.05"));
    expect(applySplitAlpha("#2E111111", "0.05")).not.toBe("#2E111111");
  });

  it("숫자로 읽히지 않는 알파는 무시한다", () => {
    expect(applySplitAlpha("#2E111111", undefined)).toBe("#2E111111");
    expect(applySplitAlpha("#2E111111", "")).toBe("#2E111111");
    expect(applySplitAlpha("#2E111111", "없음")).toBe("#2E111111");
  });
});

/**
 * 갤러리 썸네일/저장된 템플릿 미리보기 등 export를 거치지 않는 화면이 색을 읽을 때 쓰는
 * 조합 함수. 내보내기와 같은 규칙(알파 짝 없는 role은 절삭, 전용 알파 슬롯은 합성)을
 * 적용해야 화면과 결과물이 어긋나지 않는다.
 */
describe("resolvePlatformPreviewColor", () => {
  it("iOS에서 알파 짝이 없는 role은 알파를 절삭한다", () => {
    const resolve = () => "#2E111111";
    expect(resolvePlatformPreviewColor(resolve, "main_title_color", "#000000", "ios")).toBe("#111111");
  });

  it("iOS에서 전용 알파 슬롯이 있는 role은 그 슬롯 값으로 합성한다", () => {
    const values: Partial<Record<ThemeResourceRole, string>> = {
      main_body_cell_border_color: "#111111",
      main_body_cell_border_alpha: "0.4",
    };
    const resolve = (role: ThemeResourceRole) => values[role];
    const result = resolvePlatformPreviewColor(resolve, "main_body_cell_border_color", "#000000", "ios");
    expect(result).toBe("rgb(17 17 17 / 0.400)");
  });

  it("iOS 섹션 제목은 description 값을 읽되 SectionTitle의 알파는 유지한다", () => {
    const values: Partial<Record<ThemeResourceRole, string>> = {
      main_description_color: "#80112233",
    };
    const resolve = (role: ThemeResourceRole) => values[role];
    expect(resolvePlatformPreviewColor(resolve, "main_section_title_color", "#000000", "ios")).toBe("rgb(17 34 51 / 0.502)");
  });

  it("Android는 색상 코드의 알파를 그대로 둔다", () => {
    const resolve = () => "#2E111111";
    const result = resolvePlatformPreviewColor(resolve, "main_title_color", "#000000", "android");
    expect(result).not.toBe("#111111");
  });

  it("값이 없으면 fallback을 같은 규칙으로 정규화한다", () => {
    const resolve = () => undefined;
    expect(resolvePlatformPreviewColor(resolve, "main_title_color", "#2E111111", "ios")).toBe("#111111");
  });
});

/**
 * iOS에 슬롯이 없는 role은 프리뷰가 내보내기 쪽 표현을 따라간다.
 *
 * `main_description_pressed_color`는 iOS 매니페스트에 없어 편집기에 노출되지 않는데,
 * 내보내기는 `-ios-description-highlighted-text-color`에 이름 눌림 색을 쓴다. 프리뷰만
 * 다른 폴백을 그리면 사용자가 고칠 수도 없는 불일치가 남는다.
 */
describe("getPreviewColorRole", () => {
  it("iOS에 슬롯이 없는 눌림 색은 내보내기가 쓰는 role로 읽는다", () => {
    const iosRoles = new Set(getThemeSlots("ios").map((slot) => slot.role));
    expect(iosRoles.has("main_description_pressed_color")).toBe(false);
    expect(getPreviewColorRole("main_description_pressed_color", "ios")).toBe("main_title_pressed_color");
  });

  it("iOS 섹션 제목은 상태 메시지 색상 role을 읽는다", () => {
    const iosRoles = new Set(getThemeSlots("ios").map((slot) => slot.role));
    expect(iosRoles.has("main_section_title_color")).toBe(false);
    expect(getPreviewColorRole("main_section_title_color", "ios")).toBe("main_description_color");
  });

  it("Android는 자기 슬롯이 있으므로 그대로 읽는다", () => {
    const androidRoles = new Set(getThemeSlots("android").map((slot) => slot.role));
    expect(androidRoles.has("main_description_pressed_color")).toBe(true);
    expect(getPreviewColorRole("main_description_pressed_color", "android")).toBe("main_description_pressed_color");
  });

  it("대체가 없는 role은 그대로 둔다", () => {
    expect(getPreviewColorRole("main_title_color", "ios")).toBe("main_title_color");
  });
});
