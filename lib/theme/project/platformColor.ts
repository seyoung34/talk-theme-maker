import { themeColorRgbHex } from "@/lib/theme/color";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

/**
 * iOS CSS에서 투명도를 표현할 수 있는 색상 role.
 *
 * 두 플랫폼이 투명도를 담는 자리가 다르다.
 *
 * - Android `colors.xml`은 `#AARRGGBB`로 색상 코드 안에 담는다.
 * - iOS CSS는 색상 코드에 담지 못하고 **`색상` + 별도 `-alpha` 프로퍼티** 쌍으로만 받는다.
 *
 * 카카오톡 가이드 테마(`samples/ios/apeach-25.8.0`)와 상용 테마 두 종을 대조한 결과 세 파일이
 * 완전히 같았다. 8자리 hex는 **한 번도 쓰이지 않았고**(0개), 알파 프로퍼티는 아래 다섯 개뿐이다.
 *
 *     -ios-normal-background-alpha        (MainViewStyle-Primary)
 *     -ios-selected-background-alpha      (MainViewStyle-Primary)
 *     border-alpha                        (SectionTitleStyle-Main)
 *     -ios-text-alpha                     (SectionTitleStyle-Main)
 *     -ios-button-normal-background-alpha (InputBarStyle-Chat)
 *
 * 그래서 나머지 색상은 알파를 실어 보낼 자리가 없다. 그대로 8자리로 내보내면 참조 테마에 없는
 * 형식이 나가고, 편집기·프리뷰에서 본 반투명이 결과물에서 재현되지 않는다.
 *
 * `-ios-text-alpha`는 프로퍼티 이름이 같은 다른 블록(헤더·알림 라벨 등)에는 붙지 않는다.
 * 쌍은 프로퍼티 이름이 아니라 **블록 단위**로 정해지므로, 이름이 아니라 role로 목록을 잡는다.
 */
export const iosAlphaCapableRoles: readonly ThemeResourceRole[] = [
  "main_body_cell_color",
  "main_body_cell_pressed_color",
  "main_body_cell_border_color",
  "main_section_title_color",
  "chat_button_background_color",
];

/** 이 슬롯의 색상이 그 플랫폼에서 투명도를 표현할 수 있는가. */
export function supportsColorAlpha(role: ThemeResourceRole, platform: ThemePlatform) {
  if (platform === "android") return true;
  return iosAlphaCapableRoles.includes(role);
}

/**
 * 플랫폼이 표현하지 못하는 투명도를 떨어뜨린다.
 *
 * 프리뷰와 내보내기가 **같은 함수**를 거치게 해서 "화면에서 본 것과 결과물이 다르다"가
 * 생기지 않게 한다. 값을 파싱하지 못하면(알파 전용 슬롯의 `"0.18"` 같은 숫자 문자열)
 * 손대지 않고 그대로 돌려준다.
 */
export function applyPlatformColorAlpha(value: string, role: ThemeResourceRole, platform: ThemePlatform) {
  if (supportsColorAlpha(role, platform)) return value;
  return themeColorRgbHex(value, value);
}
