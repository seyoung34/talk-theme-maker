import { describe, expect, it } from "vitest";
import { flipBubbleInsetsHorizontally, flipBubbleMarkersHorizontally, flipBubbleStretchHorizontally } from "@/lib/theme/bubbleEditTransforms";

describe("bubble edit horizontal transforms", () => {
  it("flips horizontal marker ranges while preserving vertical ranges", () => {
    const markers = {
      top: { start: 3, end: 14 },
      left: { start: 5, end: 18 },
      right: { start: 6, end: 19 },
      bottom: { start: 8, end: 16 },
    };

    expect(flipBubbleMarkersHorizontally(markers, 20)).toEqual({
      top: { start: 6, end: 17 },
      left: { start: 5, end: 18 },
      right: { start: 6, end: 19 },
      bottom: { start: 4, end: 12 },
    });
    expect(flipBubbleMarkersHorizontally(flipBubbleMarkersHorizontally(markers, 20), 20)).toEqual(markers);
  });

  it("swaps horizontal insets and mirrors the stretch x coordinate", () => {
    expect(flipBubbleInsetsHorizontally({ top: 2, right: 7, bottom: 3, left: 11 })).toEqual({ top: 2, right: 11, bottom: 3, left: 7 });
    expect(flipBubbleStretchHorizontally({ x: 4, y: 9 }, 20)).toEqual({ x: 15, y: 9 });
    expect(flipBubbleStretchHorizontally(flipBubbleStretchHorizontally({ x: 4, y: 9 }, 20), 20)).toEqual({ x: 4, y: 9 });
  });
});
