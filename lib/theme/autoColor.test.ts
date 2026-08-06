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
