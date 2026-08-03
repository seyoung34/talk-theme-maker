export type ParsedThemeColor = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
  hasExplicitAlpha: boolean;
};

export function parseThemeColor(value: string): ParsedThemeColor | null {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized)) return null;
  const hasExplicitAlpha = normalized.length === 8;
  const offset = hasExplicitAlpha ? 2 : 0;
  return {
    alpha: hasExplicitAlpha ? Number.parseInt(normalized.slice(0, 2), 16) / 255 : 1,
    red: Number.parseInt(normalized.slice(offset, offset + 2), 16),
    green: Number.parseInt(normalized.slice(offset + 2, offset + 4), 16),
    blue: Number.parseInt(normalized.slice(offset + 4, offset + 6), 16),
    hasExplicitAlpha,
  };
}

export function normalizeThemeColor(value: string) {
  const parsed = parseThemeColor(value);
  return parsed ? formatThemeColor(parsed, parsed.hasExplicitAlpha) : null;
}

export function formatThemeColor(color: ParsedThemeColor, includeAlpha = color.hasExplicitAlpha) {
  const rgb = [color.red, color.green, color.blue].map(toHexByte).join("");
  return `#${includeAlpha ? toHexByte(color.alpha * 255) : ""}${rgb}`;
}

export function themeColorToCss(value: string) {
  const parsed = parseThemeColor(value);
  if (!parsed) return value;
  if (parsed.alpha <= 0) return "transparent";
  if (parsed.alpha >= 1) return formatThemeColor(parsed, false);
  return `rgb(${parsed.red} ${parsed.green} ${parsed.blue} / ${parsed.alpha.toFixed(3)})`;
}

export function themeColorRgbHex(value: string, fallback = "#000000") {
  const parsed = parseThemeColor(value);
  return parsed ? formatThemeColor(parsed, false) : fallback;
}

export function themeColorAlphaPercent(value: string) {
  const parsed = parseThemeColor(value);
  return parsed ? Math.round(parsed.alpha * 100) : 100;
}

export function setThemeColorRgb(value: string, rgbHex: string) {
  const current = parseThemeColor(value);
  const rgb = parseThemeColor(rgbHex);
  if (!rgb) return value;
  return formatThemeColor({ ...rgb, alpha: current?.alpha ?? 1, hasExplicitAlpha: current?.hasExplicitAlpha ?? false }, current?.hasExplicitAlpha ?? false);
}

export function setThemeColorAlpha(value: string, percent: number) {
  const parsed = parseThemeColor(value);
  if (!parsed) return value;
  return formatThemeColor({ ...parsed, alpha: clamp(percent, 0, 100) / 100, hasExplicitAlpha: true }, true);
}

export function withThemeColorAlpha(value: string, alpha: number) {
  const parsed = parseThemeColor(value);
  if (!parsed) return value;
  return formatThemeColor({ ...parsed, alpha: clamp(alpha, 0, 1), hasExplicitAlpha: true }, true);
}

export function mixThemeColors(first: string, second: string, amount: number) {
  const left = parseThemeColor(first);
  const right = parseThemeColor(second);
  if (!left || !right) return first;
  const ratio = clamp(amount, 0, 1);
  return formatThemeColor({
    red: Math.round(left.red + (right.red - left.red) * ratio),
    green: Math.round(left.green + (right.green - left.green) * ratio),
    blue: Math.round(left.blue + (right.blue - left.blue) * ratio),
    alpha: 1,
    hasExplicitAlpha: false,
  }, false);
}

export function adjustThemeColor(value: string, amount: number) {
  return mixThemeColors(value, amount >= 0 ? "#FFFFFF" : "#000000", Math.abs(amount));
}

export function themeColorContrast(foreground: string, background: string) {
  const first = compositeOver(foreground, background);
  const second = compositeOver(background, "#FFFFFF");
  if (!first || !second) return 1;
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

export function readableThemeForeground(background: string, minimumRatio = 4.5) {
  const dark = "#1F2937";
  const light = "#FFFFFF";
  const darkRatio = themeColorContrast(dark, background);
  const lightRatio = themeColorContrast(light, background);
  if (darkRatio >= minimumRatio || darkRatio >= lightRatio) return dark;
  return light;
}

export function mutedThemeForeground(background: string, minimumRatio = 3) {
  const foreground = readableThemeForeground(background, 4.5);
  // 보조 텍스트라도 작은 글씨로 표시되므로, 첫 후보를 너무 배경에 가깝게 두지 않는다.
  // 특히 어두운 배경에서 기존 0.55 혼합값은 대비는 통과해도 회색이 지나치게 어둡게 보였다.
  for (const amount of [0.65, 0.75, 0.85, 0.95]) {
    const candidate = mixThemeColors(background, foreground, amount);
    if (themeColorContrast(candidate, background) >= minimumRatio) return candidate;
  }
  return foreground;
}

export function ensureThemeColorContrast(color: string, background: string, minimumRatio = 3) {
  if (themeColorContrast(color, background) >= minimumRatio) return themeColorRgbHex(color);
  const foreground = readableThemeForeground(background, minimumRatio);
  for (const amount of [0.2, 0.35, 0.5, 0.65]) {
    const candidate = mixThemeColors(color, foreground, amount);
    if (themeColorContrast(candidate, background) >= minimumRatio) return candidate;
  }
  return foreground;
}

function compositeOver(foreground: string, background: string) {
  const front = parseThemeColor(foreground);
  const back = parseThemeColor(background);
  if (!front || !back) return null;
  const alpha = front.alpha + back.alpha * (1 - front.alpha);
  if (alpha <= 0) return { ...front, alpha: 0 };
  return {
    red: Math.round((front.red * front.alpha + back.red * back.alpha * (1 - front.alpha)) / alpha),
    green: Math.round((front.green * front.alpha + back.green * back.alpha * (1 - front.alpha)) / alpha),
    blue: Math.round((front.blue * front.alpha + back.blue * back.alpha * (1 - front.alpha)) / alpha),
    alpha,
    hasExplicitAlpha: alpha < 1,
  };
}

function relativeLuminance(color: ParsedThemeColor) {
  const channels = [color.red, color.green, color.blue]
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function toHexByte(value: number) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0").toUpperCase();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
