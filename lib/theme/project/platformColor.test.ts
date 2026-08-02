import { describe, expect, it } from "vitest";
import { applyPlatformColorAlpha, iosAlphaCapableRoles, supportsColorAlpha } from "@/lib/theme/project/platformColor";
import { getThemeSlots } from "@/lib/theme/templates";

/**
 * 플랫폼별 투명도 표현 계약.
 *
 * 두 플랫폼이 투명도를 담는 자리가 다르다. Android `colors.xml`은 `#AARRGGBB`로 색상 코드 안에
 * 담고, iOS CSS는 담지 못해 별도 `-alpha` 프로퍼티 쌍으로만 받는다.
 *
 * 목록의 근거는 참조 테마 세 종(카카오톡 가이드 1 + 상용 2)이다. 세 파일 모두 8자리 hex가
 * 0개였고 알파 프로퍼티는 정확히 다섯 개로 같았다.
 */
describe("supportsColorAlpha", () => {
  it("Android는 모든 색상이 알파를 담을 수 있다", () => {
    expect(supportsColorAlpha("main_title_color", "android")).toBe(true);
    expect(supportsColorAlpha("chat_bubble_me_color", "android")).toBe(true);
  });

  it("iOS는 알파 짝이 있는 다섯 개만 가능하다", () => {
    expect(iosAlphaCapableRoles).toHaveLength(5);
    for (const role of iosAlphaCapableRoles) expect(supportsColorAlpha(role, "ios")).toBe(true);
  });

  it("iOS의 나머지 색상은 알파를 담을 수 없다", () => {
    // 참조 테마 어디에도 이 프로퍼티에 8자리 hex나 -alpha 짝이 없다.
    expect(supportsColorAlpha("main_title_color", "ios")).toBe(false);
    expect(supportsColorAlpha("chat_bubble_me_color", "ios")).toBe(false);
    expect(supportsColorAlpha("chat_background_color", "ios")).toBe(false);
  });

  it("다섯 중 셋만 iOS 편집 가능한 슬롯이 있다", () => {
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

  it("6자리는 어느 쪽에서도 바뀌지 않는다", () => {
    expect(applyPlatformColorAlpha("#111111", "main_title_color", "ios")).toBe("#111111");
    expect(applyPlatformColorAlpha("#111111", "main_title_color", "android")).toBe("#111111");
  });

  it("색상이 아닌 값은 손대지 않는다", () => {
    // 알파 전용 슬롯은 "0.18" 같은 숫자 문자열을 담는다.
    expect(applyPlatformColorAlpha("0.18", "main_body_cell_border_alpha", "ios")).toBe("0.18");
  });
});
