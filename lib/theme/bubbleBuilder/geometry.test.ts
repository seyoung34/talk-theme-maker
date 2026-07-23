import { describe, expect, it } from "vitest";
import { getAndroidBubbleMarkers, getBubbleRadiusMax, getBubbleVariantGeometry, getIosBubbleGeometry } from "@/lib/theme/bubbleBuilder/geometry";
import type { BubbleSideDesignSpec } from "@/lib/theme/bubbleBuilder/types";

const baseDesign: BubbleSideDesignSpec = {
  side: "me",
  preset: "rounded",
  radius: 24,
  fill: "#FFE27A",
  borderColor: "#334155",
  borderWidth: 3,
  shadow: "none",
  textColor: "#111111",
  syncTextColorOnApply: false,
};

describe("bubble builder geometry", () => {
  it("keeps first and group geometry independent", () => {
    const first = getBubbleVariantGeometry(baseDesign, "first");
    const group = getBubbleVariantGeometry(baseDesign, "group");

    expect(first.canvas).toEqual({ width: 210, height: 190 });
    expect(group.canvas).toEqual({ width: 210, height: 150 });
    expect(first.body.height).toBe(150);
    expect(group.body.height).toBe(110);
    expect(first.content.height).toBeGreaterThan(group.content.height);
  });

  it("allows a true capsule radius instead of applying a flat-band clamp", () => {
    const design = { ...baseDesign, preset: "capsule" as const, radius: 999 };
    const geometry = getBubbleVariantGeometry(design, "first");

    expect(getBubbleRadiusMax("capsule", "first")).toBe(75);
    expect(geometry.radius).toBe(75);
    expect(geometry.stretch).toEqual({ x: 105, y: 95 });
  });

  it("makes the circle body square and preserves a text-safe rect", () => {
    const geometry = getBubbleVariantGeometry({ ...baseDesign, preset: "circle", radius: 999 }, "first");

    expect(geometry.body.width).toBe(geometry.body.height);
    expect(geometry.radius).toBe(geometry.body.width / 2);
    expect(geometry.content.width).toBeGreaterThanOrEqual(24);
    expect(geometry.content.height).toBeGreaterThanOrEqual(24);
  });

  it("stores iOS geometry in source pixels", () => {
    const geometry = getBubbleVariantGeometry(baseDesign, "first");
    const ios = getIosBubbleGeometry(geometry);

    expect(ios.stretch).toEqual(geometry.stretch);
    expect(ios.insets.left + geometry.content.width + ios.insets.right).toBe(geometry.canvas.width);
    expect(ios.insets.top + geometry.content.height + ios.insets.bottom).toBe(geometry.canvas.height);
  });

  it("adds the Android marker-border offset", () => {
    const geometry = getBubbleVariantGeometry(baseDesign, "first");
    const markers = getAndroidBubbleMarkers(geometry);

    expect(markers.top).toEqual({ start: geometry.stretch.x + 1, end: geometry.stretch.x + 2 });
    expect(markers.left).toEqual({ start: geometry.stretch.y + 1, end: geometry.stretch.y + 2 });
    expect(markers.bottom.end).toBeLessThanOrEqual(geometry.canvas.width + 1);
    expect(markers.right.end).toBeLessThanOrEqual(geometry.canvas.height + 1);
  });
});
