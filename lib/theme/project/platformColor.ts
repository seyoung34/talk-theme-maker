import { themeColorRgbHex, themeColorToCss, withThemeColorAlpha } from "@/lib/theme/color";
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

/**
 * iOS에서 **투명도를 다른 슬롯이 들고 있는** 색상 role.
 *
 * `-ios-selected-background-alpha`는 색상 슬롯의 알파가 아니라 전용 알파 슬롯에서 나간다.
 * 그 슬롯은 기본값 `0.05`를 갖고 있어 `getResolvedColor`가 **항상** 값을 돌려주므로, 색상
 * 쪽에 실린 알파는 iOS 내보내기에서 언제나 덮인다. 프리뷰가 색상 쪽 알파를 그대로 그리면
 * 연동 규칙이 만든 18%가 화면에 보이지만 결과물은 5%가 된다.
 *
 * 색상과 알파가 따로 나가는 것 자체는 iOS 형식이 그렇다. 프리뷰가 그 조합을 재현해야 한다.
 *
 * `-ios-normal-background-alpha` 등 나머지 알파 프로퍼티는 전용 슬롯 없이 색상 코드의
 * 알파를 그대로 쪼개 쓰므로 여기 넣지 않는다.
 */
const iosSplitAlphaRoles: Partial<Record<ThemeResourceRole, ThemeResourceRole>> = {
  main_body_cell_pressed_color: "main_selected_background_alpha",
  main_body_cell_border_color: "main_body_cell_border_alpha",
};

/** 이 role의 투명도를 대신 들고 있는 슬롯 role. 없으면 `undefined`. */
export function getSplitAlphaSourceRole(role: ThemeResourceRole, platform: ThemePlatform) {
  return platform === "ios" ? iosSplitAlphaRoles[role] : undefined;
}

/**
 * iOS에서만 쓰는 파생 색상 대체.
 *
 * `main_description_pressed_color`에는 iOS 슬롯이 없다. 그래서 편집기에도 노출되지 않고,
 * 내보내기는 `-ios-description-highlighted-text-color`에 이름 눌림 색을 쓴다. 프리뷰만
 * `main_description_color` 폴백을 그려 화면과 결과물이 어긋났다.
 *
 * 슬롯이 없는 이상 사용자가 고를 수 있는 값이 아니므로, 프리뷰가 내보내기 쪽에 맞춘다.
 */
const iosPreviewRoleAliases: Partial<Record<ThemeResourceRole, ThemeResourceRole>> = {
  main_description_pressed_color: "main_title_pressed_color",
};

/** 이 플랫폼에서 프리뷰가 대신 읽어야 할 role. 없으면 원래 role. */
export function getPreviewColorRole(role: ThemeResourceRole, platform: ThemePlatform) {
  return (platform === "ios" ? iosPreviewRoleAliases[role] : undefined) ?? role;
}

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

/**
 * 전용 알파 슬롯의 값을 색상에 합성한다.
 *
 * 알파 슬롯은 `"0.05"` 같은 숫자 문자열을 담는다. 숫자로 읽히지 않으면 손대지 않는다 —
 * 슬롯이 비었거나 값이 깨졌을 때 색을 통째로 잃는 것보다 낫다.
 */
export function applySplitAlpha(value: string, alphaValue: string | undefined) {
  if (!alphaValue) return value;
  const alpha = Number(alphaValue);
  if (!Number.isFinite(alpha)) return value;
  return withThemeColorAlpha(value, Math.min(Math.max(alpha, 0), 1));
}

/**
 * 내보내기와 같은 조합으로 색을 정규화한다(프리뷰 role 대체 → 플랫폼 알파 지원 여부 →
 * 전용 알파 슬롯 합성 → CSS 색상).
 *
 * 갤러리 썸네일/저장된 템플릿 미리보기가 `getResolvedColor`를 직접 읽으면, 알파 짝이 없는
 * iOS role에 사용자가 반투명 색을 고른 경우 결과물은 불투명인데 미리보기만 흐리게 보인다.
 * `ThemeScreensPreview`가 편집기 프리뷰에서 쓰는 조합과 동일해야 어느 화면에서 봐도
 * 최종 결과물과 같은 색이 보인다.
 */
export function resolvePlatformPreviewColor(
  resolve: (role: ThemeResourceRole) => string | undefined,
  role: ThemeResourceRole,
  fallback: string,
  platform: ThemePlatform,
) {
  const readRole = getPreviewColorRole(role, platform);
  const value = applyPlatformColorAlpha(resolve(readRole) ?? fallback, readRole, platform);
  const alphaRole = getSplitAlphaSourceRole(readRole, platform);
  const normalized = alphaRole ? applySplitAlpha(value, resolve(alphaRole)) : value;
  return themeColorToCss(normalized);
}
