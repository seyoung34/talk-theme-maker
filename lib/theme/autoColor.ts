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
};

export function buildMainPaletteRecommendations(slots: ThemeAssetSlot[], context: MainPaletteContext) {
  const imagePalette = context.imageActive ? context.palette : null;
  const currentBackground = themeColorRgbHex(context.currentBackground, "#F4FAFB");
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
  const meSurface = context.mePalette?.average ?? themeColorRgbHex(context.myBubbleSurface, "#FFE27A");
  const youSurface = context.youPalette?.average ?? themeColorRgbHex(context.friendBubbleSurface, "#FFFFFF");
  const values: Partial<Record<ThemeAutoColorRecipe, string>> = {
    "bubble-me-text": readableThemeForeground(meSurface),
    "bubble-you-text": readableThemeForeground(youSurface),
  };

  return Object.fromEntries(
    slots.flatMap((slot) => slot.autoColorRecipe && values[slot.autoColorRecipe] ? [[slot.id, values[slot.autoColorRecipe]]] : []),
  ) as Record<string, string>;
}
