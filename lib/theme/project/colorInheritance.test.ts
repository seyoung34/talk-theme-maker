import { describe, expect, it } from "vitest";
import { applyDerivedColorTransform, getColorFallbackRole, getDerivedColorRule } from "@/lib/theme/project/colorInheritance";
import {
  getInheritedColorSourceSlot,
  getInitialSlotCandidateSelections,
  getResolvedColor,
  isSlotReady,
  slotStatusLabel,
} from "@/lib/theme/project/state";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";
import { themeColorContrast } from "@/lib/theme/color";

/**
 * 눌림·선택 색상의 기준 색 연동.
 *
 * 예전에는 이 슬롯들이 각자 `autoColorRecipe`로 배경에서 값을 받아, 사용자가 기준 색을 바꿔도
 * 따라가지 않았다. 이제 기준 슬롯의 해석값을 seed로 같은 변환을 적용한다.
 *
 * **선택 상태는 반드시 `getInitialSlotCandidateSelections`로 만든다.** 새 프로젝트는 모든
 * 색상 슬롯에 기본 후보 id를 넣어 두기 때문에, 빈 객체로 시험하면 실제로는 한 번도 켜지지
 * 않는 연동을 통과시킨다. 이 파일이 처음 그 함정에 빠졌었다.
 */
const slots = getThemeSlots("android");
const template = getThemeTemplate("basic");
const initialSelections = getInitialSlotCandidateSelections(slots, "basic", template);

const bySlotRole = (role: string) => slots.find((slot) => slot.role === role)!;
const title = bySlotRole("main_title_color");
const titlePressed = bySlotRole("main_title_pressed_color");
const background = bySlotRole("main_background_color");

// 말풍선 선택 색상은 iOS 전용 슬롯이다.
const iosSlots = getThemeSlots("ios");
const iosSelections = getInitialSlotCandidateSelections(iosSlots, "basic", template);
const bubbleMe = iosSlots.find((slot) => slot.role === "chat_bubble_me_color")!;
const bubbleMeSelected = iosSlots.find((slot) => slot.role === "chat_bubble_me_selected_color")!;

function resolve(slot: typeof title, colors: Record<string, string | undefined>) {
  return getResolvedColor(slot, colors, initialSelections, "basic", template, slots);
}

describe("파생 색상 규칙", () => {
  it("눌림·선택 색을 기준 색에 짝지어 준다", () => {
    expect(getColorFallbackRole("main_title_pressed_color")).toBe("main_title_color");
    expect(getColorFallbackRole("tab_paragraph_pressed_color")).toBe("tab_paragraph_color");
    expect(getColorFallbackRole("chat_bubble_me_selected_color")).toBe("chat_bubble_me_color");
    expect(getColorFallbackRole("main_body_cell_pressed_color")).toBe("main_title_color");
  });

  it("한 기준 슬롯의 함수로 표현되지 않는 파생은 제외한다", () => {
    // 알림 배경 눌림은 원래 수식이 mix(배경, accent, 0.22)라 seed가 둘이다.
    expect(getColorFallbackRole("notification_background_pressed_color")).toBeUndefined();
    expect(getColorFallbackRole("main_title_color")).toBeUndefined();
  });

  it("눌림 변환은 색을 배경 쪽으로 민다", () => {
    // 밝은 색은 어둡게, 어두운 색은 밝게.
    expect(applyDerivedColorTransform("#FFFFFF", "pressed-foreground")).not.toBe("#FFFFFF");
    expect(applyDerivedColorTransform("#111111", "pressed-foreground")).not.toBe("#111111");
    expect(applyDerivedColorTransform("#FF0000", "same")).toBe("#FF0000");
  });

  /**
   * 방향 판정이 `=== "#FFFFFF"`이던 시절, 흰색이 아닌 밝은 색은 전부 "더 밝게"로 갔다.
   * 상한에 걸려 눌림 상태가 원래 색과 사실상 같아진다. 예전에는 seed가 배경에서 계산돼
   * 이런 값이 잘 안 나왔지만, 이제는 사용자가 고른 글자색이 그대로 들어온다.
   */
  it("흰색에 가까운 색도 눌림이 구분된다", () => {
    for (const base of ["#FEFEFE", "#F8F8F8", "#EEEEEE"]) {
      const pressed = applyDerivedColorTransform(base, "pressed-foreground");
      expect(pressed).not.toBe(base);
      // 밝은 쪽이 아니라 어두운 쪽으로 밀려야 실제로 눈에 띈다.
      expect(themeColorContrast(pressed, "#FFFFFF")).toBeGreaterThan(themeColorContrast(base, "#FFFFFF"));
    }
  });
});

