import { describe, expect, it } from "vitest";
import {
  androidMarkersToBubbleGeometry,
  androidStretchSpan,
  bubbleGeometryToAndroidMarkers,
  bubbleGeometryToLegacyEdit,
  flipBubbleGeometryHorizontally,
  parseBubbleGeometry,
  parseBubbleGeometryMap,
} from "@/lib/theme/bubbleGeometry";

describe("platform-neutral bubble geometry", () => {
  const geometry = {
    stretch: { x: 30, y: 20 },
    contentInsets: { top: 8, right: 12, bottom: 10, left: 14 },
  };

  it("writes Android marker-border offsets with a safe 2px stretch patch", () => {
    const markers = bubbleGeometryToAndroidMarkers(geometry, 80, 50);

    expect(markers.top).toEqual({ start: 31, end: 33 });
    expect(markers.left).toEqual({ start: 21, end: 23 });
    expect(markers.bottom).toEqual({ start: 15, end: 69 });
    expect(markers.right).toEqual({ start: 9, end: 41 });
    expect(markers.top.end - markers.top.start).toBe(androidStretchSpan);
  });

  it("round-trips geometry through Android markers without off-by-one drift", () => {
    const markers = bubbleGeometryToAndroidMarkers(geometry, 80, 50);
    expect(androidMarkersToBubbleGeometry(markers, 80, 50)).toEqual(geometry);
  });

  it("converts a legacy wide Android patch to one representative stretch point", () => {
    expect(androidMarkersToBubbleGeometry({
      top: { start: 21, end: 30 },
      left: { start: 11, end: 16 },
      bottom: { start: 8, end: 71 },
      right: { start: 7, end: 42 },
    }, 80, 50)).toEqual({
      stretch: { x: 24, y: 12 },
      contentInsets: { top: 6, right: 10, bottom: 9, left: 7 },
    });
  });

  it("keeps canonical and legacy values synchronized for persistence", () => {
    expect(bubbleGeometryToLegacyEdit(geometry, 80, 50)).toEqual({
      geometry,
      markers: {
        top: { start: 31, end: 33 },
        left: { start: 21, end: 23 },
        bottom: { start: 15, end: 69 },
        right: { start: 9, end: 41 },
      },
      insets: geometry.contentInsets,
      stretch: geometry.stretch,
    });
  });

  it("flips the shared stretch and text region together", () => {
    expect(flipBubbleGeometryHorizontally(geometry, 80)).toEqual({
      stretch: { x: 49, y: 20 },
      contentInsets: { top: 8, right: 14, bottom: 10, left: 12 },
    });
  });

  it("drops malformed persisted geometry without rejecting valid siblings", () => {
    expect(parseBubbleGeometry({ stretch: { x: 2, y: 3 }, contentInsets: { top: 1, right: 2, bottom: 3, left: 4 } })).toEqual({
      stretch: { x: 2, y: 3 },
      contentInsets: { top: 1, right: 2, bottom: 3, left: 4 },
    });
    expect(parseBubbleGeometryMap({
      valid: { stretch: { x: 2, y: 3 }, contentInsets: { top: 1, right: 2, bottom: 3, left: 4 } },
      invalid: { stretch: { x: -1, y: 3 }, contentInsets: {} },
    })).toEqual({
      valid: { stretch: { x: 2, y: 3 }, contentInsets: { top: 1, right: 2, bottom: 3, left: 4 } },
    });
  });
});
