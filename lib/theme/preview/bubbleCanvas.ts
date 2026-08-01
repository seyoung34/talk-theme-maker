// 말풍선 캔버스 렌더링의 단일 소스.
// 편집기 프리뷰(ChatroomPreview)와 갤러리 모달이 동일한 9-slice/텍스트영역 계산을 공유해
// 픽셀 단위로 일치하도록 한다. 모든 계산은 소스 픽셀 공간에서 이뤄지고, 표시 크기는 CSS로 축소한다.
import { mapContentRect, renderNinePatch, shrinkFixed } from "@/lib/theme/android/ninepatch";
import { bubbleGeometryToAndroidMarkers, centeredBubbleGeometry } from "@/lib/theme/bubbleGeometry";
import { isAndroidNinePatchSourceName } from "@/lib/theme/sourceImage";
import type { BubbleEditState } from "@/lib/theme/project/state";
import type { BubbleAsset, Insets, StretchPoint, ThemePlatform } from "@/lib/theme/types";

export const bubbleTextFontSize = 36;
export const bubbleTextLineHeight = 48;

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
  const flipX = Boolean(edit?.flipX);

  if (asset) {
    // 반전은 그림에만 적용한다. 글자와 선택 테두리까지 뒤집히면 안 되므로 asset을 그리는 동안만
    // 좌표계를 말풍선 rect의 중심을 기준으로 미러링한다. 9-slice 계산은 원본 좌표 그대로 두고
    // 결과만 뒤집으므로 marker/inset을 따로 변환할 필요가 없다.
    if (flipX) {
      ctx.save();
      ctx.translate(x + width, 0);
      ctx.scale(-1, 1);
      ctx.translate(-x, 0);
    }
    if (platform === "ios") {
      const source = getIosSourceCanvas(asset);
      const fallback = centeredBubbleGeometry(source.width, source.height);
      const stretch = normalizeStretchPoint(edit?.geometry?.stretch ?? edit?.stretch ?? fallback.stretch, source.width, source.height);
      renderCapInset(ctx, asset, stretch, x, y, width, height);
    } else {
      renderNinePatch(ctx, getAndroidRenderAsset(asset, edit), x, y, width, height);
    }
    if (flipX) ctx.restore();
  } else {
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(20,52,58,0.7)";
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, width, height, 28);
    ctx.fill();
    ctx.stroke();
  }

  // 글자는 미러링하지 않으므로 글자 영역만 같은 축으로 뒤집어 준다.
  const contentRect = mirrorContentRect(getPreviewContentRect(asset, platform, edit, x, y, width, height), flipX, x, width);
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
    const fallback = centeredBubbleGeometry(source.width, source.height);
    return mapIosContentRect(edit?.geometry?.contentInsets ?? edit?.insets ?? fallback.contentInsets, source.width, source.height, x, y, width, height);
  }
  return mapContentRect(getAndroidRenderAsset(asset, edit), x, y, width, height);
}

/**
 * 말풍선 rect의 세로 중심축을 기준으로 사각형을 뒤집는다.
 *
 * `getPreviewContentRect`는 반전을 모르는 순수 계산이다. 반전 여부에 따라 geometry를 미리
 * 변환하는 대신 결과 사각형만 뒤집으면 계산이 한 곳에 모이고 왕복 오차도 생기지 않는다.
 */
export function mirrorContentRect<T extends { x: number; width: number }>(rect: T, flipX: boolean, bubbleX: number, bubbleWidth: number): T {
  if (!flipX) return rect;
  return { ...rect, x: 2 * bubbleX + bubbleWidth - rect.x - rect.width };
}

function getAndroidRenderAsset(asset: BubbleAsset, edit: BubbleEditState | undefined): BubbleAsset {
  if (edit?.geometry) {
    return {
      ...asset,
      markers: bubbleGeometryToAndroidMarkers(edit.geometry, asset.innerCanvas.width, asset.innerCanvas.height),
    };
  }
  return edit?.markers ? { ...asset, markers: edit.markers } : asset;
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
  // 대상이 cap-inset 고정 코너 합보다 작으면(작은 썸네일 말풍선) 코너를 비례 축소해 왜곡을 막는다.
  const [fixedLeft, fixedRight] = shrinkFixed(safeInsets.left, safeInsets.right, width);
  const [fixedTop, fixedBottom] = shrinkFixed(safeInsets.top, safeInsets.bottom, height);
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
  return isAndroidNinePatchSourceName(asset.name) ? asset.innerCanvas : asset.fullCanvas;
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
