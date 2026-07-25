import type { Insets, Markers, StretchPoint } from "@/lib/theme/types";

export function flipBubbleMarkersHorizontally(markers: Markers, width: number): Markers {
  return {
    ...markers,
    top: flipRangeHorizontally(markers.top, width),
    bottom: flipRangeHorizontally(markers.bottom, width),
  };
}

export function flipBubbleInsetsHorizontally(insets: Insets): Insets {
  return { ...insets, left: insets.right, right: insets.left };
}

export function flipBubbleStretchHorizontally(stretch: StretchPoint, width: number): StretchPoint {
  return { ...stretch, x: Math.max(0, Math.round(width) - 1) - stretch.x };
}

function flipRangeHorizontally(range: Markers["top"], width: number) {
  const canvasWidth = Math.max(0, Math.round(width));
  return { start: canvasWidth - range.end, end: canvasWidth - range.start };
}
