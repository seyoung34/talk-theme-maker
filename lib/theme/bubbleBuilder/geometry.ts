import type { Insets, Markers } from "@/lib/theme/types";
import { bubbleGeometryToAndroidMarkers } from "@/lib/theme/bubbleGeometry";
import type { BubbleBuilderSide, BubbleBuilderVariant, BubbleDecorationLayer, BubbleFamilyDesignSpec, BubbleRect, BubbleShapePreset, BubbleSideDesignSpec, BubbleVariantGeometry } from "@/lib/theme/bubbleBuilder/types";

const variantPresets: Record<BubbleBuilderVariant, { width: number; height: number; bodyWidth: number; bodyHeight: number }> = {
  first: { width: 250, height: 230, bodyWidth: 95, bodyHeight: 80 },
  group: { width: 250, height: 190, bodyWidth: 95, bodyHeight: 60 },
};

export const bubbleBuilderPresetVersion = "bubble-builder-v1" as const;

// 장식 이미지의 기본 표시 크기(논리 px). preview와 render가 공유해 미리보기와 실제 결과가 일치한다.
export const bubbleDecorationBaseSize = 96;
// 장식 크기 배율 상한. 캐릭터를 말풍선 본체보다 크게 얹을 수 있어야 한다.
export const bubbleDecorationMaxScale = 4;

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
      borderWidth: 4,
      textColor,
      syncTextColorOnApply: false,
      decorations: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createBubbleDecorationLayer(id: string, sourceName?: string): BubbleDecorationLayer {
  return { id, sourceName, offsetX: 0, offsetY: -64, scale: 1.6, flipX: false, rotation: 0 };
}

/**
 * 장식 레이어 목록을 읽는다.
 * 단일 장식만 저장하던 이전 recipe는 familyId를 레이어 id로 승격해 원본 파일 key와 호환시킨다.
 */
export function getBubbleDecorationLayers(spec: BubbleFamilyDesignSpec): BubbleDecorationLayer[] {
  if (spec.design.decorations) return spec.design.decorations;
  if (spec.design.decoration) return [{ ...spec.design.decoration, id: spec.familyId, sourceName: spec.decorationSourceName }];
  return [];
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
    x: clamp(Math.round((source.width - bodyWidth) / 2) + Math.round(design.bodyOffsetX ?? 0), 0, source.width - bodyWidth),
    y: clamp(Math.round((source.height - bodyHeight) / 2) + Math.round(design.bodyOffsetY ?? 0), 0, source.height - bodyHeight),
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
  const ios = getIosBubbleGeometry(geometry);
  return bubbleGeometryToAndroidMarkers({
    stretch: ios.stretch,
    contentInsets: ios.insets,
  }, geometry.canvas.width, geometry.canvas.height);
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
