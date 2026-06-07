import type { BubbleAsset, BubbleSlot, InvalidPixel, Markers, Range } from "@/lib/theme/types";

const transparent = [0, 0, 0, 0] as const;
const markerBlack = [0, 0, 0, 255] as const;

export async function loadNinePatchFile(file: File, slot: BubbleSlot): Promise<BubbleAsset> {
  const dataUrl = await readFileAsDataUrl(file);
  const source = await loadImage(dataUrl);
  return parseImage(source, file.name, slot, dataUrl);
}

export async function loadNinePatchDataUrl(dataUrl: string, name: string, slot: BubbleSlot): Promise<BubbleAsset> {
  const source = await loadImage(dataUrl);
  return parseImage(source, name, slot, dataUrl);
}

export function parseImage(source: HTMLImageElement, name: string, slot: BubbleSlot, dataUrl = source.src): BubbleAsset {
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = source.naturalWidth;
  fullCanvas.height = source.naturalHeight;
  const ctx = context(fullCanvas);
  ctx.drawImage(source, 0, 0);

  const imageData = ctx.getImageData(0, 0, fullCanvas.width, fullCanvas.height);
  const invalidPixels = collectInvalidBorderPixels(imageData);
  const markers = parseMarkers(imageData);

  const innerCanvas = document.createElement("canvas");
  innerCanvas.width = Math.max(1, fullCanvas.width - 2);
  innerCanvas.height = Math.max(1, fullCanvas.height - 2);
  context(innerCanvas).drawImage(
    fullCanvas,
    1,
    1,
    innerCanvas.width,
    innerCanvas.height,
    0,
    0,
    innerCanvas.width,
    innerCanvas.height,
  );

  return {
    slot,
    name,
    dataUrl,
    source,
    fullCanvas,
    innerCanvas,
    width: fullCanvas.width,
    height: fullCanvas.height,
    markers,
    invalidPixels,
  };
}

export function defaultMarkers(width: number, height: number): Markers {
  return {
    top: { start: Math.max(1, Math.round(width * 0.35)), end: Math.min(width - 1, Math.round(width * 0.65)) },
    left: { start: Math.max(1, Math.round(height * 0.35)), end: Math.min(height - 1, Math.round(height * 0.65)) },
    right: { start: Math.max(1, Math.round(height * 0.2)), end: Math.min(height - 1, Math.round(height * 0.8)) },
    bottom: { start: Math.max(1, Math.round(width * 0.2)), end: Math.min(width - 1, Math.round(width * 0.8)) },
  };
}

export function renderNinePatch(
  ctx: CanvasRenderingContext2D,
  asset: BubbleAsset,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return;
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const inner = asset.innerCanvas;
  const innerWidth = inner.width;
  const innerHeight = inner.height;
  const top = toInnerRange(asset.markers.top, innerWidth);
  const left = toInnerRange(asset.markers.left, innerHeight);

  const sx = [0, top.start, top.end, innerWidth];
  const sy = [0, left.start, left.end, innerHeight];
  const fixedLeft = top.start;
  const fixedRight = innerWidth - top.end;
  const fixedTop = left.start;
  const fixedBottom = innerHeight - left.end;
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
      ctx.drawImage(inner, sx[col], sy[row], sourceWidth, sourceHeight, dx[col], dy[row], destWidth, destHeight);
    }
  }
}

export function mapContentRect(asset: BubbleAsset, x: number, y: number, width: number, height: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const innerWidth = asset.innerCanvas.width;
  const innerHeight = asset.innerCanvas.height;
  const stretchX = toInnerRange(asset.markers.top, innerWidth);
  const stretchY = toInnerRange(asset.markers.left, innerHeight);
  const contentX = toInnerRange(asset.markers.bottom, innerWidth);
  const contentY = toInnerRange(asset.markers.right, innerHeight);

  const fixedLeft = stretchX.start;
  const fixedRight = innerWidth - stretchX.end;
  const fixedTop = stretchY.start;
  const fixedBottom = innerHeight - stretchY.end;
  const midWidth = Math.max(1, width - fixedLeft - fixedRight);
  const midHeight = Math.max(1, height - fixedTop - fixedBottom);
  const scaleX = midWidth / Math.max(1, stretchX.end - stretchX.start);
  const scaleY = midHeight / Math.max(1, stretchY.end - stretchY.start);

  const mapX = (value: number) => {
    if (value <= stretchX.start) return x + value;
    if (value >= stretchX.end) return x + fixedLeft + midWidth + value - stretchX.end;
    return x + fixedLeft + (value - stretchX.start) * scaleX;
  };
  const mapY = (value: number) => {
    if (value <= stretchY.start) return y + value;
    if (value >= stretchY.end) return y + fixedTop + midHeight + value - stretchY.end;
    return y + fixedTop + (value - stretchY.start) * scaleY;
  };

  const x1 = mapX(contentX.start);
  const x2 = mapX(contentX.end);
  const y1 = mapY(contentY.start);
  const y2 = mapY(contentY.end);
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

export function mapStretchRect(asset: BubbleAsset, x: number, y: number, width: number, height: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));

  const innerWidth = asset.innerCanvas.width;
  const innerHeight = asset.innerCanvas.height;
  const stretchX = toInnerRange(asset.markers.top, innerWidth);
  const stretchY = toInnerRange(asset.markers.left, innerHeight);
  const fixedLeft = stretchX.start;
  const fixedRight = innerWidth - stretchX.end;
  const fixedTop = stretchY.start;
  const fixedBottom = innerHeight - stretchY.end;
  const midWidth = Math.max(1, width - fixedLeft - fixedRight);
  const midHeight = Math.max(1, height - fixedTop - fixedBottom);

  return {
    x: x + fixedLeft,
    y: y + fixedTop,
    width: midWidth,
    height: midHeight,
  };
}

