import { adjustThemeColor, ensureThemeColorContrast, mixThemeColors, mutedThemeForeground, readableThemeForeground, themeColorContrast, withThemeColorAlpha } from "@/lib/theme/color";
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
export type DerivedColorTransform = "pressed-foreground" | "pressed-accent" | "surface-alpha" | "contrast-on-base" | "readable-foreground" | "tinted-foreground" | "muted-foreground" | "same";

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
  // 입력바 계열. `chat_input_background_color`가 채팅방 배경 **하단**을 따라가는 recipe를
  // 가지므로(`autoColorRecipe: "chat-background-bottom"`), 나머지는 그 배경 하나에서 체이닝한다.
  // 잠금화면과 같은 구조다. 여기 오기 전까지 입력바는 배경이 무엇이 되든 고정값이었고,
  // `slotContrast.ts`는 이미 이 슬롯들을 "입력창 배경 위"로 판정해 경고만 내고 있었다.
  //
  // Android
  chat_input_text_color: { baseRole: "chat_input_background_color", transform: "readable-foreground" },
  chat_menu_icon_color: { baseRole: "chat_input_background_color", transform: "muted-foreground" },
  /**
   * 메뉴 버튼과 전송 버튼의 **바탕은 입력바와 같은 색**이다. 입력바는 한 덩어리로 보여야 하고,
   * 구분은 그 위에 얹힌 아이콘이 진다.
   *
   * 전송 버튼에 채도 있는 별개 색을 자동으로 넣어 봤더니, 채팅방 배경 이미지가 없는 테마에서
   * 템플릿 강조색으로 떨어져 파스텔 톤 위에 검은 알약이 얹혔다. 상용 테마가 강조색을 쓰는 것은
   * 맞지만 그건 **디자이너가 고른 값**이지 산식으로 낼 수 있는 값이 아니다 — 실제로 입력바와의
   * 대비가 1.46~8.69로 제각각이다. 자동값은 조용한 쪽에 두고, 강조색은 직접 지정에 맡긴다.
   *
   * 바탕을 통일하는 것 자체도 상용 관행 안에 있다. LongCat과 케로케로케로피톡은 메뉴 버튼
   * 바탕을 입력바와 **똑같은 색**으로 두고, 나머지 둘은 알파로 살짝만 띄운다.
   */
  chat_menu_button_color: { baseRole: "chat_input_background_color", transform: "same" },
  chat_send_button_color: { baseRole: "chat_input_background_color", transform: "same" },
  // 아이콘이 놓이는 면은 그 전송 버튼이다. 바탕이 입력바와 같아졌어도 기준은 버튼으로 둔다 —
  // 사용자가 버튼만 강조색으로 바꾸면 아이콘이 그 색을 따라가야 한다.
  chat_send_icon_color: { baseRole: "chat_send_button_color", transform: "tinted-foreground" },
  // iOS. 위의 전송 버튼·아이콘 규칙을 그대로 쓰고 아래가 더 붙는다.
  chat_button_text_color: { baseRole: "chat_input_background_color", transform: "readable-foreground" },
  chat_button_foreground_color: { baseRole: "chat_input_background_color", transform: "muted-foreground" },
  chat_button_highlighted_foreground_color: { baseRole: "chat_button_foreground_color", transform: "pressed-foreground" },
  chat_button_background_color: { baseRole: "chat_input_background_color", transform: "same" },
  chat_send_highlighted_button_color: { baseRole: "chat_send_button_color", transform: "pressed-accent" },
  chat_send_highlighted_icon_color: { baseRole: "chat_send_highlighted_button_color", transform: "tinted-foreground" },
  // 잠금화면 계열. `passcode_background_color`가 자체 이미지 또는 메인 배경을 따라가는 recipe를
  // 가지므로(`autoColorRecipe: "passcode-background-average"`), 나머지 잠금화면 슬롯은 그 배경
  // 하나를 기준으로 체이닝한다 — 잠금화면 이미지를 따로 준비하지 않아도 전체가 완성돼 보인다.
  passcode_color: { baseRole: "passcode_background_color", transform: "readable-foreground" },
  passcode_pattern_line_color: { baseRole: "passcode_background_color", transform: "readable-foreground" },
  // 키패드 숫자는 화면 제목과 같은 잉크 색을 쓴다(기본값도 원래 같은 값이었다).
  passcode_keypad_color: { baseRole: "passcode_color", transform: "same" },
  passcode_keypad_pressed_color: { baseRole: "passcode_keypad_color", transform: "pressed-foreground" },
  // 키패드 배경은 잠금화면 배경과 같은 값을 쓰고, 눌림 상태만 그 위에 반투명 오버레이를 얹는다.
  // 둘 다 `passcode_background_color`를 기준으로 삼는다 — `pressed-foreground`(`mixThemeColors`
  // 경유)는 알파를 항상 1로 정규화해서, `surface-alpha`가 만든 반투명 값 위에 체이닝하면 알파가
  // 사라진다. 그래서 눌림 배경도 불투명한 원본 배경에서 새로 반투명화한다.
  passcode_keypad_background_color: { baseRole: "passcode_background_color", transform: "same" },
  passcode_keypad_pressed_background_color: { baseRole: "passcode_background_color", transform: "surface-alpha" },
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
      // 밝기 판정으로 방향을 정한다. 원래 recipe는 `=== "#FFFFFF"`만 봤는데, 그때는 seed가
      // 배경에서 계산된 값이라 흰색이 아닌 밝은 색이 잘 나오지 않았다. 이제 사용자가 고른
      // 글자색이 그대로 들어오므로 `#FEFEFE` 같은 값이 실제로 온다 — 그런 색을 더 밝히면
      // 상한에 걸려 눌림 상태가 원래 색과 구분되지 않는다.
      return adjustThemeColor(baseColor, readableThemeForeground(baseColor) === "#FFFFFF" ? 0.12 : -0.12);
    case "pressed-accent":
      return adjustThemeColor(baseColor, readableThemeForeground(baseColor) === "#FFFFFF" ? -0.12 : 0.12);
    case "surface-alpha":
      return withThemeColorAlpha(baseColor, defaultSurfaceAlpha);
    case "contrast-on-base":
      return ownColor ? ensureThemeColorContrast(ownColor, baseColor, defaultMinimumContrast) : baseColor;
    case "readable-foreground":
      // `contrast-on-base`와 달리 이어받을 기존 색이 없다 — 기준 색(배경) 위에서 곧바로 읽히는
      // 순수 대비색을 새로 계산한다. `main_title_color`가 쓰는 `foreground-background` recipe와
      // 같은 판정이며, seed만 배경 이미지가 아니라 기준 슬롯이다.
      return readableThemeForeground(baseColor);
    case "tinted-foreground":
      return tintedForeground(baseColor);
    case "muted-foreground":
      // 보조 글자·아이콘. `readable-foreground`가 만드는 완전 대비색은 본문과 구분되지 않아
      // 위계가 사라진다. `foreground-muted` recipe가 쓰는 함수를 그대로 쓰되 seed만 기준 슬롯이다.
      return mutedThemeForeground(baseColor);
  }
}