describe("읽지 않음 숫자 — 채팅방 배경 대비 보정", () => {
  const unread = bySlotRole("chat_unread_count_color");
  const chatBackground = bySlotRole("chat_background_color");

  it("기준 슬롯은 채팅방 배경이다", () => {
    // 말풍선 바깥에 그려지므로 대비 상대는 채팅방 배경이다. 자동 맞춤은 메인 배경 기준이라
    // 이 슬롯에 맞지 않는다.
    expect(getColorFallbackRole("chat_unread_count_color")).toBe("chat_background_color");
    expect(getDerivedColorRule("chat_unread_count_color")?.transform).toBe("contrast-on-base");
  });

  it("배경색을 따라가는 게 아니라 그 위에서 읽히도록 보정한다", () => {
    // 배경을 그대로 쓰면 배경과 같은 색이 되어 아예 보이지 않는다.
    const onDark = resolve(unread, { [chatBackground.id]: "#101010" });
    expect(onDark).not.toBe("#101010");
    expect(onDark).toBeDefined();
  });

  it("배경이 밝을 때와 어두울 때 값이 달라진다", () => {
    expect(resolve(unread, { [chatBackground.id]: "#101010" })).not.toBe(resolve(unread, { [chatBackground.id]: "#FFFFFF" }));
  });

  it("이미 충분히 읽히면 강조색을 그대로 둔다", () => {
    // 대비가 넉넉하면 ensureThemeColorContrast가 값을 건드리지 않는다. 기존 테마의
    // 색감이 이유 없이 바뀌지 않게 하는 성질이다.
    const accent = resolve(unread, {})!;
    expect(themeColorContrast(accent, "#FFFFFF")).toBeGreaterThan(4.5);
    expect(resolve(unread, { [chatBackground.id]: "#FFFFFF" })).toBe(accent);
  });

  /**
   * 하한을 3으로 두면 기본 강조색이 순검정에서도 3.25로 통과해, 정작 안 보이는 조합이 그대로
   * 남는다. "배경을 바꿔도 색이 안 변한다"는 신고가 여기서 나왔다. 값이 아니라 **결과 대비**를
   * 단언해야 하한을 되돌렸을 때 잡힌다.
   *
   * 4.5를 항상 넘긴다고는 단언할 수 없다. 중간 회색(#888888)은 이 앱이 쓰는 전경색 쌍으로도
   * 4.14가 한계다 — `ensureThemeColorContrast`가 마지막에 `readableThemeForeground`로 물러나는데
   * 그 값 자체가 못 넘는다. 그래서 "항상 4.5"가 아니라 **절대 나빠지지 않는다**를 잠근다.
   */
  it("어떤 배경에서도 강조색보다 대비가 나빠지지 않는다", () => {
    const seed = resolve(unread, {})!;
    for (const background of ["#000000", "#101010", "#303030", "#4D5660", "#888888", "#B8F2F7", "#FFFFFF"]) {
      const result = resolve(unread, { [chatBackground.id]: background })!;
      expect(themeColorContrast(result, background)).toBeGreaterThanOrEqual(themeColorContrast(seed, background));
    }
  });

  it("어두운 배경에서는 하한을 넘긴다", () => {
    for (const background of ["#000000", "#101010", "#303030", "#4D5660"]) {
      const result = resolve(unread, { [chatBackground.id]: background })!;
      expect(themeColorContrast(result, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("순검정 배경에서 실제로 보정된다", () => {
    // 하한이 3이던 시절 이 조합이 그대로 통과했다.
    expect(resolve(unread, { [chatBackground.id]: "#000000" })).not.toBe(resolve(unread, {}));
  });

  it("직접 지정하면 보정하지 않는다", () => {
    expect(resolve(unread, { [unread.id]: "#FF0000", [chatBackground.id]: "#FF0000" })).toBe("#FF0000");
  });
});

/**
 * `getResolvedColor`는 기준 슬롯을 재귀로 따라간다. 잠금화면 계열이 생기면서 기준 슬롯이 그
 * 자체로 또 파생인 체인이 실제로 존재하므로(키패드 눌림 → 키패드 숫자 → 텍스트 → 배경),
 * 재귀를 멈추는 것은 "한 단계로 끝난다"가 아니라 **그래프에 순환이 없다**는 사실 하나뿐이다.
 *
 * 규칙을 새로 추가하다 순환을 만들면 런타임에서 스택 오버플로로 터진다. 개별 체인을 하나씩
 * 확인하는 대신 규칙 표 전체를 훑어서 잠근다.
 */
describe("파생 규칙 그래프", () => {
  it("순환이 없다", () => {
    const roles = [...getThemeSlots("android"), ...getThemeSlots("ios")].map((slot) => slot.role);

    for (const role of roles) {
      const seen: string[] = [];
      let current: string | undefined = role;
      while (current) {
        expect(seen, `파생 규칙에 순환이 있다: ${[...seen, current].join(" → ")}`).not.toContain(current);
        seen.push(current);
        current = getColorFallbackRole(current as Parameters<typeof getColorFallbackRole>[0]);
      }
    }
  });

  it("체인의 끝은 직접 지정하거나 배경에서 자동 계산되는 슬롯이다", () => {
    // 끝까지 따라가면 더 이상 따라갈 기준이 없는 슬롯이 나와야 한다. 그 슬롯이 실제 값의
    // 출처이므로, 여기가 비어 있으면 체인 전체가 자기 기본값으로 주저앉는다.
    const terminal = (role: string) => {
      let current = role;
      for (let next = getColorFallbackRole(current as Parameters<typeof getColorFallbackRole>[0]); next; next = getColorFallbackRole(current as Parameters<typeof getColorFallbackRole>[0])) {
        current = next;
      }
      return current;
    };

    expect(terminal("passcode_keypad_pressed_color")).toBe("passcode_background_color");
    expect(terminal("passcode_keypad_color")).toBe("passcode_background_color");
    expect(terminal("main_title_pressed_color")).toBe("main_title_color");
    // 종착 슬롯은 배경 자동 맞춤 recipe를 갖고 있어야 배경 변경이 체인 전체로 전파된다.
    expect(bySlotRole("passcode_background_color").autoColorRecipe).toBe("passcode-background-average");
  });
});

describe("잠금화면 — 배경 하나로 나머지 슬롯이 체이닝된다", () => {
  const passcodeBackground = bySlotRole("passcode_background_color");
  const passcodeText = bySlotRole("passcode_color");
  const patternLine = bySlotRole("passcode_pattern_line_color");
  const keypadColor = bySlotRole("passcode_keypad_color");
  const keypadPressedColor = bySlotRole("passcode_keypad_pressed_color");
  const keypadBackground = bySlotRole("passcode_keypad_background_color");
  const keypadPressedBackground = bySlotRole("passcode_keypad_pressed_background_color");

  it("텍스트·패턴 라인은 배경 위에서 읽히는 순수 대비색이다", () => {
    expect(getDerivedColorRule("passcode_color")).toEqual({ baseRole: "passcode_background_color", transform: "readable-foreground" });
    expect(getDerivedColorRule("passcode_pattern_line_color")).toEqual({ baseRole: "passcode_background_color", transform: "readable-foreground" });
    expect(applyDerivedColorTransform("#FCC5C5", "readable-foreground")).toBe("#1F2937");
    expect(applyDerivedColorTransform("#101010", "readable-foreground")).toBe("#FFFFFF");
  });

  it("배경을 바꾸면 텍스트·패턴 라인이 함께 갱신된다", () => {
    const onLight = resolve(passcodeText, { [passcodeBackground.id]: "#FCC5C5" });
    const onDark = resolve(passcodeText, { [passcodeBackground.id]: "#101010" });
    expect(onLight).not.toBe(onDark);
    expect(resolve(patternLine, { [passcodeBackground.id]: "#101010" })).toBe(onDark);
  });

  it("키패드 숫자는 잠금화면 텍스트와 같은 잉크색을 쓴다", () => {
    expect(getDerivedColorRule("passcode_keypad_color")).toEqual({ baseRole: "passcode_color", transform: "same" });
    expect(resolve(keypadColor, { [passcodeBackground.id]: "#101010" })).toBe(resolve(passcodeText, { [passcodeBackground.id]: "#101010" }));
  });

  it("키패드 눌림 숫자색은 원래 색과 구분된다", () => {
    const base = resolve(keypadColor, { [passcodeBackground.id]: "#101010" })!;
    const pressed = resolve(keypadPressedColor, { [passcodeBackground.id]: "#101010" });
    expect(pressed).not.toBe(base);
    expect(pressed).toBe(applyDerivedColorTransform(base, "pressed-foreground"));
  });

  it("키패드 배경은 잠금화면 배경과 같은 값을 쓴다", () => {
    expect(resolve(keypadBackground, { [passcodeBackground.id]: "#FCC5C5" })).toBe("#FCC5C5");
  });

  /**
   * `pressed-foreground`(내부적으로 `mixThemeColors` 경유)는 알파를 항상 1로 정규화한다.
   * 눌림 배경이 `surface-alpha`가 만든 반투명 값을 다시 체이닝하면 알파가 사라지므로,
   * 두 배경 모두 불투명한 `passcode_background_color`에서 직접 파생시켜 이 손실을 피한다.
   */
  it("키패드 눌림 배경은 불투명 배경에서 새로 반투명화되어 알파를 잃지 않는다", () => {
    expect(getDerivedColorRule("passcode_keypad_pressed_background_color")).toEqual({ baseRole: "passcode_background_color", transform: "surface-alpha" });
    const pressed = resolve(keypadPressedBackground, { [passcodeBackground.id]: "#FCC5C5" });
    expect(pressed).toContain("FCC5C5");
    expect(pressed).not.toBe("#FCC5C5");
  });
});

describe("초기 상태에서의 연동", () => {
  it("새 프로젝트의 기본 선택은 명시적 지정이 아니다", () => {
    // 이 단언이 이 파일의 핵심이다. 기본 후보 id를 명시 선택으로 보면 연동이 죽는다.
    expect(initialSelections[titlePressed.id]).toBeDefined();
    expect(getInheritedColorSourceSlot(titlePressed, {}, initialSelections, "basic", template, slots)?.id).toBe(title.id);
  });

  it("기준 색을 바꾸면 눌림 색이 따라간다", () => {
    const pressed = resolve(titlePressed, { [title.id]: "#FFFFFF" });
    // 그대로 복사가 아니라 눌림 변환이 적용된 값이다.
    expect(pressed).toBe(applyDerivedColorTransform("#FFFFFF", "pressed-foreground"));
    expect(pressed).not.toBe(resolve(titlePressed, { [title.id]: "#111111" }));
  });

  it("변환이 없는 짝은 기준 색을 그대로 따라간다", () => {
    expect(getDerivedColorRule("chat_bubble_me_selected_color")?.transform).toBe("same");
    expect(getResolvedColor(bubbleMeSelected, { [bubbleMe.id]: "#FFFFFF" }, iosSelections, "basic", template, iosSlots)).toBe("#FFFFFF");
  });

  it("직접 지정한 눌림 색이 있으면 그 값을 쓴다", () => {
    expect(resolve(titlePressed, { [title.id]: "#FFFFFF", [titlePressed.id]: "#FF0000" })).toBe("#FF0000");
  });

  it("기본 후보가 아닌 후보를 직접 고르면 연동이 아니다", () => {
    const selections = { ...initialSelections, [titlePressed.id]: "some-other-candidate" };
    expect(getInheritedColorSourceSlot(titlePressed, {}, selections, "basic", template, slots)).toBeUndefined();
  });

  it("짝이 없는 슬롯은 자기 기본값을 그대로 쓴다", () => {
    const before = resolve(background, {});
    expect(resolve(background, { [title.id]: "#FFFFFF" })).toBe(before);
  });

  it("allSlots가 비면 연동이 꺼진다", () => {
    // 인자를 필수로 둔 이유다. 빈 배열을 넘기면 자기 defaultColor로 조용히 되돌아간다.
    expect(getResolvedColor(titlePressed, { [title.id]: "#FFFFFF" }, initialSelections, "basic", template, [])).not.toBe(
      applyDerivedColorTransform("#FFFFFF", "pressed-foreground"),
    );
  });
});

describe("연동과 준비 상태", () => {
  it("연동 중인 슬롯도 준비 완료로 센다", () => {
    expect(isSlotReady(titlePressed, {}, {}, initialSelections, "basic", template, slots)).toBe(true);
  });

  it("연동 중이면 상태 라벨에 그 사실을 표시한다", () => {
    const label = slotStatusLabel(titlePressed, {}, { [title.id]: "#FFFFFF" }, initialSelections, "basic", template, slots);
    expect(label.startsWith("연동 · ")).toBe(true);
  });

  it("직접 지정하면 색만 표시한다", () => {
    expect(slotStatusLabel(titlePressed, {}, { [titlePressed.id]: "#ff0000" }, initialSelections, "basic", template, slots)).toBe("#FF0000");
  });
});
