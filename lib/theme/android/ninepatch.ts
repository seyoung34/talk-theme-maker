import type { BubbleAsset, BubbleSlot, InvalidPixel, Markers, Range } from "@/lib/theme/types";

const transparent = [0, 0, 0, 0] as const;
const markerBlack = [0, 0, 0, 255] as const;

export type NinePatchImageSource = HTMLImageElement | ImageBitmap;

// 나인패치 테두리 네 변을 1px 스트립으로 읽은 결과. ImageData가 그대로 들어맞는다.
export type BorderPixelStrip = { readonly data: Uint8ClampedArray };
export type BorderPixels = {
  readonly top: BorderPixelStrip;
  readonly bottom: BorderPixelStrip;
  readonly left: BorderPixelStrip;
  readonly right: BorderPixelStrip;
};

// 이미 바이트를 들고 있을 때 쓰는 경로. data URL을 거치면 base64 인코딩 비용과
// 33% 큰 문자열을 메인 스레드에서 만들게 되는데, createImageBitmap은 그대로 디코딩한다.
// JS가 받아 온 blob이라 원본이 외부 도메인이어도 캔버스가 오염되지 않는다(getImageData 가능).
export async function loadNinePatchBlob(blob: Blob, name: string, slot: BubbleSlot): Promise<BubbleAsset> {
  // iOS 기본 말풍선은 SVG다. Chrome의 createImageBitmap은 SVG Blob을 안정적으로
  // 디코딩하지 못하므로, SVG는 <img>를 거쳐 캔버스에 복사한다. 이때 blob: URL을
  // 쓰고 바로 해제하면 새로고침 직후 병렬 미리보기 로딩에서 브라우저가 아직 원본을
  // 읽는 중일 수 있다. data URL은 해당 수명 경합이 없어 복원된 작업에서도 안전하다.
  if (isSvgImage(blob, name)) {
    const source = await loadBlobImage(blob);
    return isNinePatchName(name) ? parseImage(source, name, slot) : parsePlainImage(source, name, slot);
  }

  const bitmap = await createImageBitmap(blob);
  try {
    return isNinePatchName(name) ? parseImage(bitmap, name, slot) : parsePlainImage(bitmap, name, slot);
  } finally {
    bitmap.close();
  }
}

export async function loadNinePatchDataUrl(dataUrl: string, name: string, slot: BubbleSlot): Promise<BubbleAsset> {
  const source = await loadImage(dataUrl);
  return isNinePatchName(name) ? parseImage(source, name, slot) : parsePlainImage(source, name, slot);
}

/** 9-patch marker가 없는 일반 PNG/SVG를 프리뷰용 BubbleAsset으로 읽습니다. */
export function parsePlainImage(source: NinePatchImageSource, name: string, slot: BubbleSlot): BubbleAsset {
  const fullCanvas = createCanvasFromSource(source);
  const markers = defaultMarkers(fullCanvas.width, fullCanvas.height);
  return {
    slot,
    name,
    fullCanvas,
    innerCanvas: fullCanvas,
    width: fullCanvas.width,
    height: fullCanvas.height,
    markers: offsetPlainMarkers(markers, fullCanvas.width, fullCanvas.height),
    invalidPixels: [],
  };
}

export function parseImage(source: NinePatchImageSource, name: string, slot: BubbleSlot): BubbleAsset {
  const fullCanvas = createCanvasFromSource(source);
  const ctx = context(fullCanvas);

  // 마커와 유효성 검사는 테두리 1px만 본다. 이미지 전체를 getImageData로 가져오면
  // 픽셀 수만큼 복사 비용을 내므로 네 변만 따로 읽는다.
  const border = readBorderPixels(ctx, fullCanvas.width, fullCanvas.height);
  const invalidPixels = collectInvalidBorderPixels(border, fullCanvas.width, fullCanvas.height);
  const markers = parseMarkers(border, fullCanvas.width, fullCanvas.height);

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
    fullCanvas,
    innerCanvas,
    width: fullCanvas.width,
    height: fullCanvas.height,
    markers,
    invalidPixels,
  };
}

