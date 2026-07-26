import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

export const androidStretchSpan = 2;

export function normalizeBubbleGeometry(geometry: BubbleGeometry, width: number, height: number): BubbleGeometry {
  return {
    stretch: normalizeStretchPoint(geometry.stretch, width, height),
    contentInsets: normalizeContentInsets(geometry.contentInsets, width, height),
  };
}

export function androidMarkersToBubbleGeometry(markers: Markers, innerWidth: number, innerHeight: number): BubbleGeometry {
  const stretchX = markerRangeToInnerRange(markers.top, innerWidth);
  const stretchY = markerRangeToInnerRange(markers.left, innerHeight);
  const contentX = markerRangeToInnerRange(markers.bottom, innerWidth);
  const contentY = markerRangeToInnerRange(markers.right, innerHeight);

  return normalizeBubbleGeometry({
    stretch: {
      x: rangeRepresentativePoint(stretchX),
      y: rangeRepresentativePoint(stretchY),
    },
    contentInsets: {
      top: contentY.start,
      right: Math.max(0, innerWidth - contentX.end),
      bottom: Math.max(0, innerHeight - contentY.end),
      left: contentX.start,
    },
  }, innerWidth, innerHeight);
}

export function bubbleGeometryToAndroidMarkers(
  geometry: BubbleGeometry,
  innerWidth: number,
  innerHeight: number,
  stretchSpan = androidStretchSpan,
): Markers {
  const safe = normalizeBubbleGeometry(geometry, innerWidth, innerHeight);
  const horizontalStretch = pointToMarkerRange(safe.stretch.x, innerWidth, stretchSpan);
  const verticalStretch = pointToMarkerRange(safe.stretch.y, innerHeight, stretchSpan);
  const contentLeft = safe.contentInsets.left;
  const contentRight = innerWidth - safe.contentInsets.right;
  const contentTop = safe.contentInsets.top;
  const contentBottom = innerHeight - safe.contentInsets.bottom;

  return {
    top: horizontalStretch,
    left: verticalStretch,
    bottom: { start: contentLeft + 1, end: contentRight + 1 },
    right: { start: contentTop + 1, end: contentBottom + 1 },
  };
}

export function bubbleGeometryToLegacyEdit(geometry: BubbleGeometry, innerWidth: number, innerHeight: number) {
  const safe = normalizeBubbleGeometry(geometry, innerWidth, innerHeight);
  return {
    geometry: safe,
    markers: bubbleGeometryToAndroidMarkers(safe, innerWidth, innerHeight),
    insets: safe.contentInsets,
    stretch: safe.stretch,
  };
}

export function resolveBubbleGeometry({
  platform,
  geometry,
  markers,
  insets,
  stretch,
  fallbackMarkers,
  fallbackInsets,
  fallbackStretch,
  width,
  height,
}: {
  platform: ThemePlatform;
  geometry?: BubbleGeometry;
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  fallbackMarkers: Markers;
  fallbackInsets: Insets;
  fallbackStretch: StretchPoint;
  width: number;
  height: number;
}): BubbleGeometry {
  if (geometry) return normalizeBubbleGeometry(geometry, width, height);
  if (platform === "android" && (markers || fallbackMarkers)) {
    return androidMarkersToBubbleGeometry(markers ?? fallbackMarkers, width, height);
  }
  if (insets || stretch) {
    return normalizeBubbleGeometry({
      contentInsets: insets ?? fallbackInsets,
      stretch: stretch ?? fallbackStretch,
    }, width, height);
  }
  if (markers) return androidMarkersToBubbleGeometry(markers, width, height);
  return normalizeBubbleGeometry({ contentInsets: fallbackInsets, stretch: fallbackStretch }, width, height);
}

export function flipBubbleGeometryHorizontally(geometry: BubbleGeometry, width: number): BubbleGeometry {
  const safe = normalizeBubbleGeometry(geometry, width, Number.MAX_SAFE_INTEGER);
  return {
    stretch: { ...safe.stretch, x: Math.max(0, Math.round(width) - 1) - safe.stretch.x },
    contentInsets: {
      ...safe.contentInsets,
      left: safe.contentInsets.right,
      right: safe.contentInsets.left,
    },
  };
}

export function parseBubbleGeometry(value: unknown): BubbleGeometry | undefined {
  if (!isRecord(value) || !isRecord(value.stretch) || !isRecord(value.contentInsets)) return undefined;
  const stretch = value.stretch;
  const contentInsets = value.contentInsets;
  if (!isNonNegativeInteger(stretch.x) || !isNonNegativeInteger(stretch.y)) return undefined;
  if (!isNonNegativeInteger(contentInsets.top) || !isNonNegativeInteger(contentInsets.right) || !isNonNegativeInteger(contentInsets.bottom) || !isNonNegativeInteger(contentInsets.left)) return undefined;
  return {
    stretch: { x: stretch.x, y: stretch.y },
    contentInsets: {
      top: contentInsets.top,
      right: contentInsets.right,
      bottom: contentInsets.bottom,
      left: contentInsets.left,
    },
  };
}

export function parseBubbleGeometryMap(value: unknown): Partial<Record<string, BubbleGeometry>> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).flatMap(([slotId, geometry]) => {
    const parsed = parseBubbleGeometry(geometry);
    return parsed ? [[slotId, parsed] as const] : [];
  });
  return Object.fromEntries(entries);
}

function markerRangeToInnerRange(range: { start: number; end: number }, max: number) {
  const safeMax = Math.max(1, Math.round(max));
  const start = clamp(Math.round(range.start) - 1, 0, safeMax - 1);
  const end = clamp(Math.round(range.end) - 1, start + 1, safeMax);
  return { start, end };
}

function rangeRepresentativePoint(range: { start: number; end: number }) {
  return Math.floor((range.start + range.end - 1) / 2);
}

function pointToMarkerRange(point: number, max: number, requestedSpan: number) {
  const safeMax = Math.max(1, Math.round(max));
  const span = clamp(Math.round(requestedSpan), 1, safeMax);
  const start = clamp(Math.round(point), 0, safeMax - span);
  return { start: start + 1, end: start + span + 1 };
}

function normalizeStretchPoint(stretch: StretchPoint, width: number, height: number): StretchPoint {
  return {
    x: clamp(Math.round(stretch.x), 0, Math.max(0, Math.round(width) - 1)),
    y: clamp(Math.round(stretch.y), 0, Math.max(0, Math.round(height) - 1)),
  };
}

function normalizeContentInsets(insets: Insets, width: number, height: number): Insets {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const left = clamp(Math.round(insets.left), 0, safeWidth - 1);
  const right = clamp(Math.round(insets.right), 0, safeWidth - left - 1);
  const top = clamp(Math.round(insets.top), 0, safeHeight - 1);
  const bottom = clamp(Math.round(insets.bottom), 0, safeHeight - top - 1);
  return { top, right, bottom, left };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
