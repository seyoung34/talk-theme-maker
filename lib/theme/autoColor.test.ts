import { describe, expect, it } from "vitest";
import { buildBubbleTextRecommendations, buildMainPaletteRecommendations, type MainPaletteContext } from "@/lib/theme/autoColor";
import { themeColorContrast } from "@/lib/theme/color";
import { getThemeSlots } from "@/lib/theme/templates";
import type { ImageColorPalette } from "@/lib/theme/colorPalette";

/**
 * 자동 맞춤 팔레트의 seed 계약.
 *
 * 메인 배경과 채팅방 배경은 **서로 다른 이미지**를 쓴다. 채팅방 위에 그려지는 것(읽지 않음
 * 숫자, 말풍선 글자 대비)이 메인 배경 밝기를 기준으로 계산되면 어두운 채팅 배경에서 묻힌다.
 */
const slots = getThemeSlots("android");
const iosSlots = getThemeSlots("ios");
const chatBackgroundSlot = slots.find((slot) => slot.role === "chat_background_color")!;
const mainBackgroundSlot = slots.find((slot) => slot.role === "main_background_color")!;
const passcodeBackgroundSlot = slots.find((slot) => slot.role === "passcode_background_color")!;
const mutedSlots = slots.filter((slot) => ["main_description_color", "tab_paragraph_color"].includes(slot.role));
const iosTitleSlot = iosSlots.find((slot) => slot.role === "main_title_color")!;
const iosDescriptionSlot = iosSlots.find((slot) => slot.role === "main_description_color")!;
const iosTabBackgroundSlot = iosSlots.find((slot) => slot.role === "tab_background")!;

function palette(average: string): ImageColorPalette {
  return { representative: average, average, top: average, bottom: average, accent: average };
}

function context(overrides: Partial<MainPaletteContext> = {}): MainPaletteContext {
  return {
    imageActive: false,
    palette: null,
    currentBackground: "#FFFFFF",
    backgroundIsAuto: false,
    templateAccent: "#FFB300",
    chatImageActive: false,
    chatPalette: null,
    currentChatBackground: "#B8F2F7",
    passcodeImageActive: false,
    passcodePalette: null,
    ...overrides,
  };
}

describe("채팅방 배경 자동 맞춤", () => {
  it("채팅 배경 이미지가 있으면 그 평균색을 쓴다", () => {
    const result = buildMainPaletteRecommendations(slots, context({
      chatImageActive: true,
      chatPalette: palette("#203040"),
    }));

    expect(result[chatBackgroundSlot.id]).toBe("#203040");
  });

  it("이미지가 없으면 현재 채팅 배경색을 그대로 쓴다", () => {
    expect(buildMainPaletteRecommendations(slots, context())[chatBackgroundSlot.id]).toBe("#B8F2F7");
  });

  it("메인 배경 이미지는 채팅 배경에 영향을 주지 않는다", () => {
    // 이 분리가 이 변경의 핵심이다. 예전에는 채팅 배경 seed 자체가 없었다.
    const result = buildMainPaletteRecommendations(slots, context({
      imageActive: true,
      palette: palette("#FF0000"),
    }));

    expect(result[chatBackgroundSlot.id]).toBe("#B8F2F7");
  });

  it("채팅 배경 이미지는 메인 배경에 영향을 주지 않는다", () => {
    const result = buildMainPaletteRecommendations(slots, context({
      backgroundIsAuto: true,
      chatImageActive: true,
      chatPalette: palette("#203040"),
    }));

    expect(result[mainBackgroundSlot.id]).toBe("#FFFFFF");
  });

  it("두 배경이 각자의 이미지를 따라간다", () => {
    const result = buildMainPaletteRecommendations(slots, context({
      imageActive: true,
      palette: palette("#FF0000"),
      backgroundIsAuto: true,
      chatImageActive: true,
      chatPalette: palette("#0000FF"),
    }));

    expect(result[mainBackgroundSlot.id]).toBe("#FF0000");
    expect(result[chatBackgroundSlot.id]).toBe("#0000FF");
  });
});

/**
 * 입력바는 채팅방 화면 하단에 붙어 있다. 탭바가 메인 배경의 아래쪽 색을 쓰는 것과 같은 이유로
 * 평균이 아니라 하단을 따라간다 — 위아래 색이 다른 이미지에서 평균을 쓰면 입력바만 어긋난다.
 */
describe("입력바 배경 자동 맞춤", () => {
  const inputBackgroundSlot = slots.find((slot) => slot.role === "chat_input_background_color")!;

  function gradient(top: string, bottom: string): ImageColorPalette {
    return { representative: top, average: "#808080", top, bottom, accent: top };
  }

  it("채팅 배경 이미지의 평균이 아니라 하단색을 쓴다", () => {
    const result = buildMainPaletteRecommendations(slots, context({
      chatImageActive: true,
      chatPalette: gradient("#FFFFFF", "#203040"),
    }));

    expect(result[inputBackgroundSlot.id]).toBe("#203040");
    expect(result[inputBackgroundSlot.id]).not.toBe(result[chatBackgroundSlot.id]);
  });

  it("이미지가 없으면 채팅 배경색으로 떨어진다", () => {
    expect(buildMainPaletteRecommendations(slots, context())[inputBackgroundSlot.id]).toBe("#B8F2F7");
  });

  it("메인 배경 이미지는 입력바에 영향을 주지 않는다", () => {
    const result = buildMainPaletteRecommendations(slots, context({
      imageActive: true,
      palette: gradient("#FF0000", "#00FF00"),
    }));

    expect(result[inputBackgroundSlot.id]).toBe("#B8F2F7");
  });
});

