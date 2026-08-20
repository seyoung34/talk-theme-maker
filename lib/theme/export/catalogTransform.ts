import type { BubbleGeometry, Markers } from "../types.js";

export type CatalogTransformDimensions = {
  readonly width: number;
  readonly height: number;
};

/**
 * catalog 원본을 Cloud Run Builder가 결과물용 PNG로 바꿀 때 쓰는 최소 명령 계약.
 *
 * raw image-edit state나 storage 경로를 넣지 않는다. 이 값은 브라우저가 만들지만 Worker가
 * registry metadata와 대조하고 Builder가 다시 검증한다.
 */
export type CatalogTransform =
  | {
      readonly kind: "android-nine-patch";
      readonly outputFormat: "png";
      readonly flipX?: boolean;
      readonly ninePatch?: {
        readonly geometry?: BubbleGeometry;
        readonly markers?: Markers;
      };
    }
  | {
      readonly kind: "ios-image";
      readonly outputFormat: "png";
      readonly sourceScale: 1 | 2 | 3;
      readonly targetScale: 1 | 2 | 3;
      /** Android `.9.png` marker border를 iOS 이미지에서 제거한다. */
      readonly stripNinePatchBorder?: boolean;
      readonly flipX?: boolean;
      /** normalize 후 CSS cap-inset과 결과 이미지가 공유하는 원본 dimension. */
      readonly sourceDimensions: CatalogTransformDimensions;
    };

export type CatalogTransformSource = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sourceScale: 1 | 2 | 3;
  readonly width: number;
  readonly height: number;
};

export type CatalogTransformValidationReason =
  | "invalid_descriptor"
  | "platform_mismatch"
  | "path_mismatch"
  | "source_mismatch"
  | "dimensions_mismatch";

export type CatalogTransformVerdict =
  | { readonly valid: true; readonly transform: CatalogTransform }
  | { readonly valid: false; readonly reason: CatalogTransformValidationReason };

export function parseCatalogTransform(value: unknown): CatalogTransform {
  const verdict = parseCatalogTransformValue(value);
  if (!verdict) throw new Error("invalid_catalog_transform");
  return verdict;
}

export function validateCatalogTransform(input: {
  readonly platform: "android" | "ios";
  readonly path: string;
  readonly source: CatalogTransformSource;
  readonly transform: unknown;
}): CatalogTransformVerdict {
  const transform = parseCatalogTransformValue(input.transform);
  if (!transform) return { valid: false, reason: "invalid_descriptor" };

  if (input.platform === "android") {
    if (transform.kind !== "android-nine-patch") return { valid: false, reason: "platform_mismatch" };
    if (!input.path.toLowerCase().endsWith(".9.png")) return { valid: false, reason: "path_mismatch" };
    if (input.source.mimeType !== "image/png") return { valid: false, reason: "source_mismatch" };
    if (!hasPositiveDimensions(input.source.width, input.source.height)) return { valid: false, reason: "dimensions_mismatch" };
    if (transform.ninePatch?.geometry && !isBubbleGeometry(transform.ninePatch.geometry)) {
      return { valid: false, reason: "invalid_descriptor" };
    }
    if (transform.ninePatch?.markers && !isMarkersWithinSource(transform.ninePatch.markers, input.source)) {
      return { valid: false, reason: "dimensions_mismatch" };
    }
    return { valid: true, transform };
  }

  if (transform.kind !== "ios-image") return { valid: false, reason: "platform_mismatch" };
  if (!input.path.toLowerCase().endsWith(".png")) return { valid: false, reason: "path_mismatch" };
  if (input.source.mimeType !== "image/png" || transform.sourceScale !== input.source.sourceScale) {
    return { valid: false, reason: "source_mismatch" };
  }

  const targetScale = readTargetScale(input.path);
  if (targetScale !== transform.targetScale) return { valid: false, reason: "path_mismatch" };

  const isNinePatchSource = isAndroidNinePatchSourceName(input.source.fileName);
  if (Boolean(transform.stripNinePatchBorder) !== isNinePatchSource) {
    return { valid: false, reason: "source_mismatch" };
  }

  const expectedDimensions = normalizedSourceDimensions(input.source);
  if (!sameDimensions(transform.sourceDimensions, expectedDimensions)) {
    return { valid: false, reason: "dimensions_mismatch" };
  }

  return { valid: true, transform };
}

export function normalizedSourceDimensions(source: Pick<CatalogTransformSource, "fileName" | "width" | "height">) {
  if (isAndroidNinePatchSourceName(source.fileName)) {
    return { width: source.width - 2, height: source.height - 2 };
  }
  return { width: source.width, height: source.height };
}