function createCanvasFromSource(source: NinePatchImageSource) {
  const canvas = document.createElement("canvas");
  canvas.width = "naturalWidth" in source ? source.naturalWidth : source.width;
  canvas.height = "naturalHeight" in source ? source.naturalHeight : source.height;
  context(canvas).drawImage(source, 0, 0);
  return canvas;
}

function offsetPlainMarkers(markers: ReturnType<typeof defaultMarkers>, width: number, height: number) {
  return {
    top: offsetRange(markers.top, width),
    bottom: offsetRange(markers.bottom, width),
    left: offsetRange(markers.left, height),
    right: offsetRange(markers.right, height),
  };
}

function offsetRange(range: Range, max: number): Range {
  return {
    start: clamp(range.start + 1, 1, max),
    end: clamp(range.end + 1, 1, max),
  };
}

// 고정(코너) 두 변의 합이 대상 길이를 넘으면 비례 축소해 [start, end] 고정폭을 반환한다.
// 합이 대상 안에 들어가면 원본 픽셀 고정폭을 그대로 유지한다.
export function shrinkFixed(startFixed: number, endFixed: number, target: number): [number, number] {
  const total = startFixed + endFixed;
  if (total <= 0 || total <= target) return [startFixed, endFixed];
  const scale = target / total;
  return [startFixed * scale, endFixed * scale];
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
  // 대상 크기가 고정 코너 합보다 작으면(예: 작은 썸네일 말풍선) 코너를 비례 축소해
  // 코너끼리 겹치거나 가운데가 뭉개지는 왜곡을 막는다.
  const [fixedLeft, fixedRight] = shrinkFixed(top.start, innerWidth - top.end, width);
  const [fixedTop, fixedBottom] = shrinkFixed(left.start, innerHeight - left.end, height);
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

export function parseMarkers(border: BorderPixels, width: number, height: number): Markers {
  const defaults = defaultMarkers(width, height);
  return {
    top: firstRange(width, (x) => isMarker(stripPixel(border.top, x))) ?? defaults.top,
    left: firstRange(height, (y) => isMarker(stripPixel(border.left, y))) ?? defaults.left,
    right: firstRange(height, (y) => isMarker(stripPixel(border.right, y))) ?? defaults.right,
    bottom: firstRange(width, (x) => isMarker(stripPixel(border.bottom, x))) ?? defaults.bottom,
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

export function collectInvalidBorderPixels(border: BorderPixels, width: number, height: number): InvalidPixel[] {
  const invalid: InvalidPixel[] = [];
  const check = (strip: BorderPixelStrip, index: number, x: number, y: number) => {
    const rgba = stripPixel(strip, index);
    if (!isMarker(rgba) && !isTransparent(rgba)) invalid.push({ x, y, rgba });
  };
  for (let x = 0; x < width; x += 1) {
    check(border.top, x, x, 0);
    check(border.bottom, x, x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    check(border.left, y, 0, y);
    check(border.right, y, width - 1, y);
  }
  return invalid;
}

// 한 줄짜리 스트립이므로 인덱스가 곧 픽셀 순서다(가로 변은 x, 세로 변은 y).
function stripPixel(strip: BorderPixelStrip, index: number): [number, number, number, number] {
  const offset = index * 4;
  return [strip.data[offset], strip.data[offset + 1], strip.data[offset + 2], strip.data[offset + 3]];
}

function readBorderPixels(ctx: CanvasRenderingContext2D, width: number, height: number): BorderPixels {
  return {
    top: ctx.getImageData(0, 0, width, 1),
    bottom: ctx.getImageData(0, height - 1, width, 1),
    left: ctx.getImageData(0, 0, 1, height),
    right: ctx.getImageData(width - 1, 0, 1, height),
  };
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed."));
    img.src = src;
  });
}

async function loadBlobImage(blob: Blob): Promise<HTMLImageElement> {
  return loadImage(await blobToDataUrl(blob));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Image source could not be read."));
    reader.readAsDataURL(blob);
  });
}

function isSvgImage(blob: Blob, name: string) {
  return blob.type.toLowerCase().includes("svg") || name.toLowerCase().endsWith(".svg");
}

function isNinePatchName(name: string) {
  return name.toLowerCase().endsWith(".9.png");
}
