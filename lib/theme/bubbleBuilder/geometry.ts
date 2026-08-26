import type { Insets, Markers, StretchPoint } from "@/lib/theme/types";
import { bubbleGeometryToAndroidMarkers } from "@/lib/theme/bubbleGeometry";
import type { BubbleBuilderSide, BubbleBuilderVariant, BubbleDecorationLayer, BubbleDecorationTransform, BubbleFamilyDesignSpec, BubbleRect, BubbleShapePreset, BubbleSideDesignSpec, BubbleVariantGeometry } from "@/lib/theme/bubbleBuilder/types";

const variantPresets: Record<BubbleBuilderVariant, { width: number; height: number; bodyWidth: number; bodyHeight: number }> = {
  first: { width: 250, height: 230, bodyWidth: 95, bodyHeight: 80 },
  group: { width: 250, height: 190, bodyWidth: 95, bodyHeight: 60 },
};

export const bubbleBuilderPresetVersion = "bubble-builder-v1" as const;

// 장식 이미지의 기본 표시 크기(논리 px). preview와 render가 공유해 미리보기와 실제 결과가 일치한다.
export const bubbleDecorationBaseSize = 96;
// 장식 크기 배율 상한. 캐릭터를 말풍선 본체보다 크게 얹을 수 있어야 한다.
export const bubbleDecorationMaxScale = 4;

export type BubbleDecorationSourceSize = { width: number; height: number };

/**
 * 장식이 실제로 그려지는 크기.
 *
 * 원본이 정사각형이 아니면 짧은 쪽에 투명 여백이 남는다. 미리보기가 이 값 대신
 * `bubbleDecorationBaseSize` 정사각형을 쓰던 동안에는 세 가지가 어긋나 있었다 —
 * 넓적한 그림의 클릭 영역이 그림 위아래의 빈 자리까지 먹었고(말풍선 본체를 잡을 수 없었다),
 * 96px보다 작은 원본은 미리보기에서만 확대돼 보였으며, 겹침·늘어남 판정이 결과물과 달랐다.
 * 원본 크기를 모르는 호출부(아직 이미지를 못 읽은 첫 프레임)는 예전 정사각형 근사로 떨어진다.
 */
export function getBubbleDecorationSize(layer: Pick<BubbleDecorationTransform, "scale">, source?: BubbleDecorationSourceSize) {
  const scale = clamp(layer.scale, 0.1, bubbleDecorationMaxScale);
  if (!source || source.width <= 0 || source.height <= 0) {
    const size = bubbleDecorationBaseSize * scale;
    return { width: size, height: size };
  }
  const baseScale = Math.min(1, bubbleDecorationBaseSize / Math.max(source.width, source.height));
  return {
    width: Math.max(1, source.width * baseScale * scale),
    height: Math.max(1, source.height * baseScale * scale),
  };
}

/** 캔버스 좌표에서 장식이 차지하는 사각형. 회전은 빼고 본다(렌더도 회전 전 사각형을 돌려준다). */
export function getBubbleDecorationRect(
  layer: Pick<BubbleDecorationTransform, "scale" | "offsetX" | "offsetY">,
  canvas: { width: number; height: number },
  source?: BubbleDecorationSourceSize,
): BubbleRect {
  const { width, height } = getBubbleDecorationSize(layer, source);
  return {
    x: canvas.width / 2 + layer.offsetX - width / 2,
    y: canvas.height / 2 + layer.offsetY - height / 2,
    width,
    height,
  };
}

/**
 * 크기 조절 손잡이의 기준 거리 — 배율 1일 때 중심에서 모서리까지.
 *
 * 손잡이는 중심에서 포인터까지의 거리를 배율로 되돌린다. 원본 비율을 쓰기 전에는 정사각형을
 * 가정한 `baseSize * SQRT1_2`가 그 거리였는데, 넓적한 그림에서는 모서리가 그보다 멀어 손잡이를
 * 잡는 순간 크기가 튀었다.
 */
export function getBubbleDecorationHandleRadius(source?: BubbleDecorationSourceSize) {
  if (!source || source.width <= 0 || source.height <= 0) return bubbleDecorationBaseSize * Math.SQRT1_2;
  const baseScale = Math.min(1, bubbleDecorationBaseSize / Math.max(source.width, source.height));
  return Math.hypot(source.width * baseScale, source.height * baseScale) / 2;
}

/**
 * 본체 크기 배율의 허용 범위.
 *
 * 본체는 9-slice의 **늘어나지 않는 코너**를 만든다. 키우면 코너가 두꺼워져 짧은 메시지에서
 * 말풍선이 커지고, 줄이면 얇아진다. 하한을 0.7로 둔 것은 그 아래에서 `content`가 최소 24px
 * 보장선에 눌려 테두리·둥글기 조절이 화면에 반영되지 않기 때문이다.
 */
export const bubbleBodyScaleRange = { min: 0.7, max: 1.4 } as const;

