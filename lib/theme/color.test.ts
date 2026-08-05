import { describe, expect, it } from "vitest";
import {
  formatThemeColor,
  mixThemeColors,
  parseThemeColor,
  readableThemeForeground,
  setThemeColorAlpha,
  setThemeColorRgb,
  themeColorAlphaPercent,
  themeColorContrast,
  themeColorRgbHex,
  themeColorToCss,
  themeColorToCssHex,
} from "@/lib/theme/color";

// lib/theme/color.ts는 순수 함수 모음이라 리팩토링 안전망으로 삼기 좋은 첫 테스트 대상이다.
describe("parseThemeColor", () => {
  it("6자리 hex는 알파를 1로 채우고 hasExplicitAlpha=false로 파싱한다", () => {
    expect(parseThemeColor("#FF8800")).toEqual({
      red: 255,
      green: 136,
      blue: 0,
      alpha: 1,
      hasExplicitAlpha: false,
    });
  });

  it("8자리 hex는 선행 2자리를 알파(#AARRGGBB)로 해석한다", () => {
    const parsed = parseThemeColor("#80FF8800");
    expect(parsed?.hasExplicitAlpha).toBe(true);
    expect(parsed?.red).toBe(255);
    expect(parsed?.alpha).toBeCloseTo(128 / 255, 5);
  });

  it("# 접두사와 대소문자, 공백을 허용한다", () => {
    expect(parseThemeColor("  ff8800 ")).toMatchObject({ red: 255, green: 136, blue: 0 });
  });

  it("형식이 잘못되면 null을 반환한다", () => {
    expect(parseThemeColor("#FFF")).toBeNull();
    expect(parseThemeColor("not-a-color")).toBeNull();
    expect(parseThemeColor("#12345")).toBeNull();
  });
});

describe("formatThemeColor", () => {
  it("알파 없이 6자리 대문자 hex로 직렬화한다", () => {
    const parsed = parseThemeColor("#ff8800")!;
    expect(formatThemeColor(parsed, false)).toBe("#FF8800");
  });

  it("알파 포함 시 #AARRGGBB 순서로 직렬화한다", () => {
    const parsed = parseThemeColor("#80FF8800")!;
    expect(formatThemeColor(parsed, true)).toBe("#80FF8800");
  });
});

describe("themeColorToCss", () => {
  it("불투명 색은 hex 그대로 반환한다", () => {
    expect(themeColorToCss("#FF8800")).toBe("#FF8800");
  });

  it("알파가 0이면 transparent로 축약한다", () => {
    expect(themeColorToCss("#00FF8800")).toBe("transparent");
  });

  it("반투명 색은 rgb( r g b / a ) 형식으로 변환한다", () => {
    expect(themeColorToCss("#80FF8800")).toBe("rgb(255 136 0 / 0.502)");
  });

  it("파싱 불가한 값은 입력을 그대로 돌려준다", () => {
    expect(themeColorToCss("var(--x)")).toBe("var(--x)");
  });
});

describe("themeColorToCssHex", () => {
  it("내부 저장 포맷(AARRGGBB)을 표준 CSS 순서(RRGGBBAA)로 바꾼다", () => {
    // iOS TabBarStyle-Main처럼 8자리 hex를 CSS 텍스트에 직접 박아 넣는 자리 전용.
    expect(themeColorToCssHex("#80FF8800")).toBe("#FF880080");
  });

  it("알파가 없는 6자리는 그대로 6자리로 남긴다", () => {
    expect(themeColorToCssHex("#FF8800")).toBe("#FF8800");
  });

  it("파싱 불가한 값은 입력을 그대로 돌려준다", () => {
    expect(themeColorToCssHex("var(--x)")).toBe("var(--x)");
  });
});

describe("알파/ RGB 조작", () => {
  it("themeColorAlphaPercent는 0~100 정수를 반환한다", () => {
    expect(themeColorAlphaPercent("#FF8800")).toBe(100);
    expect(themeColorAlphaPercent("#80FF8800")).toBe(50);
  });

  it("setThemeColorAlpha는 RGB를 유지하며 알파만 바꾼다", () => {
    expect(setThemeColorAlpha("#FF8800", 50)).toBe("#80FF8800");
  });

  it("setThemeColorRgb는 기존 알파를 보존한다", () => {
    // 기존 알파(50%)를 유지한 채 RGB만 교체
    expect(setThemeColorRgb("#80FF8800", "#00FF00")).toBe("#8000FF00");
  });

  it("themeColorRgbHex는 알파를 떼고 RGB만 반환한다", () => {
    expect(themeColorRgbHex("#80FF8800")).toBe("#FF8800");
  });
});

describe("mixThemeColors", () => {
  it("amount=0이면 첫 번째 색, amount=1이면 두 번째 색이 된다", () => {
    expect(mixThemeColors("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mixThemeColors("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
  });

  it("amount=0.5는 중간 회색을 만든다", () => {
    expect(mixThemeColors("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
});

describe("themeColorContrast / readableThemeForeground", () => {
  it("검정/흰색 대비는 WCAG 최대치(21:1)에 가깝다", () => {
    expect(themeColorContrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("밝은 배경에는 어두운 전경, 어두운 배경에는 밝은 전경을 고른다", () => {
    expect(readableThemeForeground("#FFFFFF")).toBe("#1F2937");
    expect(readableThemeForeground("#000000")).toBe("#FFFFFF");
  });
});
