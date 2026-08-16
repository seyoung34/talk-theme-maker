import type { ThemeProjectFile } from "@/lib/theme/project/types";
import { themeColorRgbHex } from "@/lib/theme/color";

export type ImageColorPalette = {
  representative: string;
  average: string;
  top: string;
  bottom: string;
  accent: string;
};

/**
 * 반투명한 부분만 배경색과 섞고, **알파는 그대로 남긴다.**
 *
 * 예전에는 캔버스를 배경색으로 칠한 뒤 이미지를 그렸다. 그러면 모든 픽셀이 불투명해져서
 * 아래 집계 함수들의 `alpha < 0.15` 걸러내기가 무력해지고, **투명한 여백이 배경색 표로 전부
 * 집계된다.** 말풍선에서 이게 치명적이었다 — 나인패치 아트보드는 실제 말풍선보다 훨씬 커서
 * (빌더 기본값이 250×230 캔버스에 95×80 본체, 즉 13%) 평균의 대부분이 채팅방 배경이 됐다.
 * 그 평균으로 글자색을 정하니 "말풍선이 아니라 채팅방 배경에 대비되는 색"이 나왔다.
 *
 * 배경을 섞는 것 자체는 필요하다. 반투명한 말풍선은 뒤에 깔린 것과 합쳐진 색으로 보이기
 * 때문이다. 다만 그 판정에 **완전히 투명한 자리가 한 표를 행사하면 안 된다.**
 */
export function compositeOverBackground(pixels: Uint8ClampedArray, backgroundColor: string) {
  const background = hexRgb(themeColorRgbHex(backgroundColor));
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha >= 1) continue;
    pixels[index] = pixels[index] * alpha + background.red * (1 - alpha);
    pixels[index + 1] = pixels[index + 1] * alpha + background.green * (1 - alpha);
    pixels[index + 2] = pixels[index + 2] * alpha + background.blue * (1 - alpha);
  }
}

export async function extractThemeImagePalette(file: ThemeProjectFile, options: { backgroundColor?: string } = {}): Promise<ImageColorPalette> {
  const blob = file.file ?? (file.sourceUrl ? await fetch(file.sourceUrl).then((response) => {
    if (!response.ok) throw new Error("배경 이미지를 불러오지 못했습니다.");
    return response.blob();
  }) : null);
  if (!blob) throw new Error("분석할 배경 이미지가 없습니다.");

  const bitmap = await createImageBitmap(blob);
  try {
    const width = Math.max(1, Math.min(64, bitmap.width));
    const height = Math.max(1, Math.min(64, Math.round((bitmap.height / Math.max(1, bitmap.width)) * width)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("이미지 색상을 분석할 수 없습니다.");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    if (options.backgroundColor) compositeOverBackground(pixels, options.backgroundColor);
    const topRows = Math.max(1, Math.ceil(height * 0.15));
    const bottomStart = Math.max(0, height - topRows);
    const average = averageColor(pixels, width, height);
    return {
      representative: dominantColor(pixels, width, height),
      average,
      top: dominantColor(pixels, width, topRows),
      bottom: dominantColor(pixels, width, topRows, bottomStart),
      accent: accentColor(pixels, width, height, average),
    };
  } finally {
    bitmap.close();
  }
}

function dominantColor(pixels: Uint8ClampedArray, width: number, rows: number, startRow = 0) {
  const buckets = new Map<string, { weight: number; red: number; green: number; blue: number }>();
  const start = Math.min(pixels.length, width * startRow * 4);
  const length = Math.min(pixels.length, start + width * rows * 4);
  for (let index = start; index < length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.15) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = `${red >> 5}-${green >> 5}-${blue >> 5}`;
    const bucket = buckets.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 };
    bucket.weight += alpha;
    bucket.red += red * alpha;
    bucket.green += green * alpha;
    bucket.blue += blue * alpha;
    buckets.set(key, bucket);
  }
  const selected = Array.from(buckets.values()).sort((left, right) => right.weight - left.weight)[0];
  if (!selected || selected.weight < 1) throw new Error("불투명한 픽셀이 부족해 대표색을 찾지 못했습니다.");
  return toHex(selected.red / selected.weight, selected.green / selected.weight, selected.blue / selected.weight);
}

function accentColor(pixels: Uint8ClampedArray, width: number, rows: number, average: string) {
  const buckets = new Map<string, { weight: number; red: number; green: number; blue: number }>();
  const length = Math.min(pixels.length, width * rows * 4);
  for (let index = 0; index < length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.15) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = `${red >> 4}-${green >> 4}-${blue >> 4}`;
    const bucket = buckets.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 };
    bucket.weight += alpha;
    bucket.red += red * alpha;
    bucket.green += green * alpha;
    bucket.blue += blue * alpha;
    buckets.set(key, bucket);
  }

  const averageRgb = hexRgb(average);
  const ranked = Array.from(buckets.values())
    .map((bucket) => {
      const red = bucket.red / bucket.weight;
      const green = bucket.green / bucket.weight;
      const blue = bucket.blue / bucket.weight;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const saturation = maximum <= 0 ? 0 : (maximum - minimum) / maximum;
      const distance = Math.sqrt((red - averageRgb.red) ** 2 + (green - averageRgb.green) ** 2 + (blue - averageRgb.blue) ** 2) / 441.67;
      return { red, green, blue, score: Math.sqrt(bucket.weight) * (0.35 + saturation) * (0.6 + distance) };
    })
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0];
  return selected ? toHex(selected.red, selected.green, selected.blue) : average;
}

function averageColor(pixels: Uint8ClampedArray, width: number, rows: number) {
  const length = Math.min(pixels.length, width * rows * 4);
  let weight = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let index = 0; index < length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.15) continue;
    weight += alpha;
    red += pixels[index] * alpha;
    green += pixels[index + 1] * alpha;
    blue += pixels[index + 2] * alpha;
  }
  if (weight < 1) throw new Error("불투명한 픽셀이 부족해 평균색을 찾지 못했습니다.");
  return toHex(red / weight, green / weight, blue / weight);
}

function toHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function hexRgb(value: string) {
  const normalized = value.replace("#", "");
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}
