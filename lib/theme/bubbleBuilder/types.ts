import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

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

export type BubbleBuilderWarningCode = "content-too-small" | "decoration-overlap";

export type BubbleBuilderWarning = {
  code: BubbleBuilderWarningCode;
  message: string;
};

export type GeneratedBubbleAsset = {
  platform: ThemePlatform;
  role: ThemeResourceRole;
  variant: BubbleBuilderVariant;
  file: File;
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