/**
 * `contrast-on-base`가 요구하는 기본 최소 대비. 글자로 읽히는 슬롯 기준이다.
 *
 * 처음에는 큰 글자·아이콘 기준인 3을 썼는데 실제 값을 재 보니 너무 느슨했다. 옛 강조색
 * `#6A5F00`은 **순검정 배경에서도 3.25**로 통과해 버려서, 정작 안 보이는 조합이 그대로 남았다.
 * 본문 글자 기준인 4.5로 올려야 어두운 배경에서 실제로 보정된다.
 *
 * 밝은 배경에서는 강조색이 이미 5~6.5를 넘으므로 값이 바뀌지 않는다. 그게 맞는 동작이다 —
 * 읽히는데도 색을 흔들면 테마의 강조색이 사라진다. "배경을 바꿔도 안 변한다"고 보이는 경우
 * 대부분은 원래 충분히 읽히는 조합이다.
 */
const defaultMinimumContrast = 4.5;

/** `surface-alpha`가 까는 알파. 눌렸다는 것이 보여야 하는 세기다. */
const defaultSurfaceAlpha = 0.18;

/**
 * 기준 색의 색조를 남긴 전경색.
 *
 * `readable-foreground`는 `#1F2937`과 `#FFFFFF` 둘 중 하나만 돌려준다. 어느 테마에서든 같은
 * 남색빛 검정이 나와서, 세이지 그린 버튼 위에 얹으면 테마와 따로 논다.
 *
 * **순검정으로 섞는 것이 핵심이다.** `#1F2937`로 섞으면 결과가 전부 그 남색 쪽으로 끌려간다.
 * 순검정은 RGB를 비례로 줄여서 색조와 채도 비율이 남는다 — 앰버 `#FFC754`가 갈색 `#665022`가
 * 되는데, 이 조합을 실제로 쓰는 리락쿠마 버섯 테마의 값이 `#663300`이다.
 *
 * 어두운 쪽은 **읽히는 선에서 가장 덜 어둡게** 만든다. 더 어둡게 갈수록 색조가 사라지기 때문이다.
 * 반대로 밝은 쪽은 고정으로 거의 흰색까지 간다 — LongCat이 `#FFFFFF`, 붕어빵네코가 `#fffce7`을
 * 쓰듯 레퍼런스가 그쪽은 끝까지 민다. 밝은 쪽에서 같은 방식으로 최소치를 찾으면 흰색이어야 할
 * 아이콘이 탁한 회색에서 멈춘다.
 */
function tintedForeground(baseColor: string) {
  if (readableThemeForeground(baseColor) === "#FFFFFF") return mixThemeColors(baseColor, "#FFFFFF", lightTintAmount);
  for (const amount of darkTintAmounts) {
    const candidate = mixThemeColors(baseColor, "#000000", amount);
    if (themeColorContrast(candidate, baseColor) >= defaultMinimumContrast) return candidate;
  }
  return readableThemeForeground(baseColor);
}

const darkTintAmounts = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const lightTintAmount = 0.95;
