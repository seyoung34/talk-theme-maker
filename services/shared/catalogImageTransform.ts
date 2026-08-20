import sharp from "sharp";
import {
  isAndroidNinePatchSourceName,
  normalizedSourceDimensions,
  type CatalogTransform,
} from "../../lib/theme/export/catalogTransform.js";
import type { BubbleGeometry, Markers } from "../../lib/theme/types.js";

const maxImageDimension = 8192;
const maxImagePixels = 32_000_000;

export type CatalogImageSource = {
  readonly fileName: string;
  readonly sourceScale: 1 | 2 | 3;
  readonly width: number;
  readonly height: number;
};

export class CatalogImageTransformError extends Error {
  readonly code = "asset_transform_failed";

  constructor(message: string) {
    super(message);
    this.name = "CatalogImageTransformError";
  }
}

/**
 * Cloud Run Builder 전용 catalog PNG 변환기.
 *
 * Worker/브라우저에서는 이 모듈을 import하지 않는다. 입력 object의 해시 검증은
 * `createCatalogReader()`가 담당하고, 여기서는 실제 PNG dimension·픽셀과 registry metadata가
 * 일치하는지 다시 확인한 뒤 결과물용 바이트를 만든다.
 */
export async function transformCatalogImage(
  bytes: Uint8Array,
  source: CatalogImageSource,
  transform: CatalogTransform,
): Promise<Uint8Array> {
  if (transform.kind === "android-nine-patch") return transformAndroidNinePatch(bytes, source, transform);
  return transformIosImage(bytes, source, transform);
}

async function transformIosImage(
  bytes: Uint8Array,
  source: CatalogImageSource,
  transform: Extract<CatalogTransform, { kind: "ios-image" }>,
) {
  // 여기서는 크기만 있으면 된다. 픽셀은 아래 pipeline이 다룬다 — 전체 raw 디코딩을 한 번 더
  // 하면 같은 이미지를 두 번 펼치는 셈이다.
  const actual = await readImageDimensions(bytes);
  assertSourceDimensions(actual.width, actual.height, source.width, source.height);

  const normalized = normalizedSourceDimensions(source);
  assertSourceDimensions(transform.sourceDimensions.width, transform.sourceDimensions.height, normalized.width, normalized.height);

  let pipeline = sharp(Buffer.from(bytes), { failOn: "error", limitInputPixels: maxImagePixels });
  if (transform.stripNinePatchBorder) {
    pipeline = pipeline.extract({ left: 1, top: 1, width: actual.width - 2, height: actual.height - 2 });
  }
  if (transform.flipX) pipeline = pipeline.flop();
  if (transform.targetScale !== transform.sourceScale) {
    const ratio = transform.targetScale / transform.sourceScale;
    pipeline = pipeline.resize({
      width: Math.max(1, Math.round(normalized.width * ratio)),
      height: Math.max(1, Math.round(normalized.height * ratio)),
      fit: "fill",
      withoutEnlargement: false,
    });
  }

  try {
    return new Uint8Array(await pipeline.png().toBuffer());
  } catch (error) {
    throw new CatalogImageTransformError(`iOS catalog 이미지 변환에 실패했습니다: ${formatError(error)}`);
  }
}

async function transformAndroidNinePatch(
  bytes: Uint8Array,
  source: CatalogImageSource,
  transform: Extract<CatalogTransform, { kind: "android-nine-patch" }>,
) {
  const decoded = await readRgbaImage(bytes);
  assertSourceDimensions(decoded.width, decoded.height, source.width, source.height);

  const isNinePatchSource = isAndroidNinePatchSourceName(source.fileName);
  const innerWidth = isNinePatchSource ? decoded.width - 2 : decoded.width;
  const innerHeight = isNinePatchSource ? decoded.height - 2 : decoded.height;
  assertRasterBudget(innerWidth, innerHeight);

  const inner = copyInnerPixels(decoded.data, decoded.width, decoded.height, isNinePatchSource, Boolean(transform.flipX));
  const sourceMarkers = isNinePatchSource
    ? parseSourceMarkers(decoded.data, decoded.width, decoded.height)
    : offsetPlainMarkers(defaultMarkers(decoded.width, decoded.height), decoded.width, decoded.height);
  const markers = resolveMarkers(transform, sourceMarkers, innerWidth, innerHeight);
  const outputWidth = innerWidth + 2;
  const outputHeight = innerHeight + 2;
  const output = new Uint8Array(outputWidth * outputHeight * 4);

  for (let y = 0; y < innerHeight; y += 1) {
    for (let x = 0; x < innerWidth; x += 1) {
      const sourceOffset = (y * innerWidth + x) * 4;
      const outputOffset = ((y + 1) * outputWidth + x + 1) * 4;
      output[outputOffset] = inner[sourceOffset];
      output[outputOffset + 1] = inner[sourceOffset + 1];
      output[outputOffset + 2] = inner[sourceOffset + 2];
      output[outputOffset + 3] = inner[sourceOffset + 3];
    }
  }

  drawHorizontalMarker(output, outputWidth, 0, markers.top.start, markers.top.end);
  drawHorizontalMarker(output, outputWidth, outputHeight - 1, markers.bottom.start, markers.bottom.end);
  drawVerticalMarker(output, outputWidth, 0, markers.left.start, markers.left.end);
  drawVerticalMarker(output, outputWidth, outputWidth - 1, markers.right.start, markers.right.end);

  try {
    return new Uint8Array(await sharp(Buffer.from(output), { raw: { width: outputWidth, height: outputHeight, channels: 4 } }).png().toBuffer());
  } catch (error) {
    throw new CatalogImageTransformError(`Android 9-patch 변환에 실패했습니다: ${formatError(error)}`);
  }
}