export function readTargetScale(path: string): 1 | 2 | 3 {
  const match = path.match(/@([23])x(?=\.[a-z0-9]+$)/i);
  if (!match) return 1;
  return match[1] === "2" ? 2 : 3;
}

export function isAndroidNinePatchSourceName(fileName: string) {
  const path = decodeSourcePath(fileName.split(/[?#]/, 1)[0]).toLowerCase();
  return path.endsWith(".9.png");
}

function parseCatalogTransformValue(value: unknown): CatalogTransform | undefined {
  if (!isRecord(value) || typeof value.kind !== "string" || value.outputFormat !== "png") return undefined;
  if (value.flipX !== undefined && typeof value.flipX !== "boolean") return undefined;

  if (value.kind === "android-nine-patch") {
    if (value.ninePatch !== undefined && !isNinePatchOptions(value.ninePatch)) return undefined;
    return {
      kind: "android-nine-patch",
      outputFormat: "png",
      ...(value.flipX !== undefined ? { flipX: value.flipX } : {}),
      ...(value.ninePatch !== undefined ? { ninePatch: value.ninePatch } : {}),
    };
  }

  if (value.kind !== "ios-image" || !isScale(value.sourceScale) || !isScale(value.targetScale)) return undefined;
  if (value.stripNinePatchBorder !== undefined && typeof value.stripNinePatchBorder !== "boolean") return undefined;
  if (!isDimensions(value.sourceDimensions)) return undefined;
  return {
    kind: "ios-image",
    outputFormat: "png",
    sourceScale: value.sourceScale,
    targetScale: value.targetScale,
    ...(value.stripNinePatchBorder !== undefined ? { stripNinePatchBorder: value.stripNinePatchBorder } : {}),
    ...(value.flipX !== undefined ? { flipX: value.flipX } : {}),
    sourceDimensions: value.sourceDimensions,
  };
}

function isNinePatchOptions(value: unknown): value is { geometry?: BubbleGeometry; markers?: Markers } {
  if (!isRecord(value)) return false;
  if (value.geometry === undefined && value.markers === undefined) return false;
  if (value.geometry !== undefined && !isBubbleGeometry(value.geometry)) return false;
  if (value.markers !== undefined && !isMarkers(value.markers)) return false;
  return true;
}

function isBubbleGeometry(value: unknown): value is BubbleGeometry {
  if (!isRecord(value) || !isRecord(value.stretch) || !isRecord(value.contentInsets)) return false;
  return isNonNegativeInteger(value.stretch.x)
    && isNonNegativeInteger(value.stretch.y)
    && isNonNegativeInteger(value.contentInsets.top)
    && isNonNegativeInteger(value.contentInsets.right)
    && isNonNegativeInteger(value.contentInsets.bottom)
    && isNonNegativeInteger(value.contentInsets.left);
}

function isMarkers(value: unknown): value is Markers {
  if (!isRecord(value)) return false;
  return isRange(value.top) && isRange(value.left) && isRange(value.right) && isRange(value.bottom);
}

function isMarkersWithinSource(value: Markers, source: CatalogTransformSource) {
  if (!isMarkers(value)) return false;
  const innerWidth = isAndroidNinePatchSourceName(source.fileName) ? source.width - 2 : source.width;
  const innerHeight = isAndroidNinePatchSourceName(source.fileName) ? source.height - 2 : source.height;
  return isRangeWithin(value.top, innerWidth + 1)
    && isRangeWithin(value.bottom, innerWidth + 1)
    && isRangeWithin(value.left, innerHeight + 1)
    && isRangeWithin(value.right, innerHeight + 1);
}

function isRange(value: unknown): value is { start: number; end: number } {
  return isRecord(value)
    && isNonNegativeInteger(value.start)
    && isNonNegativeInteger(value.end)
    && value.end > value.start;
}

function isRangeWithin(value: { start: number; end: number }, max: number) {
  return value.start >= 1 && value.end <= max;
}

function isDimensions(value: unknown): value is CatalogTransformDimensions {
  return isRecord(value) && hasPositiveDimensions(value.width, value.height);
}

function sameDimensions(left: CatalogTransformDimensions, right: CatalogTransformDimensions) {
  return left.width === right.width && left.height === right.height;
}

function hasPositiveDimensions(width: unknown, height: unknown): width is number {
  return isPositiveInteger(width) && isPositiveInteger(height);
}

function isScale(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSourcePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
