import { describe, expect, it } from "vitest";
import { createBubbleDecorationLayer, createBubbleFamilyDesignSpec, getAndroidBubbleMarkers, getBubbleDecorationLayers, getBubbleRadiusMax, getBubbleVariantGeometry, getIosBubbleGeometry } from "@/lib/theme/bubbleBuilder/geometry";
import type { BubbleSideDesignSpec } from "@/lib/theme/bubbleBuilder/types";

const baseDesign: BubbleSideDesignSpec = {
  side: "me",
  preset: "rounded",
  radius: 24,
  fill: "#FFE27A",
  borderColor: "#334155",
  borderWidth: 3,
  textColor: "#111111",
  syncTextColorOnApply: false,
};

describe("bubble builder geometry", () => {
  it("starts with no decoration and places new layers centered above the body", () => {
    expect(createBubbleFamilyDesignSpec("me").design.decorations).toEqual([]);
    expect(createBubbleDecorationLayer("layer-1", "cat.png")).toMatchObject({
      id: "layer-1",
      sourceName: "cat.png",
      offsetX: 0,
      offsetY: -64,
      scale: 1.6,
      flipX: false,
    });
  });

  it("reads legacy single-decoration recipes as one layer keyed by familyId", () => {
    const legacy = {
      ...createBubbleFamilyDesignSpec("me"),
      familyId: "family-1",
      decorationSourceName: "old.png",
      design: { ...baseDesign, decorations: undefined, decoration: { offsetX: 12, offsetY: -20, scale: 1.2, flipX: true } },
    };

    expect(getBubbleDecorationLayers(legacy)).toEqual([
      { id: "family-1", sourceName: "old.png", offsetX: 12, offsetY: -20, scale: 1.2, flipX: true },
    ]);
  });

  it("keeps first and group geometry independent", () => {
    const first = getBubbleVariantGeometry(baseDesign, "first");
    const group = getBubbleVariantGeometry(baseDesign, "group");

    expect(first.canvas).toEqual({ width: 250, height: 230 });
    expect(group.canvas).toEqual({ width: 250, height: 190 });
    expect(first.body.height).toBe(80);
    expect(group.body.height).toBe(60);
    expect(first.content.height).toBeGreaterThan(group.content.height);
  });

  it("allows a true capsule radius instead of applying a flat-band clamp", () => {
    const design = { ...baseDesign, preset: "capsule" as const, radius: 999 };
    const geometry = getBubbleVariantGeometry(design, "first");

    expect(getBubbleRadiusMax("capsule", "first")).toBe(40);
    expect(geometry.radius).toBe(40);
    expect(geometry.stretch).toEqual({ x: 125, y: 115 });
  });

  it("shifts the body within the canvas by bodyOffset and clamps to bounds", () => {
    const moved = getBubbleVariantGeometry({ ...baseDesign, bodyOffsetX: 20, bodyOffsetY: -10 }, "first");
    expect(moved.body.x).toBe(98);
    expect(moved.body.y).toBe(65);

    const clamped = getBubbleVariantGeometry({ ...baseDesign, bodyOffsetX: 9999, bodyOffsetY: -9999 }, "first");
    expect(clamped.body.x).toBe(250 - 95);
    expect(clamped.body.y).toBe(0);
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
