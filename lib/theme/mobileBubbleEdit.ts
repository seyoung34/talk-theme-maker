import type { ImageEditState } from "@/lib/theme/imageEdit";
import type { Insets, Markers, StretchPoint } from "@/lib/theme/types";

export type MobileBubbleEditDraft = {
  imageState: ImageEditState;
  markers: Markers;
  insets: Insets;
  stretch: StretchPoint;
};

export function isMobileBubbleEditDirty(draft: MobileBubbleEditDraft | null, initial: MobileBubbleEditDraft | null) {
  return Boolean(draft && initial && JSON.stringify(draft) !== JSON.stringify(initial));
}

export function normalizeBubbleMarkers(markers: Markers, width: number, height: number): Markers {
  return {
    top: normalizeRange(markers.top, width),
    bottom: normalizeRange(markers.bottom, width),
    left: normalizeRange(markers.left, height),
    right: normalizeRange(markers.right, height),
  };
}

export function normalizeBubbleInsets(insets: Insets, width: number, height: number): Insets {
  const left = clamp(Math.round(insets.left), 0, Math.max(0, width - 1));
  const right = clamp(Math.round(insets.right), 0, Math.max(0, width - left - 1));
  const top = clamp(Math.round(insets.top), 0, Math.max(0, height - 1));
  const bottom = clamp(Math.round(insets.bottom), 0, Math.max(0, height - top - 1));
  return { left, right, top, bottom };
}

export function clampBubbleStretchPoint(stretch: StretchPoint, width: number, height: number): StretchPoint {
  return { x: clamp(Math.round(stretch.x), 0, Math.max(0, width - 1)), y: clamp(Math.round(stretch.y), 0, Math.max(0, height - 1)) };
}

function normalizeRange(range: { start: number; end: number }, max: number) {
  const start = clamp(Math.round(range.start), 1, Math.max(1, max - 2));
  const end = clamp(Math.round(range.end), start + 1, Math.max(start + 1, max - 1));
  return { start, end };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
