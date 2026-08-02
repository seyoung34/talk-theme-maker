import { adjustThemeColor, ensureThemeColorContrast, readableThemeForeground, withThemeColorAlpha } from "@/lib/theme/color";
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
 *
 * `contrast-on-base`만 성격이 다르다. 나머지는 "기준 색을 가져와 변형한다"인데, 이건 **기준
 * 색을 배경으로 삼아 자기 색을 읽히게 보정한다**. 읽지 않음 숫자가 그렇다 — 채팅방 배경색을
 * 따라가는 게 아니라 그 위에서 보여야 한다. seed가 기준 슬롯이 아니라 자기 기본값이다.
 */
export type DerivedColorTransform = "pressed-foreground" | "pressed-accent" | "surface-alpha" | "contrast-on-base" | "same";

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
  // 읽지 않음 숫자는 말풍선 바깥, 채팅방 배경 위에 그려진다. 강조색을 유지하되 그 배경에서
  // 읽히도록 보정한다. 자동 맞춤은 **메인** 배경 기준이라 이 슬롯에는 맞지 않는다.
  chat_unread_count_color: { baseRole: "chat_background_color", transform: "contrast-on-base" },
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
 *
 * `ownColor`는 `contrast-on-base`에서만 쓴다. 그 경우 `baseColor`는 따라갈 색이 아니라
 * **깔려 있는 배경**이고, 자기 색을 그 위에서 읽히도록 최소 대비까지만 민다. 이미 충분히
 * 읽히면 `ensureThemeColorContrast`가 값을 그대로 돌려주므로 기존 테마는 바뀌지 않는다.
 */
export function applyDerivedColorTransform(baseColor: string, transform: DerivedColorTransform, ownColor?: string) {
  switch (transform) {
    case "same":
      return baseColor;
    case "pressed-foreground":
      return adjustThemeColor(baseColor, baseColor.toUpperCase() === "#FFFFFF" ? -0.12 : 0.12);
    case "pressed-accent":
      return adjustThemeColor(baseColor, readableThemeForeground(baseColor) === "#FFFFFF" ? -0.12 : 0.12);
    case "surface-alpha":
      return withThemeColorAlpha(baseColor, 0.18);
    case "contrast-on-base":
      return ownColor ? ensureThemeColorContrast(ownColor, baseColor, unreadCountMinimumContrast) : baseColor;
  }
}

/**
 * 읽지 않음 숫자에 요구하는 최소 대비.
 *
 * 처음에는 큰 글자·아이콘 기준인 3을 썼는데 실제 값을 재 보니 너무 느슨했다. 기본 강조색
 * `#6A5F00`은 **순검정 배경에서도 3.25**로 통과해 버려서, 정작 안 보이는 조합이 그대로 남았다.
 * 본문 글자 기준인 4.5로 올려야 어두운 배경에서 실제로 보정된다.
 *
 * 밝은 배경에서는 이 강조색이 이미 5~6.5를 넘으므로 값이 바뀌지 않는다. 그게 맞는 동작이다 —
 * 읽히는데도 색을 흔들면 테마의 강조색이 사라진다. "배경을 바꿔도 안 변한다"고 보이는 경우
 * 대부분은 원래 충분히 읽히는 조합이다.
 */
const unreadCountMinimumContrast = 4.5;
