import { describe, expect, it } from "vitest";
import { getBubbleEditorFitScale } from "@/components/editor/MobileBubbleEditor";

describe("MobileBubbleEditor fit scale", () => {
  it("fits a small artwork into the measured desktop stage", () => {
    expect(getBubbleEditorFitScale(501, 371, 121, 87)).toBeCloseTo((371 - 64) / 87);
  });

  it("does not calculate a scale before the stage has been measured", () => {
    expect(getBubbleEditorFitScale(0, 0, 121, 87)).toBe(1);
  });

  it("shrinks artwork that is larger than the available stage", () => {
    expect(getBubbleEditorFitScale(300, 300, 1200, 600)).toBeCloseTo((300 - 64) / 1200);
  });
});
