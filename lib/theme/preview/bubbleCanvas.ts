// 말풍선 캔버스 렌더링의 단일 소스.
// 편집기 프리뷰(ChatroomPreview)와 갤러리 모달이 동일한 9-slice/텍스트영역 계산을 공유해
// 픽셀 단위로 일치하도록 한다. 모든 계산은 소스 픽셀 공간에서 이뤄지고, 표시 크기는 CSS로 축소한다.
import { mapContentRect, renderNinePatch } from "@/lib/theme/android/ninepatch";
import type { BubbleEditState } from "@/lib/theme/project/state";
import type { BubbleAsset, BubbleSlot, Insets, StretchPoint, ThemePlatform } from "@/lib/theme/types";

export const bubbleTextFontSize = 36;
export const bubbleTextLineHeight = 48;

export const defaultInsets: Record<BubbleSlot, Insets> = {
  me: { top: 14, right: 40, bottom: 59, left: 59 },
  you: { top: 17, right: 58, bottom: 60, left: 38 },
};

export const defaultStretch: Record<BubbleSlot, StretchPoint> = {
  me: { x: 145, y: 65 },
  you: { x: 224, y: 59 },
};

export function drawBubble(
  ctx: CanvasRenderingContext2D,
  options: {
    asset: BubbleAsset | null;
    edit?: BubbleEditState;
    platform: ThemePlatform;
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    fill: string;
    textColor: string;
    selected?: boolean;
  },
) {
  const { asset, edit, platform, x, y, width, height, text, fill, textColor, selected = false } = options;

  if (asset) {
    if (platform === "ios") {
      const source = getIosSourceCanvas(asset);
      const stretch = normalizeStretchPoint(edit?.stretch ?? defaultStretch[asset.slot], source.width, source.height);
      renderCapInset(ctx, asset, stretch, x, y, width, height);
    } else {
      renderNinePatch(ctx, asset, x, y, width, height);
    }
  } else {
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(20,52,58,0.7)";
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, width, height, 28);
    ctx.fill();
    ctx.stroke();
  }

  const contentRect = getPreviewContentRect(asset, platform, edit, x, y, width, height);
  if (selected) {
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 6;
    roundRect(ctx, x - 4, y - 4, width + 8, height + 8, 34);
    ctx.stroke();
  }

  drawText(ctx, text, contentRect.x + 14, contentRect.y + 10, Math.max(24, contentRect.width - 28), Math.max(24, contentRect.height - 20), textColor);
}

export function getAutoBubbleSize(ctx: CanvasRenderingContext2D, asset: BubbleAsset | null, platform: ThemePlatform, edit: BubbleEditState | undefined, text: string) {
  const maxWidth = 760;
  const source = asset ? (platform === "ios" ? getIosSourceCanvas(asset) : asset.innerCanvas) : null;
  const intrinsicWidth = source?.width ?? 212;
  const intrinsicHeight = source?.height ?? 96;
  const minWidth = clamp(Math.round(intrinsicWidth), 112, maxWidth);
  const minHeight = clamp(Math.round(intrinsicHeight), 72, 1400);
  let width = minWidth;
  let height = minHeight;

  ctx.font = `${bubbleTextFontSize}px Segoe UI, Noto Sans KR, sans-serif`;
  const longestRawLine = Math.max(0, ...String(text).split("\n").map((line) => ctx.measureText(line).width));

  for (let index = 0; index < 8; index += 1) {
    const content = getPreviewContentRect(asset, platform, edit, 0, 0, width, height);
    const widthDeficit = longestRawLine + 28 - content.width;
    if (widthDeficit <= 0 || width >= maxWidth) break;
    width = clamp(width + Math.ceil(widthDeficit), minWidth, maxWidth);
  }

  for (let index = 0; index < 8; index += 1) {
    const content = getPreviewContentRect(asset, platform, edit, 0, 0, width, height);
    const lines = wrapTextLines(ctx, text, Math.max(24, content.width - 28));
    const requiredContentHeight = lines.length * bubbleTextLineHeight + 32;
    const heightDeficit = requiredContentHeight - content.height;
    if (heightDeficit <= 0) break;
    height = clamp(height + Math.ceil(heightDeficit), minHeight, 1400);
  }

  return { width, height };
}

