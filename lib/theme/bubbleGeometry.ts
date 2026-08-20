// Builder(NodeNext)도 이 모듈을 가져간다. `@/` alias는 builder tsconfig(`paths: {}`)에서 풀리지
// 않으므로 상대 경로를 쓴다. 타입 전용이라 번들에서 소거되어 앱 빌드에는 영향이 없다.
import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform } from "./types.js";

export const androidStretchSpan = 2;

// 편집 시작값의 콘텐츠 여백 비율. 이미지 크기와 무관하게 가운데 50% 영역이 텍스트 상자가 된다.
const centeredContentInsetRatio = 0.25;

/**
 * 저장된 편집값이 없을 때 쓸 시작 geometry.
 *
 * 고정 픽셀 기본값은 특정 크기의 기본 에셋에 맞춰 만든 값이라, 사용자가 올린 이미지
 * 크기가 다르면 텍스트 상자와 stretch 선이 구석으로 몰린다(작은 이미지에서는 상자가
 * 1px로 붕괴하고, 큰 이미지에서는 stretch 선이 좌상단에 붙는다). 비율로 계산해
 * 어떤 크기의 이미지에서도 가운데에서 시작하도록 한다.
 */
export function centeredBubbleGeometry(width: number, height: number): BubbleGeometry {
  return normalizeBubbleGeometry(
    {
      stretch: { x: Math.round(width / 2), y: Math.round(height / 2) },
      contentInsets: {
        top: Math.round(height * centeredContentInsetRatio),
        right: Math.round(width * centeredContentInsetRatio),
        bottom: Math.round(height * centeredContentInsetRatio),
        left: Math.round(width * centeredContentInsetRatio),
      },
    },
    width,
    height,
  );
}

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

/**
 * 나인패치 marker를 수평 반전한다.
 *
 * 저장된 geometry가 없어 legacy marker나 source asset의 marker를 그대로 쓰는 슬롯에 필요하다.
 * 아트워크만 뒤집고 marker를 두면 늘어나는 구간과 글자 영역이 반대편에 남는다.
 *
 * `top`(가로 stretch)과 `bottom`(가로 콘텐츠)만 뒤집는다. `left`/`right`는 세로 값이라 그대로 둔다.
 * marker 좌표는 1px marker border를 포함한 1-based 값이므로 내부 좌표로 내렸다가 되돌린다.
 *
 * 구간 전체를 반사하므로, 같은 값을 `flipBubbleGeometryHorizontally` → `bubbleGeometryToAndroidMarkers`
 * 순으로 통과시킨 결과와 2px stretch 패치에서 1px 어긋날 수 있다. 그쪽은 구간이 아니라 stretch
 * **점**을 `(width-1)-x`로 반사하기 때문이다. 저장 geometry가 있으면 그 경로가 우선하므로 두 값이
 * 한 슬롯에서 동시에 쓰이지는 않는다.
 */
export function flipAndroidMarkersHorizontally(markers: Markers, innerWidth: number): Markers {
  const width = Math.max(1, Math.round(innerWidth));
  const flipRange = (range: { start: number; end: number }) => ({
    start: width - Math.round(range.end) + 2,
    end: width - Math.round(range.start) + 2,
  });

  return {
    ...markers,
    top: flipRange(markers.top),
    bottom: flipRange(markers.bottom),
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
