import { describe, expect, it } from "vitest";
import { buildMainPaletteRecommendations, type MainPaletteContext } from "@/lib/theme/autoColor";
import { getThemeSlots } from "@/lib/theme/templates";
import type { ImageColorPalette } from "@/lib/theme/colorPalette";

/**
 * 자동 맞춤 팔레트의 seed 계약.
 *
 * 메인 배경과 채팅방 배경은 **서로 다른 이미지**를 쓴다. 채팅방 위에 그려지는 것(읽지 않음
 * 숫자, 말풍선 글자 대비)이 메인 배경 밝기를 기준으로 계산되면 어두운 채팅 배경에서 묻힌다.
 */
const slots = getThemeSlots("android");
const chatBackgroundSlot = slots.find((slot) => slot.role === "chat_background_color")!;
const mainBackgroundSlot = slots.find((slot) => slot.role === "main_background_color")!;

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