/**
 * 캔버스(프레임) 크기의 허용 범위. 단위는 배율이 아니라 픽셀이다.
 *
 * 캔버스는 그대로 내보내는 PNG의 크기다. 본체 바깥 여백은 장식이 삐져나올 자리이며,
 * 투명 여백이라 실제 화면에서는 말풍선 주변의 빈 공간이 된다. 그래서 크게 벌릴수록
 * 말풍선이 차지하는 최소 면적도 함께 커진다 — 상한을 묶어 둔 이유다.
 *
 * 배율이 아니라 픽셀인 것은 화면 표시가 이미 픽셀(`프레임 250 × 230`)이기 때문이다.
 * 배율로 두면 같은 1.2가 variant마다 다른 픽셀을 내서 "최대 300"이 슬롯마다 다른 뜻이 된다.
 */
export const bubbleCanvasSizeRange = { min: 150, max: 300 } as const;

type CanvasSizeSource = Pick<BubbleSideDesignSpec, "canvasWidth" | "canvasHeight" | "canvasScale" | "canvasScaleX" | "canvasScaleY">;

/**
 * 프레임 픽셀 크기.
 *
 * 배율로 저장하던 옛 spec은 그 variant의 기본 치수에 곱해 픽셀로 읽는다. 옛 상한(1.4배)이
 * 새 상한을 넘는 경우가 있어 마지막에 범위로 누른다 — 이미 만들어 둔 테마의 프레임이 최대
 * 300px로 줄어들 수 있고, 그건 상한을 낮춘 결과다.
 */
export function getBubbleCanvasSize(design: CanvasSizeSource, variant: BubbleBuilderVariant) {
  const source = variantPresets[variant];
  const legacyX = design.canvasScaleX ?? design.canvasScale;
  const legacyY = design.canvasScaleY ?? design.canvasScale;
  return {
    width: clamp(Math.round(design.canvasWidth ?? source.width * (legacyX ?? 1)), bubbleCanvasSizeRange.min, bubbleCanvasSizeRange.max),
    height: clamp(Math.round(design.canvasHeight ?? source.height * (legacyY ?? 1)), bubbleCanvasSizeRange.min, bubbleCanvasSizeRange.max),
  };
}

/**
 * 캔버스·본체 치수. 둥글기 상한과 실제 배치가 같은 숫자를 보게 하려고 한곳에서 만든다.
 */
function getVariantMetrics(design: Pick<BubbleSideDesignSpec, "preset" | "bodyScale"> & CanvasSizeSource, variant: BubbleBuilderVariant) {
  const source = variantPresets[variant];
  const bodyScale = clamp(design.bodyScale ?? 1, bubbleBodyScaleRange.min, bubbleBodyScaleRange.max);
  const { width: canvasWidth, height: canvasHeight } = getBubbleCanvasSize(design, variant);
  // 본체가 캔버스를 넘으면 위치 clamp가 음수 범위를 받아 배치가 무너진다. 치수 단계에서 먼저 막는다.
  const scaledWidth = Math.min(Math.round(source.bodyWidth * bodyScale), canvasWidth);
  const scaledHeight = Math.min(Math.round(source.bodyHeight * bodyScale), canvasHeight);
  const bodyWidth = design.preset === "circle" ? Math.min(scaledWidth, scaledHeight) : scaledWidth;
  const bodyHeight = design.preset === "circle" ? bodyWidth : scaledHeight;
  return { canvasWidth, canvasHeight, bodyWidth, bodyHeight };
}

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
      // 시작값은 무채색으로 둔다. 채도가 있는 기본색은 사용자가 올린 장식과 충돌하고,
      // "내가 고른 색"과 헷갈린다. 기본 템플릿과 같은 계단을 쓴다.
      fill: "#FFFFFF",
      borderColor: "#C9CCD1",
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

export function getBubbleRadiusMax(preset: BubbleShapePreset, variant: BubbleBuilderVariant, bodyScale?: number) {
  const { bodyWidth, bodyHeight } = getVariantMetrics({ preset, bodyScale }, variant);
  return Math.floor(Math.min(bodyWidth, bodyHeight) / 2);
}

export function getBubbleVariantGeometry(design: BubbleSideDesignSpec, variant: BubbleBuilderVariant): BubbleVariantGeometry {
  const { canvasWidth, canvasHeight, bodyWidth, bodyHeight } = getVariantMetrics(design, variant);
  const body: BubbleRect = {
    x: clamp(Math.round((canvasWidth - bodyWidth) / 2) + Math.round(design.bodyOffsetX ?? 0), 0, canvasWidth - bodyWidth),
    y: clamp(Math.round((canvasHeight - bodyHeight) / 2) + Math.round(design.bodyOffsetY ?? 0), 0, canvasHeight - bodyHeight),
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
    canvas: { width: canvasWidth, height: canvasHeight },
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

/**
 * 사각형이 늘어나는 지점을 가로지르는가.
 *
 * 9-slice는 `stretch` 지점의 픽셀 열·행을 이미지 전체에 걸쳐 반복한다. 그 지점의 양쪽에 걸친
 * 그림은 긴 메시지에서 그 자리가 벌어지며 늘어난다 — 말풍선 본체는 그러라고 만든 것이지만
 * 캐릭터 같은 장식은 뭉개진다. 한쪽에만 있으면 통째로 밀릴 뿐 모양은 그대로다.
 */
export function crossesBubbleStretch(rect: BubbleRect, stretch: StretchPoint) {
  const crossesX = rect.x < stretch.x && rect.x + rect.width > stretch.x;
  const crossesY = rect.y < stretch.y && rect.y + rect.height > stretch.y;
  return crossesX || crossesY;
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