export function getPreviewContentRect(asset: BubbleAsset | null, platform: ThemePlatform, edit: BubbleEditState | undefined, x: number, y: number, width: number, height: number) {
  if (!asset) return { x: x + 28, y: y + 20, width: width - 56, height: height - 40 };
  if (platform === "ios") {
    const source = getIosSourceCanvas(asset);
    return mapIosContentRect(edit?.insets ?? defaultInsets[asset.slot], source.width, source.height, x, y, width, height);
  }
  return mapContentRect(edit?.markers ? { ...asset, markers: edit.markers } : asset, x, y, width, height);
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxHeight: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `${bubbleTextFontSize}px Segoe UI, Noto Sans KR, sans-serif`;
  const lineHeight = bubbleTextLineHeight;
  const lines = wrapTextLines(ctx, text, maxWidth);
  const maxLines = Math.max(1, Math.min(lines.length, Math.floor(maxHeight / lineHeight)));
  lines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, x, y + bubbleTextFontSize + index * lineHeight);
  });
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const rawLine of String(text).split("\n")) {
    let line = "";
    for (const char of rawLine) {
      const next = line + char;
      if (ctx.measureText(next).width > maxWidth && line.length > 0) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function renderCapInset(ctx: CanvasRenderingContext2D, asset: BubbleAsset, stretch: StretchPoint, x: number, y: number, width: number, height: number) {
  const source = getIosSourceCanvas(asset);
  const safeInsets = stretchPointToInsets(stretch, source.width, source.height);
  const sx = [0, safeInsets.left, source.width - safeInsets.right, source.width];
  const sy = [0, safeInsets.top, source.height - safeInsets.bottom, source.height];
  const fixedLeft = safeInsets.left;
  const fixedRight = safeInsets.right;
  const fixedTop = safeInsets.top;
  const fixedBottom = safeInsets.bottom;
  const midWidth = Math.max(1, width - fixedLeft - fixedRight);
  const midHeight = Math.max(1, height - fixedTop - fixedBottom);
  const dx = [x, x + fixedLeft, x + fixedLeft + midWidth, x + width];
  const dy = [y, y + fixedTop, y + fixedTop + midHeight, y + height];

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const sourceWidth = sx[col + 1] - sx[col];
      const sourceHeight = sy[row + 1] - sy[row];
      const destWidth = dx[col + 1] - dx[col];
      const destHeight = dy[row + 1] - dy[row];
      if (sourceWidth <= 0 || sourceHeight <= 0 || destWidth <= 0 || destHeight <= 0) continue;
      ctx.drawImage(source, sx[col], sy[row], sourceWidth, sourceHeight, dx[col], dy[row], destWidth, destHeight);
    }
  }
}

function mapIosContentRect(insets: Insets, sourceWidth: number, sourceHeight: number, x: number, y: number, width: number, height: number) {
  const safeInsets = normalizeInsets(insets, sourceWidth, sourceHeight);
  return {
    x: x + safeInsets.left,
    y: y + safeInsets.top,
    width: Math.max(1, width - safeInsets.left - safeInsets.right),
    height: Math.max(1, height - safeInsets.top - safeInsets.bottom),
  };
}

export function stretchPointToInsets(stretch: StretchPoint, sourceWidth: number, sourceHeight: number): Insets {
  const safeStretch = normalizeStretchPoint(stretch, sourceWidth, sourceHeight);
  return {
    top: safeStretch.y,
    right: Math.max(0, sourceWidth - safeStretch.x - 1),
    bottom: Math.max(0, sourceHeight - safeStretch.y - 1),
    left: safeStretch.x,
  };
}

function normalizeInsets(insets: Insets, sourceWidth: number, sourceHeight: number): Insets {
  const maxHorizontal = Math.max(0, Math.floor(sourceWidth - 1));
  const maxVertical = Math.max(0, Math.floor(sourceHeight - 1));
  const left = clamp(Math.round(insets.left), 0, maxHorizontal);
  const right = clamp(Math.round(insets.right), 0, Math.max(0, maxHorizontal - left));
  const top = clamp(Math.round(insets.top), 0, maxVertical);
  const bottom = clamp(Math.round(insets.bottom), 0, Math.max(0, maxVertical - top));
  return { top, right, bottom, left };
}

function normalizeStretchPoint(stretch: StretchPoint, sourceWidth: number, sourceHeight: number): StretchPoint {
  return {
    x: clamp(Math.round(stretch.x), 0, Math.max(0, sourceWidth - 1)),
    y: clamp(Math.round(stretch.y), 0, Math.max(0, sourceHeight - 1)),
  };
}

export function getIosSourceCanvas(asset: BubbleAsset) {
  return asset.name.toLowerCase().endsWith(".9.png") ? asset.innerCanvas : asset.fullCanvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  return ctx;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