export function exportNinePatch(asset: BubbleAsset): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = asset.width;
  canvas.height = asset.height;
  const ctx = context(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(asset.innerCanvas, 0, 0, asset.innerCanvas.width, asset.innerCanvas.height, 1, 1, asset.innerCanvas.width, asset.innerCanvas.height);
  drawMarker(ctx, asset.markers.top.start, 0, asset.markers.top.end - asset.markers.top.start, 1);
  drawMarker(ctx, 0, asset.markers.left.start, 1, asset.markers.left.end - asset.markers.left.start);
  drawMarker(ctx, asset.width - 1, asset.markers.right.start, 1, asset.markers.right.end - asset.markers.right.start);
  drawMarker(ctx, asset.markers.bottom.start, asset.height - 1, asset.markers.bottom.end - asset.markers.bottom.start, 1);
  return canvas;
}

export function downloadNinePatch(asset: BubbleAsset, fileName: string) {
  exportNinePatch(asset).toBlob((blob) => {
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = fileName.endsWith(".9.png") ? fileName : `${fileName}.9.png`;
    a.click();
    URL.revokeObjectURL(href);
  }, "image/png");
}

function parseMarkers(imageData: ImageData): Markers {
  const width = imageData.width;
  const height = imageData.height;
  const defaults = defaultMarkers(width, height);
  return {
    top: firstRange(width, (x) => isMarker(pixel(imageData, x, 0))) ?? defaults.top,
    left: firstRange(height, (y) => isMarker(pixel(imageData, 0, y))) ?? defaults.left,
    right: firstRange(height, (y) => isMarker(pixel(imageData, width - 1, y))) ?? defaults.right,
    bottom: firstRange(width, (x) => isMarker(pixel(imageData, x, height - 1))) ?? defaults.bottom,
  };
}

function firstRange(length: number, predicate: (index: number) => boolean): Range | null {
  let start: number | null = null;
  for (let index = 1; index < length - 1; index += 1) {
    if (predicate(index) && start === null) start = index;
    const atEnd = index === length - 2;
    if (start !== null && (!predicate(index) || atEnd)) {
      const end = predicate(index) && atEnd ? index + 1 : index;
      return { start, end };
    }
  }
  return null;
}

function collectInvalidBorderPixels(imageData: ImageData): InvalidPixel[] {
  const invalid: InvalidPixel[] = [];
  const { width, height } = imageData;
  const check = (x: number, y: number) => {
    const rgba = pixel(imageData, x, y);
    if (!isMarker(rgba) && !isTransparent(rgba)) invalid.push({ x, y, rgba });
  };
  for (let x = 0; x < width; x += 1) {
    check(x, 0);
    check(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    check(0, y);
    check(width - 1, y);
  }
  return invalid;
}

function pixel(imageData: ImageData, x: number, y: number): [number, number, number, number] {
  const offset = (y * imageData.width + x) * 4;
  return [
    imageData.data[offset],
    imageData.data[offset + 1],
    imageData.data[offset + 2],
    imageData.data[offset + 3],
  ];
}

function isMarker(rgba: readonly number[]) {
  return rgba[0] === markerBlack[0] && rgba[1] === markerBlack[1] && rgba[2] === markerBlack[2] && rgba[3] === markerBlack[3];
}

function isTransparent(rgba: readonly number[]) {
  return rgba[3] === transparent[3];
}

function toInnerRange(range: Range, max: number): Range {
  return {
    start: clamp(range.start - 1, 0, max - 1),
    end: clamp(range.end - 1, 1, max),
  };
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.fillRect(x, y, Math.max(1, width), Math.max(1, height));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context is not available.");
  return ctx;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed."));
    img.src = src;
  });
}
