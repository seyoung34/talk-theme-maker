import type { Insets, Markers } from "@/lib/theme/types";
import type { BubbleBuilderSide, BubbleBuilderVariant, BubbleFamilyDesignSpec, BubbleRect, BubbleShapePreset, BubbleSideDesignSpec, BubbleVariantGeometry } from "@/lib/theme/bubbleBuilder/types";

const variantPresets: Record<BubbleBuilderVariant, { width: number; height: number; bodyWidth: number; bodyHeight: number }> = {
  first: { width: 210, height: 190, bodyWidth: 170, bodyHeight: 150 },
  group: { width: 210, height: 150, bodyWidth: 170, bodyHeight: 110 },
};

export const bubbleBuilderPresetVersion = "bubble-builder-v1" as const;

export function createBubbleFamilyDesignSpec(side: BubbleBuilderSide, textColor = "#111827"): BubbleFamilyDesignSpec {
  const now = Date.now();
  return {
    version: 1,
    familyId: crypto.randomUUID(),
    presetVersion: bubbleBuilderPresetVersion,
    side,
    design: {
      side,
      preset: "rounded",
      radius: 28,
      fill: side === "me" ? "#FEE500" : "#FFFFFF",
      borderColor: "#D1D5DB",
      borderWidth: 0,
      shadow: "none",
      textColor,
      syncTextColorOnApply: false,
      decoration: { offsetX: side === "me" ? 90 : -90, offsetY: -55, scale: 1, flipX: side === "you" },
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function getBubbleRadiusMax(preset: BubbleShapePreset, variant: BubbleBuilderVariant) {
  const source = variantPresets[variant];
  const bodyWidth = preset === "circle" ? Math.min(source.bodyWidth, source.bodyHeight) : source.bodyWidth;
  return Math.floor(Math.min(bodyWidth, source.bodyHeight) / 2);
}

export function getBubbleVariantGeometry(design: BubbleSideDesignSpec, variant: BubbleBuilderVariant): BubbleVariantGeometry {
  const source = variantPresets[variant];
  const bodyWidth = design.preset === "circle" ? Math.min(source.bodyWidth, source.bodyHeight) : source.bodyWidth;
  const bodyHeight = design.preset === "circle" ? bodyWidth : source.bodyHeight;
  const body: BubbleRect = {
    x: Math.round((source.width - bodyWidth) / 2),
    y: Math.round((source.height - bodyHeight) / 2),
    width: bodyWidth,
    height: bodyHeight,
  };
  const radius = normalizeRadius(design.preset, design.radius, body.width, body.height);
  const horizontalPadding = Math.ceil(design.borderWidth + 10 + radius * 0.29);
  const verticalPadding = Math.ceil(design.borderWidth + 8 + radius * 0.29);
  const capsulePadding = design.preset === "capsule" || design.preset === "circle" ? Math.ceil(body.height * 0.35) : 0;
  const leftRight = Math.max(horizontalPadding, capsulePadding);
  const content = insetRect(body, leftRight, verticalPadding);

  return {
    canvas: { width: source.width, height: source.height },
    body,
    content,
    stretch: {
      x: Math.floor(body.x + body.width / 2),
      y: Math.floor(body.y + body.height / 2),
    },
    radius,
  };
}

export function getIosBubbleGeometry(geometry: BubbleVariantGeometry): { insets: Insets; stretch: BubbleVariantGeometry["stretch"] } {
  return {
    insets: {
      top: geometry.content.y,
      right: geometry.canvas.width - geometry.content.x - geometry.content.width,
      bottom: geometry.canvas.height - geometry.content.y - geometry.content.height,
      left: geometry.content.x,
    },
    stretch: geometry.stretch,
  };
}

export function getAndroidBubbleMarkers(geometry: BubbleVariantGeometry): Markers {
  const markerX = geometry.stretch.x + 1;
  const markerY = geometry.stretch.y + 1;
  return {
    top: { start: markerX, end: markerX + 1 },
    left: { start: markerY, end: markerY + 1 },
    right: { start: geometry.content.y + 1, end: geometry.content.y + geometry.content.height + 1 },
    bottom: { start: geometry.content.x + 1, end: geometry.content.x + geometry.content.width + 1 },
  };
}

export function rectsOverlap(a: BubbleRect, b: BubbleRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function normalizeRadius(preset: BubbleShapePreset, radius: number, width: number, height: number) {
  const max = Math.min(width, height) / 2;
  if (preset === "square") return 0;
  if (preset === "capsule" || preset === "circle") return max;
  return clamp(Math.round(radius), 0, max);
}

function insetRect(rect: BubbleRect, horizontal: number, vertical: number): BubbleRect {
  const safeHorizontal = Math.min(horizontal, Math.max(0, Math.floor((rect.width - 24) / 2)));
  const safeVertical = Math.min(vertical, Math.max(0, Math.floor((rect.height - 24) / 2)));
  return {
    x: rect.x + safeHorizontal,
    y: rect.y + safeVertical,
    width: Math.max(24, rect.width - safeHorizontal * 2),
    height: Math.max(24, rect.height - safeVertical * 2),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
