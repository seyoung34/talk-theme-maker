import type { ImageColorPalette } from "@/lib/theme/colorPalette";
import { adjustThemeColor, ensureThemeColorContrast, mixThemeColors, mutedThemeForeground, readableThemeForeground, themeColorRgbHex, withThemeColorAlpha } from "@/lib/theme/color";
import type { ThemeAssetSlot, ThemeAutoColorRecipe } from "@/lib/theme/templates";

export const autoMainPaletteCandidateId = "auto-color:main-palette-v2";
export const legacyAutoMainSurfaceCandidateId = "auto-color:main-surface";

export type MainPaletteContext = {
  imageActive: boolean;
  palette: ImageColorPalette | null;
  currentBackground: string;
  backgroundIsAuto: boolean;
  templateAccent: string;
  /**
   * 채팅방 배경은 메인 배경과 **다른 이미지**를 쓴다.
   *
   * 메인 팔레트로 대신하면 채팅방 위에 그려지는 것들(읽지 않음 숫자, 말풍선 글자 대비)이
   * 엉뚱한 밝기를 기준으로 계산된다. 그래서 seed를 따로 받는다.
   */
  chatImageActive: boolean;
  chatPalette: ImageColorPalette | null;
  currentChatBackground: string;
  /**
   * 잠금화면은 자체 배경 이미지가 있으면 그 평균색을 쓰고, 없으면 메인 배경(이미지 or 수동 색)을
   * 그대로 따라간다 — 잠금화면 이미지를 따로 준비 안 하는 경우가 많아서다.
   */
  passcodeImageActive: boolean;
  passcodePalette: ImageColorPalette | null;
};

export function buildMainPaletteRecommendations(slots: ThemeAssetSlot[], context: MainPaletteContext) {
  const imagePalette = context.imageActive ? context.palette : null;
  const currentBackground = themeColorRgbHex(context.currentBackground, "#F5F6F7");
  const backgroundRecommendation = imagePalette?.average ?? currentBackground;
  const background = context.backgroundIsAuto ? backgroundRecommendation : currentBackground;
  const header = imagePalette?.top ?? background;
  const secondary = background;
  const tab = imagePalette?.bottom ?? background;
  const accentSeed = imagePalette?.accent ?? context.templateAccent;
  const accent = ensureThemeColorContrast(accentSeed, secondary, 3);
  const foreground = readableThemeForeground(background);
  const muted = mutedThemeForeground(background);
  const headerForeground = readableThemeForeground(header);
  const accentSurface = mixThemeColors(secondary, accent, 0.13);

  const chatImagePalette = context.chatImageActive ? context.chatPalette : null;
  const chatBackground = chatImagePalette?.average ?? themeColorRgbHex(context.currentChatBackground, currentBackground);
  const chatInputBackground = chatImagePalette?.bottom ?? chatBackground;

  // 메인 배경과 달리 "현재 값 유지"가 아니라 **메인 배경을 계속 따라간다** — 잠금화면 이미지를
  // 준비하지 않은 사용자가 배경을 나중에 바꿔도 잠금화면이 함께 갱신되게 하기 위해서다.
  const passcodeImagePalette = context.passcodeImageActive ? context.passcodePalette : null;
  const passcodeBackground = passcodeImagePalette?.average ?? background;

  const values: Partial<Record<ThemeAutoColorRecipe, string>> = {
    "background-average": backgroundRecommendation,
    "header-top": header,
    "surface-background": secondary,
    "tab-bottom": tab,
    "foreground-header": headerForeground,
    "foreground-background": foreground,
    "foreground-muted": muted,
    "foreground-pressed": adjustThemeColor(foreground, foreground === "#FFFFFF" ? -0.12 : 0.12),
    "muted-pressed": adjustThemeColor(muted, muted === "#FFFFFF" ? -0.12 : 0.12),
    "cell-transparent": withThemeColorAlpha(background, 0),
    "cell-pressed": withThemeColorAlpha(foreground, 0.18),
    "cell-border": withThemeColorAlpha(foreground, 0.15),
    accent,
    "accent-pressed": adjustThemeColor(accent, readableThemeForeground(accent) === "#FFFFFF" ? -0.12 : 0.12),
    "accent-surface": accentSurface,
    "accent-surface-pressed": mixThemeColors(secondary, accent, 0.22),
    "chat-background-average": chatBackground,
    // 입력바는 채팅방 화면 **하단**에 붙어 있다. 탭바가 메인 배경의 아래쪽 색을 쓰는 것과 같은
    // 이유로 평균이 아니라 하단을 따라간다 — 위아래 색이 다른 이미지에서 평균을 쓰면 입력바만
    // 배경과 어긋난다. 이미지가 없으면 채팅방 배경색으로 떨어진다.
    "chat-background-bottom": chatInputBackground,
    "passcode-background-average": passcodeBackground,
  };

  return Object.fromEntries(
    slots.flatMap((slot) => slot.autoColorRecipe && values[slot.autoColorRecipe] ? [[slot.id, values[slot.autoColorRecipe]]] : []),
  ) as Record<string, string>;
}

export type BubbleTextPaletteContext = {
  mePalette: ImageColorPalette | null;
  youPalette: ImageColorPalette | null;
  myBubbleSurface: string;
  friendBubbleSurface: string;
};

export function buildBubbleTextRecommendations(slots: ThemeAssetSlot[], context: BubbleTextPaletteContext) {
  const meSurface = context.mePalette?.average ?? themeColorRgbHex(context.myBubbleSurface, "#E4E6E9");
  const youSurface = context.youPalette?.average ?? themeColorRgbHex(context.friendBubbleSurface, "#FFFFFF");
  const values: Partial<Record<ThemeAutoColorRecipe, string>> = {
    "bubble-me-text": readableThemeForeground(meSurface),
    "bubble-you-text": readableThemeForeground(youSurface),
  };

  return Object.fromEntries(
    slots.flatMap((slot) => slot.autoColorRecipe && values[slot.autoColorRecipe] ? [[slot.id, values[slot.autoColorRecipe]]] : []),
  ) as Record<string, string>;
}
