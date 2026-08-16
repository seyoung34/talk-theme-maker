import type { Insets, Markers, StretchPoint } from "@/lib/theme/types";
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

/**
 * 본체 크기 배율의 허용 범위.
 *
 * 본체는 9-slice의 **늘어나지 않는 코너**를 만든다. 키우면 코너가 두꺼워져 짧은 메시지에서
 * 말풍선이 커지고, 줄이면 얇아진다. 하한을 0.7로 둔 것은 그 아래에서 `content`가 최소 24px
 * 보장선에 눌려 테두리·둥글기 조절이 화면에 반영되지 않기 때문이다.
 */
export const bubbleBodyScaleRange = { min: 0.7, max: 1.4 } as const;

/**
 * 본체 크기의 선택지.
 *
 * 연속 슬라이더를 쓰지 않는다. 이 값이 정하는 것은 화면에 보이는 말풍선 크기가 아니라 9-slice의
 * **코너 두께**라, 실제 말풍선 크기는 글자 수가 정한다. 눈으로 맞추는 값이 아닌데 1% 단위를 열어
 * 두면 "지금 말풍선 크기를 맞추고 있다"는 오해만 커진다. 세 단계면 필요한 차이는 다 낸다.
 */
export const bubbleBodyScalePresets = [
  { id: "small", label: "작게", value: 0.8 },
  { id: "normal", label: "기본", value: 1 },
  { id: "large", label: "크게", value: 1.25 },
] as const;

export type BubbleBodyScalePresetId = (typeof bubbleBodyScalePresets)[number]["id"];

/**
 * 저장된 배율에 가장 가까운 선택지. 옛 spec에는 슬라이더로 고른 임의의 값이 들어 있을 수 있어서,
 * 그대로 못 읽으면 세그먼트가 아무것도 선택되지 않은 상태로 보인다.
 */
export function getBubbleBodyScalePreset(bodyScale: number | undefined): BubbleBodyScalePresetId {
  const value = clamp(bodyScale ?? 1, bubbleBodyScaleRange.min, bubbleBodyScaleRange.max);
  return bubbleBodyScalePresets.reduce((nearest, preset) => (
    Math.abs(preset.value - value) < Math.abs(nearest.value - value) ? preset : nearest
  )).id;
}

/**
 * 캔버스 크기 배율의 허용 범위. 가로·세로에 같은 범위를 쓴다.
 *
 * 캔버스는 그대로 내보내는 PNG의 크기다. 본체 바깥 여백은 장식이 삐져나올 자리이며,
 * 투명 여백이라 실제 화면에서는 말풍선 주변의 빈 공간이 된다. 그래서 크게 벌릴수록
 * 말풍선이 차지하는 최소 면적도 함께 커진다 — 상한을 1.4로 묶어 둔 이유다.
 */
export const bubbleCanvasScaleRange = { min: 0.8, max: 1.4 } as const;

type CanvasScaleSource = Pick<BubbleSideDesignSpec, "canvasScale" | "canvasScaleX" | "canvasScaleY">;

/**
 * 축별 캔버스 배율. 가로·세로를 함께 늘리던 옛 `canvasScale`은 두 축의 기본값으로 읽는다.
 */
export function getBubbleCanvasScale(design: CanvasScaleSource) {
  const legacy = design.canvasScale;
  return {
    x: clamp(design.canvasScaleX ?? legacy ?? 1, bubbleCanvasScaleRange.min, bubbleCanvasScaleRange.max),
    y: clamp(design.canvasScaleY ?? legacy ?? 1, bubbleCanvasScaleRange.min, bubbleCanvasScaleRange.max),
  };
}

/**
 * 배율을 적용한 캔버스·본체 치수. 둥글기 상한과 실제 배치가 같은 숫자를 보게 하려고 한곳에서 만든다.
 */
function getVariantMetrics(design: Pick<BubbleSideDesignSpec, "preset" | "bodyScale"> & CanvasScaleSource, variant: BubbleBuilderVariant) {
  const source = variantPresets[variant];
  const canvasScale = getBubbleCanvasScale(design);
  const bodyScale = clamp(design.bodyScale ?? 1, bubbleBodyScaleRange.min, bubbleBodyScaleRange.max);
  const canvasWidth = Math.round(source.width * canvasScale.x);
  const canvasHeight = Math.round(source.height * canvasScale.y);
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
