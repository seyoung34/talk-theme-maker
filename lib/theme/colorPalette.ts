import type { ThemeProjectFile } from "@/lib/theme/project/types";

export type ImageColorPalette = {
  representative: string;
  average: string;
  top: string;
};

export async function extractThemeImagePalette(file: ThemeProjectFile): Promise<ImageColorPalette> {
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
    const topRows = Math.max(1, Math.ceil(height * 0.15));
    return {
      representative: dominantColor(pixels, width, height),
      average: averageColor(pixels, width, height),
      top: dominantColor(pixels, width, topRows),
    };
  } finally {
    bitmap.close();
  }
}

function dominantColor(pixels: Uint8ClampedArray, width: number, rows: number) {
  const buckets = new Map<string, { weight: number; red: number; green: number; blue: number }>();
  const length = Math.min(pixels.length, width * rows * 4);
  for (let index = 0; index < length; index += 4) {
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
