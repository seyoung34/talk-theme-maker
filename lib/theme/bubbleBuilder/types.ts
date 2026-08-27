import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

export type BubbleBuilderSide = "me" | "you";
export type BubbleBuilderVariant = "first" | "group";
export type BubbleShapePreset = "square" | "rounded" | "capsule" | "circle";

export type BubbleDecorationTransform = {
  offsetX: number;
  offsetY: number;
  scale: number;
  flipX: boolean;
  rotation?: number;
};

// 장식 레이어. id는 원본 파일(BubbleDecorationSources)의 key로도 쓴다.
export type BubbleDecorationLayer = BubbleDecorationTransform & {
  id: string;
  sourceName?: string;
};

/**
 * 원본 안에서 불투명한 픽셀이 차지하는 비율 사각형(0~1). 투명 여백을 뺀 "실제 그림"의 자리다.
 *
 * 저장하지 않는다. 원본 파일에서 그때그때 다시 잰다 — 파일이 곧 진실이고, 저장해 두면
 * 원본을 바꿨을 때 옛 값이 남는다.
 */
export type BubbleDecorationContentBox = { x: number; y: number; width: number; height: number };

export type BubbleSideDesignSpec = {
  side: BubbleBuilderSide;
  preset: BubbleShapePreset;
  radius: number;
  fill: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  syncTextColorOnApply: boolean;
  bodyOffsetX?: number;
  bodyOffsetY?: number;
  /** 말풍선 본체 크기 배율. 1이 기본이며 코너(늘어나지 않는 구간)의 두께를 정한다. */
  bodyScale?: number;
  /** 캔버스(내보내는 PNG) 가로 픽셀. 본체 바깥에 장식이 놓일 여백을 정한다. */
  canvasWidth?: number;
  /** 캔버스(내보내는 PNG) 세로 픽셀. 가로와 따로 움직여 직사각형 프레임을 만들 수 있다. */
  canvasHeight?: number;
  /** @deprecated 가로·세로를 함께 늘리던 시절 필드. 읽기 호환용이다. */
  canvasScale?: number;
  /** @deprecated 배율로 저장하던 시절 필드. 읽기 호환용이며 새 저장은 픽셀을 쓴다. */
  canvasScaleX?: number;
  /** @deprecated 배율로 저장하던 시절 필드. 읽기 호환용이며 새 저장은 픽셀을 쓴다. */
  canvasScaleY?: number;
  /** @deprecated 단일 장식 시절 필드. 읽기 호환용이며 새 저장은 decorations를 사용한다. */
  decoration?: BubbleDecorationTransform;
  decorations?: BubbleDecorationLayer[];
};

export type BubbleFamilyDesignSpec = {
  version: 1;
  familyId: string;
  presetVersion: "bubble-builder-v1";
  side: BubbleBuilderSide;
  design: BubbleSideDesignSpec;
  decorationSourceName?: string;
  createdAt: number;
  updatedAt: number;
};

export type BubbleDesigns = Partial<Record<ThemeResourceRole, BubbleFamilyDesignSpec>>;
export type BubbleDecorationSources = Partial<Record<string, File>>;

export type BubbleRect = { x: number; y: number; width: number; height: number };

export type BubbleVariantGeometry = {
  canvas: { width: number; height: number };
  body: BubbleRect;
  content: BubbleRect;
  stretch: StretchPoint;
  radius: number;
};

export type BubbleBuilderWarningCode = "content-too-small" | "decoration-overlap" | "decoration-stretch";

export type BubbleBuilderWarning = {
  code: BubbleBuilderWarningCode;
  message: string;
};

export type GeneratedBubbleAsset = {
  platform: ThemePlatform;
  role: ThemeResourceRole;
  variant: BubbleBuilderVariant;
  file: File;
  /** 공통 편집기에서 다시 열 수 있는 artwork 기준 geometry. */
  geometry?: BubbleGeometry;
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
};

export type GeneratedBubbleFamily = {
  spec: BubbleFamilyDesignSpec;
  assets: GeneratedBubbleAsset[];
  warnings: BubbleBuilderWarning[];
};

export type GeneratedBubbleDesign = {
  spec: BubbleFamilyDesignSpec;
  asset: GeneratedBubbleAsset;
  warnings: BubbleBuilderWarning[];
};