function resolveMarkers(
  transform: Extract<CatalogTransform, { kind: "android-nine-patch" }>,
  sourceMarkers: Markers,
  innerWidth: number,
  innerHeight: number,
): Markers {
  const ninePatch = transform.ninePatch;
  if (ninePatch?.geometry) {
    const geometry = transform.flipX ? flipGeometry(ninePatch.geometry, innerWidth) : ninePatch.geometry;
    return geometryToMarkers(geometry, innerWidth, innerHeight);
  }
  if (ninePatch?.markers) return transform.flipX ? flipMarkers(ninePatch.markers, innerWidth) : ninePatch.markers;
  return transform.flipX ? flipMarkers(sourceMarkers, innerWidth) : sourceMarkers;
}

/**
 * 헤더만 읽어 크기를 얻는다. 픽셀은 디코딩하지 않는다.
 *
 * 예산 검사를 raw 디코딩 **뒤에** 하면 막으려던 할당이 이미 끝난 상태라 가드가 아무 일도
 * 하지 않는다. 20 MiB PNG도 압축을 풀면 수 GB가 될 수 있어(decompression bomb) Cloud Run이
 * 깔끔한 오류 대신 OOM으로 죽는다. 그래서 크기는 항상 여기서 먼저 확인한다.
 */
export async function readImageDimensions(bytes: Uint8Array) {
  try {
    const metadata = await sharp(Buffer.from(bytes), { failOn: "error", limitInputPixels: maxImagePixels }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    assertRasterBudget(width, height);
    return { width, height };
  } catch (error) {
    if (error instanceof CatalogImageTransformError) throw error;
    throw new CatalogImageTransformError(`catalog PNG 헤더를 읽지 못했습니다: ${formatError(error)}`);
  }
}

async function readRgbaImage(bytes: Uint8Array) {
  // 디코딩 전에 막는다. 이 호출이 실패하면 raw 버퍼는 만들어지지 않는다.
  const { width, height } = await readImageDimensions(bytes);
  try {
    const decoded = await sharp(Buffer.from(bytes), { failOn: "error", limitInputPixels: maxImagePixels })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assertSourceDimensions(decoded.info.width, decoded.info.height, width, height);
    return { data: new Uint8Array(decoded.data), width: decoded.info.width, height: decoded.info.height };
  } catch (error) {
    if (error instanceof CatalogImageTransformError) throw error;
    throw new CatalogImageTransformError(`catalog PNG 디코딩에 실패했습니다: ${formatError(error)}`);
  }
}

function copyInnerPixels(data: Uint8Array, width: number, height: number, stripBorder: boolean, flipX: boolean) {
  const offset = stripBorder ? 1 : 0;
  const innerWidth = stripBorder ? width - 2 : width;
  const innerHeight = stripBorder ? height - 2 : height;
  const inner = new Uint8Array(innerWidth * innerHeight * 4);
  for (let y = 0; y < innerHeight; y += 1) {
    for (let x = 0; x < innerWidth; x += 1) {
      const sourceX = offset + x;
      const targetX = flipX ? innerWidth - 1 - x : x;
      const sourceOffset = ((offset + y) * width + sourceX) * 4;
      const targetOffset = (y * innerWidth + targetX) * 4;
      inner[targetOffset] = data[sourceOffset];
      inner[targetOffset + 1] = data[sourceOffset + 1];
      inner[targetOffset + 2] = data[sourceOffset + 2];
      inner[targetOffset + 3] = data[sourceOffset + 3];
    }
  }
  return inner;
}

function parseSourceMarkers(data: Uint8Array, width: number, height: number): Markers {
  const defaults = defaultMarkers(width, height);
  return {
    top: firstMarkerRange(width, (x) => isMarker(pixelAt(data, width, x, 0))) ?? defaults.top,
    left: firstMarkerRange(height, (y) => isMarker(pixelAt(data, width, 0, y))) ?? defaults.left,
    right: firstMarkerRange(height, (y) => isMarker(pixelAt(data, width, width - 1, y))) ?? defaults.right,
    bottom: firstMarkerRange(width, (x) => isMarker(pixelAt(data, width, x, height - 1))) ?? defaults.bottom,
  };
}

function firstMarkerRange(length: number, predicate: (index: number) => boolean) {
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

function defaultMarkers(width: number, height: number): Markers {
  return {
    top: { start: Math.max(1, Math.round(width * 0.35)), end: Math.min(width - 1, Math.round(width * 0.65)) },
    left: { start: Math.max(1, Math.round(height * 0.35)), end: Math.min(height - 1, Math.round(height * 0.65)) },
    right: { start: Math.max(1, Math.round(height * 0.2)), end: Math.min(height - 1, Math.round(height * 0.8)) },
    bottom: { start: Math.max(1, Math.round(width * 0.2)), end: Math.min(width - 1, Math.round(width * 0.8)) },
  };
}

function offsetPlainMarkers(markers: Markers, width: number, height: number): Markers {
  return {
    top: offsetRange(markers.top, width),
    bottom: offsetRange(markers.bottom, width),
    left: offsetRange(markers.left, height),
    right: offsetRange(markers.right, height),
  };
}

function offsetRange(range: { start: number; end: number }, max: number) {
  return { start: clamp(range.start + 1, 1, max), end: clamp(range.end + 1, 1, max) };
}

function geometryToMarkers(geometry: BubbleGeometry, width: number, height: number): Markers {
  const safe = normalizeGeometry(geometry, width, height);
  return {
    top: pointToMarkerRange(safe.stretch.x, width, 2),
    left: pointToMarkerRange(safe.stretch.y, height, 2),
    bottom: { start: safe.contentInsets.left + 1, end: width - safe.contentInsets.right + 1 },
    right: { start: safe.contentInsets.top + 1, end: height - safe.contentInsets.bottom + 1 },
  };
}

function normalizeGeometry(geometry: BubbleGeometry, width: number, height: number): BubbleGeometry {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const left = clamp(Math.round(geometry.contentInsets.left), 0, safeWidth - 1);
  const right = clamp(Math.round(geometry.contentInsets.right), 0, safeWidth - left - 1);
  const top = clamp(Math.round(geometry.contentInsets.top), 0, safeHeight - 1);
  const bottom = clamp(Math.round(geometry.contentInsets.bottom), 0, safeHeight - top - 1);
  return {
    stretch: {
      x: clamp(Math.round(geometry.stretch.x), 0, safeWidth - 1),
      y: clamp(Math.round(geometry.stretch.y), 0, safeHeight - 1),
    },
    contentInsets: { top, right, bottom, left },
  };
}

function pointToMarkerRange(point: number, max: number, requestedSpan: number) {
  const safeMax = Math.max(1, Math.round(max));
  const span = clamp(Math.round(requestedSpan), 1, safeMax);
  const start = clamp(Math.round(point), 0, safeMax - span);
  return { start: start + 1, end: start + span + 1 };
}

function flipGeometry(geometry: BubbleGeometry, width: number): BubbleGeometry {
  const safe = normalizeGeometry(geometry, width, Number.MAX_SAFE_INTEGER);
  return {
    stretch: { ...safe.stretch, x: Math.max(0, Math.round(width) - 1) - safe.stretch.x },
    contentInsets: {
      ...safe.contentInsets,
      left: safe.contentInsets.right,
      right: safe.contentInsets.left,
    },
  };
}

function flipMarkers(markers: Markers, innerWidth: number): Markers {
  const width = Math.max(1, Math.round(innerWidth));
  const flipRange = (range: { start: number; end: number }) => ({
    start: width - Math.round(range.end) + 2,
    end: width - Math.round(range.start) + 2,
  });
  return { ...markers, top: flipRange(markers.top), bottom: flipRange(markers.bottom) };
}

function drawHorizontalMarker(data: Uint8Array, width: number, y: number, start: number, end: number) {
  for (let x = start; x < Math.max(start + 1, end); x += 1) setBlackPixel(data, width, x, y);
}

function drawVerticalMarker(data: Uint8Array, width: number, x: number, start: number, end: number) {
  for (let y = start; y < Math.max(start + 1, end); y += 1) setBlackPixel(data, width, x, y);
}

function setBlackPixel(data: Uint8Array, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  data[offset] = 0;
  data[offset + 1] = 0;
  data[offset + 2] = 0;
  data[offset + 3] = 255;
}

function pixelAt(data: Uint8Array, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]] as const;
}

function isMarker(pixel: readonly number[]) {
  return pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 255;
}

function assertSourceDimensions(actualWidth: number, actualHeight: number, expectedWidth: number, expectedHeight: number) {
  if (actualWidth !== expectedWidth || actualHeight !== expectedHeight) {
    throw new CatalogImageTransformError(`catalog PNG dimension이 registry와 다릅니다: expected ${expectedWidth}x${expectedHeight}, got ${actualWidth}x${actualHeight}`);
  }
}

function assertRasterBudget(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > maxImageDimension || height > maxImageDimension || width * height > maxImagePixels) {
    throw new CatalogImageTransformError("catalog 이미지 dimension이 Builder 한도를 초과했습니다.");
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
