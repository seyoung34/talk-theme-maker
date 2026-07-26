import { describe, expect, it } from "vitest";
import { clampBubbleStretchPoint, isMobileBubbleEditDirty, normalizeBubbleInsets, normalizeBubbleMarkers } from "@/lib/theme/mobileBubbleEdit";
import { defaultImageEditState } from "@/lib/theme/imageEdit";

describe("mobile bubble edit state", () => {
  it("keeps marker ranges ordered and within the image bounds", () => {
    expect(normalizeBubbleMarkers({ top: { start: 20, end: -3 }, bottom: { start: 0, end: 99 }, left: { start: 4, end: 4 }, right: { start: 20, end: 1 } }, 18, 12)).toEqual({
      top: { start: 16, end: 17 }, bottom: { start: 1, end: 17 }, left: { start: 4, end: 5 }, right: { start: 10, end: 11 },
    });
  });

  it("keeps iOS insets and stretch points valid", () => {
    expect(normalizeBubbleInsets({ left: 9, right: 8, top: -2, bottom: 20 }, 10, 12)).toEqual({ left: 9, right: 0, top: 0, bottom: 11 });
    expect(clampBubbleStretchPoint({ x: -4, y: 50 }, 10, 12)).toEqual({ x: 0, y: 11 });
  });

  it("detects changes across image and platform geometry values", () => {
    const initial = { imageState: defaultImageEditState, geometry: { contentInsets: { top: 1, right: 1, bottom: 1, left: 1 }, stretch: { x: 2, y: 2 } } };
    expect(isMobileBubbleEditDirty(initial, initial)).toBe(false);
    expect(isMobileBubbleEditDirty({ ...initial, imageState: { ...initial.imageState, scale: 1.2 } }, initial)).toBe(true);
  });
});
