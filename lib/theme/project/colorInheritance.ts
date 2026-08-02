import { adjustThemeColor, readableThemeForeground, withThemeColorAlpha } from "@/lib/theme/color";
import type { ThemeResourceRole } from "@/lib/theme/types";

/**
 * 눌림·선택 색상이 기준 색상에서 파생되는 규칙.
 *
 * 예전에는 이 슬롯들이 각자 `autoColorRecipe`로 **배경**에서 직접 값을 받았다. 그래서 기준
 * 색상이 무엇이 되든 무시했고, 사용자가 글자색을 흰색으로 바꿔도 누르는 순간 배경에서 계산된
 * 예전 색으로 돌아갔다.
 *
 * 이제는 기준 슬롯의 **해석된 값**을 seed로 같은 변환을 적용한다. 그러면 두 경로가 하나로 합쳐진다.
 *
 * - 배경 이미지를 바꾸면 → 자동 맞춤이 기준 색을 다시 계산 → 파생 색이 그 값을 따라간다
 * - 사용자가 기준 색을 직접 지정하면 → 파생 색이 그 값을 따라간다
 *
 * 변환은 기존 `autoColorRecipe`의 수식을 그대로 옮긴 것이다. seed만 배경에서 기준 슬롯으로
 * 바뀌었을 뿐이라 누를 때의 시각 피드백(12% 밝기 이동)은 유지된다.
 */
export type DerivedColorTransform = "pressed-foreground" | "pressed-accent" | "surface-alpha" | "same";

export type DerivedColorRule = {
  baseRole: ThemeResourceRole;
  transform: DerivedColorTransform;
};

/**
 * 단일 기준 슬롯의 함수로 표현되는 파생만 담는다.
 *
 * 제외한 것:
 * - `notification_background_pressed_color` — 원래 수식이 `mix(배경, accent, 0.22)`로 seed가
 *   둘이라 한 기준 슬롯의 함수가 아니다.
 * - `passcode_keypad_pressed_color` — recipe가 없고 내보내기 폴백도 상수라 기준이 없다.
 */
const derivedColorRules: Partial<Record<ThemeResourceRole, DerivedColorRule>> = {
  // foreground-pressed
  main_title_pressed_color: { baseRole: "main_title_color", transform: "pressed-foreground" },
  // muted-pressed
  main_description_pressed_color: { baseRole: "main_description_color", transform: "pressed-foreground" },
  tab_paragraph_pressed_color: { baseRole: "tab_paragraph_color", transform: "pressed-foreground" },
  // accent-pressed
  feature_primary_pressed_color: { baseRole: "feature_primary_color", transform: "pressed-accent" },
  // 원래 recipe가 기준 슬롯과 같은 `accent`였다. 값이 같아야 하므로 변환 없이 따라간다.
  main_feature_browse_tab_focused_color: { baseRole: "feature_primary_color", transform: "same" },
  // cell-pressed — 글자색을 18% 알파로 깔아 눌린 셀 배경을 만든다.
  main_body_cell_pressed_color: { baseRole: "main_title_color", transform: "surface-alpha" },
  // recipe가 없던 슬롯들. 내보내기 폴백이 원래부터 "기준 색 그대로"였다.
  chat_bubble_me_selected_color: { baseRole: "chat_bubble_me_color", transform: "same" },
  chat_bubble_you_selected_color: { baseRole: "chat_bubble_you_color", transform: "same" },
};

export function getDerivedColorRule(role: ThemeResourceRole): DerivedColorRule | undefined {
  return derivedColorRules[role];
}

/** 기준 색상 role. 짝이 없으면 `undefined`. */
export function getColorFallbackRole(role: ThemeResourceRole): ThemeResourceRole | undefined {
  return derivedColorRules[role]?.baseRole;
}

/**
 * 기준 색에서 파생 색을 만든다.
 *
 * 눌림 계열은 색을 배경 쪽으로 12% 밀어 대비를 살짝 낮춘다. 밝은 색은 어둡게, 어두운 색은
 * 밝게 — 원래 recipe가 쓰던 판정을 그대로 옮겼다.
 */
export function applyDerivedColorTransform(baseColor: string, transform: DerivedColorTransform) {
  switch (transform) {
    case "same":
      return baseColor;
    case "pressed-foreground":
      return adjustThemeColor(baseColor, baseColor.toUpperCase() === "#FFFFFF" ? -0.12 : 0.12);
    case "pressed-accent":
      return adjustThemeColor(baseColor, readableThemeForeground(baseColor) === "#FFFFFF" ? -0.12 : 0.12);
    case "surface-alpha":
      return withThemeColorAlpha(baseColor, 0.18);
  }
}