/**
 * 전송 버튼에는 recipe가 없다.
 *
 * 채팅방 이미지의 강조색을 자동으로 넣어 봤더니, 이미지가 없는 테마에서 템플릿 강조색으로
 * 떨어져 파스텔 톤 위에 검은 알약이 얹혔다. 지금은 입력바 색을 그대로 따라가고, 강조색은
 * 사용자가 직접 지정한다.
 */
describe("전송 버튼", () => {
  const sendButtonSlot = slots.find((slot) => slot.role === "chat_send_button_color")!;

  it("자동 맞춤 대상이 아니다", () => {
    expect(sendButtonSlot.autoColorRecipe).toBeUndefined();
    expect(buildMainPaletteRecommendations(slots, context({ templateAccent: "#FFB300" }))[sendButtonSlot.id]).toBeUndefined();
  });
});

describe("잠금화면 배경 자동 맞춤", () => {
  it("잠금화면 이미지가 있으면 그 평균색을 쓴다", () => {
    const result = buildMainPaletteRecommendations(slots, context({
      passcodeImageActive: true,
      passcodePalette: palette("#402030"),
    }));

    expect(result[passcodeBackgroundSlot.id]).toBe("#402030");
  });

  it("잠금화면 이미지가 없으면 메인 배경(수동 색)을 그대로 따라간다", () => {
    const result = buildMainPaletteRecommendations(slots, context({ currentBackground: "#334455" }));
    expect(result[passcodeBackgroundSlot.id]).toBe("#334455");
  });

  it("잠금화면 이미지가 없으면 메인 배경 이미지 평균색도 따라간다", () => {
    const result = buildMainPaletteRecommendations(slots, context({
      imageActive: true,
      backgroundIsAuto: true,
      palette: palette("#112233"),
    }));

    expect(result[passcodeBackgroundSlot.id]).toBe("#112233");
  });

  it("잠금화면 이미지는 메인/채팅 배경에 영향을 주지 않는다", () => {
    const result = buildMainPaletteRecommendations(slots, context({
      passcodeImageActive: true,
      passcodePalette: palette("#402030"),
    }));

    expect(result[mainBackgroundSlot.id]).toBe("#FFFFFF");
    expect(result[chatBackgroundSlot.id]).toBe("#B8F2F7");
  });
});

describe("보조 텍스트 자동 맞춤", () => {
  it("어두운 배경에서도 상태 메시지와 마지막 메시지가 지나치게 어둡지 않다", () => {
    const result = buildMainPaletteRecommendations(slots, context({ currentBackground: "#111111" }));

    for (const slot of mutedSlots) {
      const color = result[slot.id]!;
      expect(color).toBe("#ACACAC");
      expect(themeColorContrast(color, "#111111")).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("iOS 메인 배경 연동", () => {
  it("어두운 메인 배경에서 이름은 밝게, 탭바는 메인 배경을 따른다", () => {
    const result = buildMainPaletteRecommendations(iosSlots, context({
      imageActive: true,
      backgroundIsAuto: true,
      palette: {
        representative: "#202020",
        average: "#202020",
        top: "#101010",
        bottom: "#EEEEEE",
        accent: "#6A5F00",
      },
    }));

    expect(result[iosTitleSlot.id]).toBe("#FFFFFF");
    expect(result[iosDescriptionSlot.id]).toBe("#B1B1B1");
    expect(result[iosTabBackgroundSlot.id]).toBe("#202020");
  });
});

describe("말풍선 텍스트 자동 맞춤", () => {
  const bubbleMeSlot = slots.find((slot) => slot.role === "chat_bubble_me_color")!;
  const bubbleYouSlot = slots.find((slot) => slot.role === "chat_bubble_you_color")!;

  it("각 말풍선 표면에서 읽을 수 있는 텍스트 색을 추천한다", () => {
    const result = buildBubbleTextRecommendations(slots, {
      mePalette: palette("#202020"),
      youPalette: palette("#F7F7F7"),
      myBubbleSurface: "#FFE27A",
      friendBubbleSurface: "#FFFFFF",
    });

    expect(result[bubbleMeSlot.id]).toBe("#FFFFFF");
    expect(result[bubbleYouSlot.id]).toBe("#1F2937");
    expect(themeColorContrast(result[bubbleMeSlot.id], "#202020")).toBeGreaterThanOrEqual(4.5);
    expect(themeColorContrast(result[bubbleYouSlot.id], "#F7F7F7")).toBeGreaterThanOrEqual(4.5);
  });

  it("이미지 분석이 없으면 템플릿 말풍선 표면을 기준으로 폴백한다", () => {
    const result = buildBubbleTextRecommendations(slots, {
      mePalette: null,
      youPalette: null,
      myBubbleSurface: "#202020",
      friendBubbleSurface: "#F7F7F7",
    });

    expect(themeColorContrast(result[bubbleMeSlot.id], "#202020")).toBeGreaterThanOrEqual(4.5);
    expect(themeColorContrast(result[bubbleYouSlot.id], "#F7F7F7")).toBeGreaterThanOrEqual(4.5);
  });
});
